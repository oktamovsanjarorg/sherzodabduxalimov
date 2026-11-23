import type { AnnounceRow, AnnounceStats, AnnounceStatus } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { Clock, FileEdit, ImageIcon, Megaphone, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Chips, Empty, PageHeader, Spinner } from "../components/ui";
import { errMsg } from "../lib/api";
import { announceApi } from "../lib/announce-api";
import { fmtShortDateTime, plainText } from "../lib/format";

type Tab = "all" | AnnounceStatus;
export const STATUS: Record<AnnounceStatus, { label: string; tone: "gray" | "amber" | "green" }> = {
  DRAFT: { label: "Qoralama", tone: "gray" },
  SCHEDULED: { label: "Rejalashtirilgan", tone: "amber" },
  SENT: { label: "Yuborilgan", tone: "green" },
};

/** E'lonlar ro'yxati: rejalashtirilganlar tepada, keyin yuborilganlar natijasi bilan */
export function AnnouncementsPage() {
  const [tab, setTab] = useState<Tab>("all");
  const list = useQuery({
    queryKey: ["announcements"],
    queryFn: announceApi.list,
    // Yuborilayotgan yoki vaqti kelayotgan e'lon bo'lsa, natija o'zi yangilanadi
    refetchInterval: (q) => (q.state.data?.some((a) => a.status === "SCHEDULED" || a.stats.pending > 0) ? 4000 : false),
  });
  const rows = list.data ?? [];
  const count = (s: AnnounceStatus) => rows.filter((a) => a.status === s).length;
  const shown = rows.filter((a) => tab === "all" || a.status === tab).sort((a, b) => order(a) - order(b));

  return (
    <>
      <PageHeader
        title="E'lonlar"
        subtitle="O'quvchilar, ota-onalar yoki xodimlarga bot orqali xabar: guruh bo'yicha, vaqt belgilab, natijasini kuzatib"
        actions={
          <Link to="/announcements/new" className="btn-primary">
            <Plus size={16} /> Yangi e'lon
          </Link>
        }
      />
      {list.isPending && <Spinner className="text-ink-4" />}
      {list.isError && <p className="text-sm text-red-600">{errMsg(list.error)}</p>}
      {list.data && rows.length === 0 && (
        <Empty
          Icon={Megaphone}
          title="Hali e'lon yo'q"
          hint="Masalan: «Ertaga dars bo'lmaydi» — bitta guruhga yoki hammaga, ota-onalarga ham. Har kimga ismi bilan boradi."
          action={
            <Link to="/announcements/new" className="btn-primary">
              <Plus size={16} /> Birinchi e'lon
            </Link>
          }
        />
      )}
      {rows.length > 0 && (
        <>
          <Chips
            className="mb-3"
            value={tab}
            onChange={setTab}
            options={[
              ["all", `Hammasi ${rows.length}`],
              ["SCHEDULED", `Rejalashtirilgan ${count("SCHEDULED")}`],
              ["DRAFT", `Qoralama ${count("DRAFT")}`],
              ["SENT", `Yuborilgan ${count("SENT")}`],
            ]}
          />
          {shown.length === 0 ? (
            <p className="px-1 text-sm text-ink-3">Bu bo'limda e'lon yo'q</p>
          ) : (
            <ul className="card divide-y divide-line p-0">
              {shown.map((a) => (
                <li key={a.id}>
                  <Row a={a} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

const order = (a: AnnounceRow) => (a.status === "SCHEDULED" ? 0 : a.status === "DRAFT" ? 1 : 2);

function Row({ a }: { a: AnnounceRow }) {
  const s = STATUS[a.status];
  const to = a.status === "DRAFT" ? `/announcements/${a.id}/edit` : `/announcements/${a.id}`;
  return (
    <Link to={to} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
        {a.status === "SCHEDULED" ? <Clock size={17} /> : a.status === "DRAFT" ? <FileEdit size={17} /> : <Megaphone size={17} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 truncate font-bold">{a.title || plainText(a.text).slice(0, 80)}</p>
          <Badge tone={s.tone}>{s.label}</Badge>
          {a.hasPhoto && <ImageIcon size={14} className="text-ink-4" aria-label="Rasm bilan" />}
          {a.recalledAt && <Badge tone="red">Qaytarib olingan</Badge>}
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-3">
          {a.audienceLabel} ·{" "}
          {a.status === "SCHEDULED" && a.scheduledAt
            ? `${fmtShortDateTime(a.scheduledAt)} da yuboriladi`
            : a.sentAt
              ? fmtShortDateTime(a.sentAt)
              : `yozildi ${fmtShortDateTime(a.createdAt)}`}
        </p>
        {a.status === "SENT" && <StatsLine s={a.stats} />}
      </div>
    </Link>
  );
}

export function StatsLine({ s }: { s: AnnounceStats }) {
  const pct = s.total ? Math.round((s.sent / s.total) * 100) : 0;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
      <span className="text-emerald-700">✓ {s.sent} yetdi</span>
      {s.pending > 0 && <span className="text-sky-700">{s.pending} navbatda</span>}
      {s.blocked > 0 && <span className="text-amber-700">{s.blocked} botni bloklagan</span>}
      {s.failed > 0 && <span className="text-red-700">{s.failed} xato</span>}
      {s.deleted > 0 && <span className="text-ink-3">{s.deleted} o'chirildi</span>}
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3" aria-label={`${pct}%`}>
        <span className="block h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}
