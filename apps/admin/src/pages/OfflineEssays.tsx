import { OFFLINE_ESSAY_MAX_PAGES, OFFLINE_ESSAY_STATUS_LABELS, formatScore, type OfflineEssayRow, type OfflineEssayTestDetail } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ChevronRight, ClipboardList, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge, Empty, Spinner } from "../components/ui";
import { errMsg } from "../lib/api";
import { fmtDate } from "../lib/format";
import { offlineApi } from "../lib/offline-essay-api";
import { useToast } from "../lib/toast";
import { OfflineEssayReview } from "./OfflineEssayReview";

const TONE = { NONE: "gray", DRAFT: "blue", CHECKING: "amber", CHECKED: "brand", FAILED: "red" } as const;

/** Esselar → Offline: qog'ozda o'tkazilgan testning yozma ishlari. AI taxminiy baho beradi, ballni ustoz tasdiqlaydi */
export function OfflineEssays() {
  const tests = useQuery({ queryKey: ["offline-essay-tests"], queryFn: offlineApi.tests });
  const [picked, setPicked] = useState<string | null>(null);
  if (tests.isPending) return <Spinner className="text-ink-4" />;
  if (tests.isError) return <p className="text-sm text-red-600">{errMsg(tests.error)}</p>;
  if (!tests.data.length)
    return (
      <Empty
        Icon={ClipboardList}
        title="Milliy sertifikat shaklidagi offline test yo'q"
        hint="Avval «Baholash → Offline testlar»da test natijalarini yuklang."
      />
    );
  const id = picked ?? tests.data[0].id;
  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="offline-test">
          Test
        </label>
        <select id="offline-test" className="input" value={id} onChange={(e) => setPicked(e.target.value)}>
          {tests.data.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
              {t.takenAt ? ` · ${fmtDate(t.takenAt)}` : ""} — {t.confirmed}/{t.total} baholangan
            </option>
          ))}
        </select>
      </div>
      <TestEssays key={id} testId={id} />
    </div>
  );
}

