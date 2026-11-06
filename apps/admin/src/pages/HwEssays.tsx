import { ESSAY_MAX_SCORE, countMarks, type AdminHwEssay, type EssayAnnotations, type EssayReviewView, type PageAnnotations, formatScore } from "@onatili/shared";
import { AnnotationOverlay, MarkCounts, PageAnnotator } from "../components/Annotate";
import { RubricForm, emptyRubric, rubricComplete, rubricTotal, type RubricValue } from "../components/RubricForm";
import { VoicePlayer, VoiceRecorder } from "../components/VoiceRecorder";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ImageOff, Pencil, Phone } from "lucide-react";
import { useState } from "react";
import { Badge, Empty, Modal, Spinner, Chips } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { fmtShortDateTime } from "../lib/format";
import { useToast } from "../lib/toast";


/** Qo'lyozma esselar: o'quvchi varoq rasmlarini yuklagan va ustoz tekshiruvi uchun to'lagan */
export function HwEssays() {
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const [open, setOpen] = useState<AdminHwEssay | null>(null);
  const list = useQuery({ queryKey: ["hw-essays", tab], queryFn: () => api.hwEssays(tab), refetchInterval: tab === "pending" ? 30_000 : false });
  return (
    <>
      <Chips
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[["pending", `Tekshirilmagan${tab === "pending" && list.data?.length ? ` (${list.data.length})` : ""}`], ["reviewed", "Tekshirilgan"]] as const}
      />
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
                  «{e.prompt}» · {e.pages} varoq · {fmtShortDateTime(e.createdAt)}
                </p>
              </div>
              {t ? <Badge tone="green">{formatScore(t.totalScore)}/{ESSAY_MAX_SCORE}</Badge> : <Badge tone="amber">Kutmoqda</Badge>}
              <ChevronRight size={18} className="text-slate-400" />
            </button>
          );
        })}
      </div>
      {open && <ReviewModal essay={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function PageImage({ id, n, anno, onSave }: { id: string; n: number; anno: PageAnnotations; onSave: (a: PageAnnotations) => Promise<void> }) {
  const [edit, setEdit] = useState<PageAnnotations | null>(null);
  const [ratio, setRatio] = useState(1.4);
  const [saving, setSaving] = useState(false);
  const img = useQuery({ queryKey: ["essay-page", id, n], queryFn: () => api.essayPage(id, n), staleTime: Infinity, gcTime: 10 * 60_000 });
  if (img.isPending) return <div className="flex h-64 items-center justify-center rounded-xl bg-slate-100"><Spinner className="text-slate-400" /></div>;
  if (!img.data) return <div className="flex h-24 items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm text-slate-500"><ImageOff size={16} /> Rasm yuklanmadi</div>;
  const marks = anno.marks.length + anno.strokes.length;
  return (
    <>
      <div className="relative overflow-hidden rounded-xl bg-slate-100">
        <div className="relative mx-auto w-full max-w-[640px]">
          <img src={img.data} alt={`${n + 1}-varoq`} className="block w-full" onLoad={(e) => setRatio(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth || 1.4)} />
          <AnnotationOverlay a={anno} ratio={ratio} />
        </div>
        <button className="btn-primary btn-sm absolute right-2 top-2 shadow" onClick={() => setEdit(anno)}>
          <Pencil size={13} /> Belgilash{marks ? ` (${anno.marks.length})` : ""}
        </button>
      </div>
      {edit && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-white p-3" style={{ paddingTop: "max(12px, env(safe-area-inset-top, 0px))" }}>
          <div className="mb-2 flex items-center gap-2">
            <p className="flex-1 font-extrabold">{n + 1}-varoqni belgilash</p>
            <button className="btn-secondary btn-sm" onClick={() => setEdit(null)}>
              Bekor qilish
            </button>
            <button
              className="btn-primary btn-sm"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onSave(edit);
                  setEdit(null);
                } finally {
                  setSaving(false);
                }
              }}
            >
              Saqlash
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <PageAnnotator src={img.data} value={edit} onChange={setEdit} />
          </div>
        </div>
      )}
    </>
  );
}

const countMarksTotal = (a: EssayAnnotations) => Object.values(countMarks(a)).reduce((x, y) => x + y, 0);

