import { ANNOUNCE_ROLE_LABELS, type AnnounceDetail, type DeliveryStatusName } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BellOff, Copy, Pencil, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TelegramPreview } from "../components/announce/TelegramPreview";
import { Badge, Chips, ConfirmButton, PageHeader, SearchBox, Spinner } from "../components/ui";
import { errMsg } from "../lib/api";
import { announceApi } from "../lib/announce-api";
import { fmtDateTime, fmtShortDateTime, plainText } from "../lib/format";
import { useToast } from "../lib/toast";
import { STATUS } from "./AnnouncementsPage";

const DELIVERY: Record<DeliveryStatusName, { label: string; tone: "green" | "blue" | "amber" | "red" }> = {
  SENT: { label: "Yetdi", tone: "green" },
  PENDING: { label: "Navbatda", tone: "blue" },
  BLOCKED: { label: "Botni bloklagan", tone: "amber" },
  FAILED: { label: "Xato", tone: "red" },
};

/** Yuborilgan e'lon: natija (kimga yetdi, kim bloklagan), qayta yuborish, qaytarib olish, nusxa */
export function AnnounceDetailPage() {
  const { id } = useParams();
  const q = useQuery({
    queryKey: ["announcement", id],
    queryFn: () => announceApi.get(id!),
    refetchInterval: (s) => (s.state.data && (s.state.data.status === "SCHEDULED" || s.state.data.stats.pending > 0) ? 3000 : false),
  });
  if (q.isPending) return <Spinner className="text-ink-4" />;
  if (q.isError) return <p className="text-sm text-red-600">{errMsg(q.error)}</p>;
  return <Detail a={q.data} />;
}