function TestEssays({ testId }: { testId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const t = useQuery({
    queryKey: ["offline-essays", testId],
    queryFn: () => offlineApi.test(testId),
    // AI ishlayotgan bo'lsa holat o'zi yangilanib tursin
    refetchInterval: (q) => (q.state.data?.rows.some((r) => r.status === "CHECKING") ? 5000 : false),
  });
  const refresh = () => (
    qc.removeQueries({ queryKey: ["offline-essay-page"] }),
    qc.invalidateQueries({ queryKey: ["offline-essays", testId] }),
    qc.invalidateQueries({ queryKey: ["offline-essay-tests"] })
  );
  const check = useMutation({
    mutationFn: () => offlineApi.check(testId),
    onSuccess: (r) => (toast(r.queued ? `${r.queued} ta esse AI'ga yuborildi` : "Yuboriladigan yangi esse yo'q"), refresh()),
    onError: (e) => toast(errMsg(e), "error"),
  });
  if (t.isPending) return <Spinner className="text-ink-4" />;
  if (t.isError) return <p className="text-sm text-red-600">{errMsg(t.error)}</p>;
  const d = t.data;
  const ready = d.rows.filter((r) => r.pages > 0 && (r.status === "DRAFT" || r.status === "FAILED")).length;
  const count = (f: (r: OfflineEssayRow) => boolean) => d.rows.filter(f).length;
  return (
    <>
      <PromptCard d={d} onSaved={refresh} />
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <p className="min-w-0 flex-1 text-sm text-ink-2">
          {d.rows.length} o'quvchi · varoqli {count((r) => r.pages > 0)} · AI baholagan {count((r) => r.status === "CHECKED")} · tasdiqlangan{" "}
          {count((r) => r.essayScore != null)}
        </p>
        <button
          className="btn-primary w-full sm:w-auto"
          disabled={!ready || !d.essayPrompt || !d.aiEnabled || check.isPending}
          onClick={() => check.mutate()}
          title={!d.aiEnabled ? "AI tekshiruvi serverda o'chirilgan" : !d.essayPrompt ? "Avval mavzuni yozing" : undefined}
        >
          <Sparkles size={16} /> AI'ga yuborish{ready ? ` (${ready})` : ""}
        </button>
      </div>
      <p className="text-xs text-ink-3">
        Har o'quvchining varag'ini suratga oling (ko'pi bilan {OFFLINE_ESSAY_MAX_PAGES} ta), keyin «AI'ga yuborish»ni bosing. AI bahosi taxminiy: ball faqat siz
        tasdiqlaganingizda natijaga yoziladi.
      </p>
      <div className="card divide-y divide-line overflow-hidden">
        {d.rows.map((r) => (
          <Row key={r.resultId} r={r} onOpen={() => setOpen(r.resultId)} onChanged={refresh} />
        ))}
      </div>
      {open && <OfflineEssayReview resultId={open} onClose={() => setOpen(null)} onChanged={refresh} />}
    </>
  );
}

function PromptCard({ d, onSaved }: { d: OfflineEssayTestDetail; onSaved: () => void }) {
  const toast = useToast();
  const [edit, setEdit] = useState(!d.essayPrompt);
  const [text, setText] = useState(d.essayPrompt ?? "");
  const save = useMutation({
    mutationFn: () => offlineApi.setPrompt(d.id, text),
    onSuccess: () => (toast("Mavzu saqlandi"), setEdit(false), onSaved()),
    onError: (e) => toast(errMsg(e), "error"),
  });
  if (!edit)
    return (
      <div className="card flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="label mb-1">Esse mavzusi</p>
          <p className="line-clamp-3 whitespace-pre-line text-sm">{d.essayPrompt}</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => setEdit(true)}>
          O'zgartirish
        </button>
      </div>
    );
  return (
    <div className="card space-y-2 p-4">
      <label className="label" htmlFor="offline-prompt">
        Esse mavzusi (vaziyat matni)
      </label>
      <textarea id="offline-prompt" className="input min-h-[110px] py-2" value={text} onChange={(e) => setText(e.target.value)} />
      <p className="text-xs text-ink-3">AI esseni shu mavzuga mosligi va vaziyat matnidan ko'chirilmaganini tekshiradi.</p>
      <div className="flex gap-2">
        <button className="btn-primary btn-sm" disabled={text.trim().length < 10 || save.isPending} onClick={() => save.mutate()}>
          Saqlash
        </button>
        {d.essayPrompt && (
          <button className="btn-ghost btn-sm" onClick={() => (setText(d.essayPrompt ?? ""), setEdit(false))}>
            Bekor qilish
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ r, onOpen, onChanged }: { r: OfflineEssayRow; onOpen: () => void; onChanged: () => void }) {
  const toast = useToast();
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const f of files.slice(0, OFFLINE_ESSAY_MAX_PAGES - r.pages)) await offlineApi.addPage(r.resultId, f);
    },
    onSuccess: onChanged,
    onError: (e) => (toast(errMsg(e), "error"), onChanged()),
  });
  const full = r.pages >= OFFLINE_ESSAY_MAX_PAGES || r.status === "CHECKING";
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <button className="flex min-w-0 flex-1 basis-48 items-center gap-2 text-left" onClick={onOpen} disabled={r.status === "NONE"}>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{r.student?.name ?? r.name}</span>
          <span className="block text-xs text-ink-3">
            {r.pages ? `${r.pages} varoq` : "varoq yo'q"}
            {r.aiTotal != null && ` · AI: ${formatScore(r.aiTotal)}/24 (taxminiy)`}
            {r.error && ` · ${r.error}`}
          </span>
        </span>
        {r.status !== "NONE" && <ChevronRight size={16} className="shrink-0 text-ink-4" />}
      </button>
      {r.essayScore != null ? (
        <Badge tone="green">{formatScore(r.essayScore)}/24</Badge>
      ) : (
        <Badge tone={TONE[r.status]}>{OFFLINE_ESSAY_STATUS_LABELS[r.status]}</Badge>
      )}
      <label className={`btn-secondary btn-sm ${full || upload.isPending ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
        {upload.isPending ? <Spinner /> : <Camera size={14} />} Varoq
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={full || upload.isPending}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) upload.mutate(files);
          }}
        />
      </label>
    </div>
  );
}