function AiHint({ r }: { r: EssayReviewView }) {
  return (
    <details className="rounded-lg bg-sky-50 p-3 text-sm">
      <summary className="cursor-pointer font-bold text-sky-900">
        AI bahosi (taxminiy): {formatScore(r.totalScore)}/{r.maxScore}
        {r.special ? ` · ${r.special.label}` : ""}
      </summary>
      <ul className="mt-2 space-y-1 text-sky-900">
        {r.criteria.map((c) => (
          <li key={c.key}>
            <b>{c.label}:</b> {formatScore(c.score)}/{c.max} {c.comment && <span className="text-sky-800/80">— {c.comment}</span>}
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
  const [voice, setVoice] = useState<Blob | null>(null);
  const [anno, setAnno] = useState<EssayAnnotations>(() => ({
    pages: Array.from({ length: essay.pages }, (_, i) => essay.annotations?.pages[i] ?? { strokes: [], marks: [] }),
    text: essay.annotations?.text ?? [],
  }));
  const savePage = async (n: number, page: PageAnnotations) => {
    const next = { ...anno, pages: anno.pages.map((p, i) => (i === n ? page : p)) };
    try {
      await api.saveHwAnnotations(essay.id, next);
      setAnno(next);
      qc.invalidateQueries({ queryKey: ["hw-essays"] });
      toast("Belgilar saqlandi");
    } catch (e) {
      toast(errMsg(e), "error");
      throw e;
    }
  };
  const total = rubricTotal(rubric);
  const sendVoice = useMutation({
    mutationFn: () => api.uploadHwVoice(essay.id, voice!),
    onSuccess: () => {
      toast("Ovozli izoh yuborildi");
      setVoice(null);
      qc.invalidateQueries({ queryKey: ["hw-essays"] });
    },
    onError: (e) => toast(errMsg(e), "error"),
  });

  const save = useMutation({
    mutationFn: () =>
      api.reviewHwEssay(essay.id, {
        special: rubric.special,
        criteria: Object.entries(rubric.scores).map(([key, score]) => ({ key, score: score ?? 0, comment: null })),
        feedback: feedback.trim() || null,
      }),
    onSuccess: async (r) => {
      // Ovozli izoh baholash saqlangandan keyin yuboriladi (server shuni talab qiladi)
      if (voice) await api.uploadHwVoice(essay.id, voice).catch((e) => toast(`Baho saqlandi, lekin ovoz yuborilmadi: ${errMsg(e)}`, "error"));
      toast(`Saqlandi: ${formatScore(r.totalScore)}/${ESSAY_MAX_SCORE}${voice ? " · ovozli izoh bilan" : ""}. O'quvchiga yuborildi`);
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
            Jami: {formatScore(total)} / {ESSAY_MAX_SCORE}
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
              <PageImage id={essay.id} n={n} anno={anno.pages[n]} onSave={(p) => savePage(n, p)} />
            </div>
          ))}
          {essay.text && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{essay.text}</p>}
          {ai && <AiHint r={ai} />}
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Belgilangan xatolar</p>
            <MarkCounts counts={countMarks(anno)} />
            {ai?.annotations && ai.annotations.pages.some((p) => p.marks.length) && (
              <button
                className="btn-secondary btn-sm mt-2"
                onClick={async () => {
                  // AI belgilari ustozning mavjud belgilari ustiga qo'shiladi; keyin keraksizini o'chirish mumkin
                  const next = {
                    ...anno,
                    pages: anno.pages.map((p, i) => {
                      const a = ai.annotations!.pages[i];
                      return a ? { strokes: [...p.strokes, ...a.strokes], marks: [...p.marks, ...a.marks] } : p;
                    }),
                  };
                  try {
                    await api.saveHwAnnotations(essay.id, next);
                    setAnno(next);
                    toast(`AI belgilari qo'shildi (${countMarksTotal(ai.annotations!)} ta). Keraksizini o'chirg'ich bilan olib tashlang`);
                  } catch (e) {
                    toast(errMsg(e), "error");
                  }
                }}
              >
                🤖 AI belgilarini olish ({countMarksTotal(ai.annotations)} ta)
              </button>
            )}
            <p className="mt-1.5 text-[11px] text-slate-400">Mezondagi "1–2 o'rinda", "3–4 o'rinda" bandlarini shunga qarab qo'ying. Bir xil xato takrorlansa — bitta.</p>
          </div>
          <RubricForm value={rubric} onChange={setRubric} aiHint={ai ? Object.fromEntries(ai.criteria.map((c) => [c.key, c.score])) : undefined} />
          <textarea
            className="input min-h-[100px] py-2 text-sm"
            placeholder="Taqriz: umumiy xulosa va maslahat (o'quvchiga boradi)"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          {essay.voice && !voice && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-1 text-xs font-bold text-slate-500">Yuborilgan ovozli izoh</p>
              <VoicePlayer voice={essay.voice} />
            </div>
          )}
          <VoiceRecorder value={voice} onChange={setVoice} />
          {prev && voice && (
            <button className="btn-secondary btn-sm" disabled={sendVoice.isPending} onClick={() => sendVoice.mutate()}>
              Bahoni o'zgartirmasdan faqat ovozni yuborish
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
