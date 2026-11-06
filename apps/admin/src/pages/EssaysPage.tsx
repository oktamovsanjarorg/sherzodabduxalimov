import { countMarks, essayTo75, type AdminEssay, type TextMark, formatScore } from "@onatili/shared";
import { MarkCounts, TextAnnotator } from "../components/Annotate";
import { RubricForm, rubricComplete, rubricTotal, type RubricValue } from "../components/RubricForm";
import { VoicePlayer, VoiceRecorder } from "../components/VoiceRecorder";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge, Empty, Field, Modal, PageHeader, Spinner, Segmented, Chips } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { fmtShortDateTime } from "../lib/format";
import { useToast } from "../lib/toast";
import { HwEssays } from "./HwEssays";


export function EssaysPage() {
  const [source, setSource] = useState<"hw" | "mock">("hw");
  return (
    <>
      <PageHeader
        title="Esselar"
        subtitle={
          source === "hw"
            ? "O'quvchi varoqqa yozib rasmini yuborgan va ustoz tekshiruvi uchun to'lagan esselar. Baho bot orqali o'quvchiga boradi."
            : "Mock testlardagi esselar. Ball qo'yilgach, o'quvchiga umumiy natija va daraja bot orqali yuboriladi."
        }
      />
      <Segmented className="mb-4" value={source} onChange={setSource} options={[["hw", "Qo'lyozma esselar"], ["mock", "Mock esselari"]] as const} />
      {source === "hw" ? <HwEssays /> : <MockEssays />}
    </>
  );
}

