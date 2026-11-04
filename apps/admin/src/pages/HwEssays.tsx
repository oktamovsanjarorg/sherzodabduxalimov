import { ESSAY_MAX_SCORE, type AdminHwEssay, type EssayReviewView } from "@onatili/shared";
import { RubricForm, emptyRubric, rubricComplete, rubricTotal, type RubricValue } from "../components/RubricForm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ImageOff, Phone } from "lucide-react";
import { useState } from "react";
import { Badge, Empty, Modal, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/** Qo'lyozma esselar: o'quvchi varoq rasmlarini yuklagan va ustoz tekshiruvi uchun to'lagan */
export function HwEssays() {
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const [open, setOpen] = useState<AdminHwEssay | null>(null);
  const list = useQuery({ queryKey: ["hw-essays", tab], queryFn: () => api.hwEssays(tab), refetchInterval: tab === "pending" ? 30_000 : false });
  return (
    <>
      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm font-bold">
        {([["pending", `Tekshirilmagan${tab === "pending" && list.data?.length ? ` (${list.data.length})` : ""}`], ["reviewed", "Tekshirilgan"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-brand text-white" : "text-slate-600"}`}>
            {l}
          </button>
        ))}
      </div>
      {list.isPending && <Spinner className="text-slate-400" />}
      {list.data?.length === 0 && (
        <Empty title={tab === "pending" ? "Tekshiriladigan esse yo'q" : "Hali esse tekshirilmagan"} hint={tab === "pending" ? "To'lovi tasdiqlangan esselar shu yerga tushadi." : undefined} />
      )}
      <div className="space-y-2">
        {list.data?.map((e) => {
          const t = e.reviews.find((r) => r.source === "TEACHER");
          return (
            <button key={e.id} onClick={() => setOpen(e)} className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-brand">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{e.student.name}</p>
                <p className="truncate text-xs text-slate-500">
                  «{e.prompt}» · {e.pages} varoq · {new Date(e.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {t ? <Badge tone="green">{fmt(t.totalScore)}/{ESSAY_MAX_SCORE}</Badge> : <Badge tone="amber">Kutmoqda</Badge>}
              <ChevronRight size={18} className="text-slate-400" />
            </button>
          );
        })}
      </div>
      {open && <ReviewModal essay={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function PageImage({ id, n }: { id: string; n: number }) {
  const [zoom, setZoom] = useState(false);
  const img = useQuery({ queryKey: ["essay-page", id, n], queryFn: () => api.essayPage(id, n), staleTime: Infinity, gcTime: 10 * 60_000 });
  if (img.isPending) return <div className="flex h-64 items-center justify-center rounded-xl bg-slate-100"><Spinner className="text-slate-400" /></div>;
  if (!img.data) return <div className="flex h-24 items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm text-slate-500"><ImageOff size={16} /> Rasm yuklanmadi</div>;
  return (
    <>
      <button onClick={() => setZoom(true)} className="block w-full overflow-hidden rounded-xl bg-slate-100" title="Kattalashtirish">
        <img src={img.data} alt={`${n + 1}-varoq`} className="mx-auto max-h-[70vh] object-contain" />
      </button>
      {zoom && (
        <div className="fixed inset-0 z-[60] overflow-auto bg-black/90 p-2" onClick={() => setZoom(false)}>
          <img src={img.data} alt="" className="mx-auto max-w-none sm:max-w-full" />
        </div>
      )}
    </>
  );
}

function AiHint({ r }: { r: EssayReviewView }) {
  return (
    <details className="rounded-lg bg-sky-50 p-3 text-sm">
      <summary className="cursor-pointer font-bold text-sky-900">
        AI bahosi (taxminiy): {fmt(r.totalScore)}/{r.maxScore}
        {r.special ? ` · ${r.special.label}` : ""}
      </summary>
      <ul className="mt-2 space-y-1 text-sky-900">
        {r.criteria.map((c) => (
          <li key={c.key}>
            <b>{c.label}:</b> {fmt(c.score)}/{c.max} {c.comment && <span className="text-sky-800/80">— {c.comment}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function ReviewModal({ essay, onClose }: { essay: AdminHwEssay; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const prev = essay.reviews.find((r) => r.source === "TEACHER");
  const ai = essay.reviews.find((r) => r.source === "AI");
  const [rubric, setRubric] = useState<RubricValue>(() =>
    prev
      ? { special: (prev.special?.key as RubricValue["special"]) ?? null, scores: Object.fromEntries(prev.criteria.map((c) => [c.key, c.score])) }
      : emptyRubric(),
  );
  const [feedback, setFeedback] = useState(prev?.feedback ?? "");
  const total = rubricTotal(rubric);

  const save = useMutation({
    mutationFn: () =>
      api.reviewHwEssay(essay.id, {
        special: rubric.special,
        criteria: Object.entries(rubric.scores).map(([key, score]) => ({ key, score: score ?? 0, comment: null })),
        feedback: feedback.trim() || null,
      }),
    onSuccess: (r) => {
      toast(`Saqlandi: ${fmt(r.totalScore)}/${ESSAY_MAX_SCORE}. O'quvchiga yuborildi`);
      qc.invalidateQueries({ queryKey: ["hw-essays"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });

  return (
    <Modal
      wide
      title={essay.student.name}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto self-center text-sm font-bold">
            Jami: {fmt(total)} / {ESSAY_MAX_SCORE}
          </span>
          <button className="btn-secondary" onClick={onClose}>
            Yopish
          </button>
          <button className="btn-primary" disabled={!rubricComplete(rubric) || save.isPending} onClick={() => save.mutate()}>
            {prev ? "Qayta baholash" : "Baholash va yuborish"}
          </button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <p className="text-sm">
            <span className="text-slate-500">Mavzu:</span> <b>{essay.prompt}</b>
            {essay.student.phone && (
              <a href={`tel:${essay.student.phone}`} className="ml-3 inline-flex items-center gap-1 text-xs font-semibold text-brand">
                <Phone size={12} /> {essay.student.phone}
              </a>
            )}
          </p>
          {Array.from({ length: essay.pages }, (_, n) => (
            <div key={n}>
              <p className="mb-1 text-xs font-bold text-slate-400">{n + 1}-varoq</p>
              <PageImage id={essay.id} n={n} />
            </div>
          ))}
          {essay.text && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{essay.text}</p>}
          {ai && <AiHint r={ai} />}
        </div>
        <div className="space-y-3">
          <RubricForm value={rubric} onChange={setRubric} aiHint={ai ? Object.fromEntries(ai.criteria.map((c) => [c.key, c.score])) : undefined} />
          <textarea
            className="input min-h-[100px] py-2 text-sm"
            placeholder="Taqriz: umumiy xulosa va maslahat (o'quvchiga boradi)"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