function Detail({ a }: { a: AnnounceDetail }) {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [photo, setPhoto] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | DeliveryStatusName>("all");
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (a.photoFileId) announceApi.photoUrl(a.photoFileId).then(setPhoto, () => setPhoto(null));
  }, [a.photoFileId]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["announcement", a.id] });
    qc.invalidateQueries({ queryKey: ["announcements"] });
  };
  const useAct = <T,>(fn: () => Promise<T>, ok: (r: T) => string) =>
    useMutation({
      mutationFn: fn,
      onSuccess: (r) => (toast(ok(r)), refresh()),
      onError: (e) => toast(errMsg(e), "error"),
    });
  const retry = useAct(
    () => announceApi.retry(a.id),
    (r) => `${r.queued} kishiga qayta yuborilmoqda`,
  );
  const recall = useAct(
    () => announceApi.recall(a.id),
    (r) => `${r.queued} kishidan o'chirilmoqda`,
  );
  const cancel = useAct(
    () => announceApi.cancel(a.id),
    () => "Bekor qilindi: qoralamaga qaytdi",
  );
  const copy = useMutation({
    mutationFn: () => announceApi.duplicate(a.id),
    onSuccess: (c) => navigate(`/announcements/${c.id}/edit`),
    onError: (e) => toast(errMsg(e), "error"),
  });
  const remove = useMutation({
    mutationFn: () => announceApi.remove(a.id),
    onSuccess: () => (toast("O'chirildi"), qc.invalidateQueries({ queryKey: ["announcements"] }), navigate("/announcements")),
    onError: (e) => toast(errMsg(e), "error"),
  });

  const s = a.stats;
  const rows = a.recipients.filter((r) => (filter === "all" || r.status === filter) && (!search || `${r.name} ${r.username ?? ""}`.toLowerCase().includes(search.toLowerCase())));
  const cnt = (k: DeliveryStatusName) => a.recipients.filter((r) => r.status === k).length;

  return (
    <>
      <Link to="/announcements" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-ink-3 hover:text-ink">
        <ArrowLeft size={15} /> E'lonlar
      </Link>
      <PageHeader
        title={a.title || plainText(a.text.split("\n")[0]).slice(0, 50) || "E'lon"}
        subtitle={`${a.audienceLabel} · ${a.sentAt ? `yuborildi ${fmtDateTime(a.sentAt)}` : a.scheduledAt ? `${fmtDateTime(a.scheduledAt)} da yuboriladi` : "qoralama"}${a.author ? ` · ${a.author}` : ""}`}
        actions={
          <>
            {a.status !== "SENT" && (
              <Link to={`/announcements/${a.id}/edit`} className="btn-secondary">
                <Pencil size={16} /> Tahrirlash
              </Link>
            )}
            {a.status === "SCHEDULED" && (
              <button className="btn-secondary" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                Bekor qilish
              </button>
            )}
            {s.failed > 0 && (
              <button className="btn-secondary" disabled={retry.isPending} onClick={() => retry.mutate()}>
                <RotateCcw size={16} /> Xatolarga qayta ({s.failed})
              </button>
            )}
            {a.canRecall && (
              <ConfirmButton label="Hammaning Telegram'idan o'chirilsinmi?" className="btn-secondary text-red-700" title="Qaytarib olish" onConfirm={() => recall.mutate()}>
                <Undo2 size={16} /> Qaytarib olish
              </ConfirmButton>
            )}
            <button className="btn-secondary" disabled={copy.isPending} onClick={() => copy.mutate()}>
              <Copy size={16} /> Nusxa
            </button>
            <ConfirmButton label="Tarixdan o'chirilsinmi?" className="btn-ghost text-red-600" onConfirm={() => remove.mutate()}>
              <Trash2 size={16} />
            </ConfirmButton>
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {a.status !== "SENT" && (
            <p className="card p-4 text-sm text-ink-3">
              {a.status === "SCHEDULED" ? "Vaqti kelganda yuboriladi: shu paytdagi guruh tarkibi bo'yicha. Natija shu yerda ko'rinadi." : "Qoralama: hali hech kimga yuborilmagan."}
            </p>
          )}
          {a.status === "SENT" && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Jami" value={s.total} />
                <Stat label="Yetdi" value={s.sent} tone="text-emerald-700" />
                <Stat label="Navbatda" value={s.pending} tone="text-sky-700" />
                <Stat label="Bloklagan / xato" value={s.blocked + s.failed} tone={s.blocked + s.failed ? "text-red-700" : undefined} />
              </div>
              {a.recalledAt && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
                  Qaytarib olingan: {fmtDateTime(a.recalledAt)} — {s.deleted} / {s.sent} kishidan o'chirildi
                </p>
              )}
              <section className="card p-0">
                <div className="space-y-2 border-b border-line p-3">
                  <Chips
                    value={filter}
                    onChange={setFilter}
                    options={[
                      ["all", `Hammasi ${a.recipients.length}`],
                      ...(["SENT", "PENDING", "BLOCKED", "FAILED"] as const).filter((k) => cnt(k)).map((k) => [k, `${DELIVERY[k].label} ${cnt(k)}`] as const),
                    ]}
                  />
                  {a.recipients.length > 10 && <SearchBox value={search} onChange={setSearch} placeholder="Ism yoki @username" />}
                </div>
                {a.recipients.length === 0 ? (
                  <p className="p-4 text-sm text-ink-3">{a.status === "SENT" ? "Oluvchilar aniqlanmoqda…" : "Yuborilganda oluvchilar shu yerda ko'rinadi"}</p>
                ) : (
                  <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
                    {rows.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{r.name}</span>
                          <span className="block truncate text-xs text-ink-3">
                            {ANNOUNCE_ROLE_LABELS[r.role as keyof typeof ANNOUNCE_ROLE_LABELS]?.replace(/lar$/, "") ?? r.role}
                            {r.username ? ` · @${r.username}` : ""}
                            {r.sentAt ? ` · ${fmtShortDateTime(r.sentAt)}` : ""}
                            {r.error && r.status !== "SENT" ? ` · ${r.error}` : ""}
                          </span>
                        </span>
                        {r.deleted && <Badge>O'chirildi</Badge>}
                        <Badge tone={DELIVERY[r.status].tone}>{DELIVERY[r.status].label}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center gap-2">
            <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
            {a.silent && (
              <span className="flex items-center gap-1 text-xs text-ink-3">
                <BellOff size={13} /> ovozsiz
              </span>
            )}
          </div>
          <TelegramPreview
            text={a.text}
            photo={photo}
            buttonText={a.buttonText}
            buttonUrl={a.buttonUrl}
            name={(a.recipients.find((r) => r.role === "STUDENT") ?? a.recipients[0])?.name.split(" ")[0]}
          />
        </aside>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="card p-3">
      <p className="text-xs font-bold text-ink-3">{label}</p>
      <p className={`text-2xl font-extrabold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