function MockEssays() {
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const [open, setOpen] = useState<AdminEssay | null>(null);
  const list = useQuery({ queryKey: ["essays", tab], queryFn: () => api.essays(tab), refetchInterval: tab === "pending" ? 30_000 : false });

  return (
    <>
      <Chips className="mb-4" value={tab} onChange={setTab} options={[["pending", "Tekshirilmagan"], ["reviewed", "Tekshirilgan"]] as const} />
      {list.isPending && <Spinner className="text-slate-400" />}
      {list.data?.length === 0 && <Empty title={tab === "pending" ? "Tekshiriladigan esse yo'q" : "Hali esse tekshirilmagan"} />}
      <div className="space-y-2">
        {list.data?.map((e) => (
          <button key={`${e.attemptId}-${e.questionId}`} onClick={() => setOpen(e)} className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-brand">
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{e.student.name}</p>
              <p className="truncate text-xs text-slate-500">
                {e.testTitle} · {e.words} ta so'z · {fmtShortDateTime(e.submittedAt)}
              </p>
            </div>
            {e.points !== null ? <Badge tone="green">{formatScore(e.points)}/{formatScore(e.maxPoints)}</Badge> : <Badge tone="amber">{formatScore(e.maxPoints)} ball</Badge>}
            <ChevronRight size={18} className="text-slate-400" />
          </button>
        ))}
      </div>
      {open && <ReviewModal essay={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ReviewModal({ essay, onClose }: { essay: AdminEssay; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [points, setPoints] = useState(essay.points !== null ? formatScore(essay.points) : "");
  const [comment, setComment] = useState(essay.reviewComment ?? "");
  // Milliy sertifikat: rasmiy mezon (12 band) bilan baholanadi, ball shundan chiqadi
  const [rubric, setRubric] = useState<RubricValue>(() => ({
    special: (essay.special as RubricValue["special"]) ?? null,
    scores: Object.fromEntries((essay.rubric ?? []).map((c) => [c.key, c.score])),
  }));
  const [voice, setVoice] = useState<Blob | null>(null);
  const [marks, setMarks] = useState<TextMark[]>(essay.textMarks ?? []);
  const value = Number(points.replace(",", "."));
  const valid = essay.milliy ? rubricComplete(rubric) : points.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= essay.maxPoints;

  const save = useMutation({
    mutationFn: async () => {
      // Matndagi belgilar baho bilan birga saqlanadi
      if (essay.milliy) await api.saveMockMarks(essay.attemptId, essay.questionId, marks);
      return api.reviewEssay(
        essay.attemptId,
        essay.questionId,
        essay.milliy
          ? { special: rubric.special, criteria: Object.entries(rubric.scores).map(([key, score]) => ({ key, score: score ?? 0 })), comment: comment.trim() || null }
          : { points: value, comment: comment.trim() || null },
      );
    },
    onSuccess: async (r) => {
      if (voice) await api.uploadMockVoice(essay.attemptId, essay.questionId, voice).catch((e) => toast(`Baho saqlandi, lekin ovoz yuborilmadi: ${errMsg(e)}`, "error"));
      toast(`Saqlandi${voice ? " · ovozli izoh bilan" : ""}. O'quvchiga yuborildi`);
      qc.invalidateQueries({ queryKey: ["essays"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });

  return (
    <Modal
      title={essay.student.name}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Yopish</button>
          <button className="btn-primary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner />} Bahoni saqlash
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <details className="rounded-xl bg-slate-50 p-3 text-sm">
          <summary className="cursor-pointer font-bold text-slate-700">Topshiriq ({essay.testTitle})</summary>
          <p className="mt-2 whitespace-pre-line text-slate-700">{essay.prompt.replace(/\*\*|#\s?/g, "")}</p>
        </details>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label mb-0">Esse</span>
            <span className="text-xs font-semibold text-slate-500">{essay.words} ta so'z</span>
          </div>
          {essay.milliy ? (
            <div className="max-h-[55vh] overflow-y-auto">
              <TextAnnotator text={essay.text} value={marks} onChange={setMarks} />
            </div>
          ) : (
            <div className="max-h-[45vh] overflow-y-auto whitespace-pre-line rounded-xl border border-slate-200 bg-white p-4 text-[15px] leading-relaxed">
              {essay.text}
            </div>
          )}
          {essay.milliy && (
            <div className="mt-2">
              <MarkCounts counts={countMarks({ pages: [], text: marks })} />
            </div>
          )}
        </div>

        {essay.milliy ? (
          <>
            <RubricForm value={rubric} onChange={setRubric} />
            <p className="text-sm font-bold">Jami: {formatScore(rubricTotal(rubric))} / 24 → 75 ballik shkalada {essayTo75(rubricTotal(rubric))}</p>
            <Field label="Taqriz (o'quvchiga yuboriladi)">
              <textarea className="textarea min-h-[110px]" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ekspert xulosasi: kuchli tomonlari, xatolari, tavsiyalar…" />
            </Field>
            {essay.voice && !voice && (
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="mb-1 text-xs font-bold text-slate-500">Yuborilgan ovozli izoh</p>
                <VoicePlayer voice={essay.voice} />
              </div>
            )}
            <VoiceRecorder value={voice} onChange={setVoice} />
          </>
        ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
          <Field label={`Ball (0 – ${formatScore(essay.maxPoints)})`}>
            <input className="input text-lg font-bold" inputMode="decimal" value={points} onChange={(e) => setPoints(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0" />
            <div className="mt-2 flex flex-wrap gap-1">
              {[0.25, 0.5, 0.75, 1].map((f) => (
                <button key={f} type="button" className="btn-sm btn border border-slate-200 text-slate-600" onClick={() => setPoints(formatScore(essay.maxPoints * f))}>
                  {formatScore(essay.maxPoints * f)}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Izoh (o'quvchiga yuboriladi)">
            <textarea className="textarea min-h-[110px]" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Kuchli tomonlari, xatolari, tavsiyalar…" />
          </Field>
        </div>
        )}
        {!essay.milliy && points.trim() !== "" && !valid && <p className="text-sm font-semibold text-red-600">Ball 0 dan {formatScore(essay.maxPoints)} gacha bo'lishi kerak</p>}
      </div>
    </Modal>
  );
}
