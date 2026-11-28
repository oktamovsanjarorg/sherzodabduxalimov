import { errorTypeLabel, formatScore, type EssaySpecialKey, type OfflineEssayAi, type OfflineEssayDetail, type PageAnnotations } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageOff, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { AnnotationOverlay } from "../components/Annotate";
import { RubricForm, emptyRubric, rubricComments, rubricComplete, rubricTotal, type RubricValue } from "../components/RubricForm";
import { ConfirmButton, Modal, Spinner } from "../components/ui";
import { errMsg } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { offlineApi } from "../lib/offline-essay-api";
import { useToast } from "../lib/toast";
import { OfflineTranscript, type TranscriptValue } from "./OfflineTranscript";

const EMPTY_PAGE: PageAnnotations = { strokes: [], marks: [] };

/** Avval ustoz baholagan bo'lsa uning bahosi, aks holda AI bahosi bilan to'ldiriladi: ustoz faqat rozi bo'lmagan bandini o'zgartiradi */
const initialRubric = (d: OfflineEssayDetail): RubricValue =>
  d.review
    ? { special: d.review.special, scores: { ...d.review.scores }, comments: { ...d.review.comments } }
    : d.ai
      ? { special: (d.ai.special?.key as EssaySpecialKey | undefined) ?? null, scores: Object.fromEntries(d.ai.criteria.map((c) => [c.key, c.score])) }
      : emptyRubric();

const definedScores = (v: RubricValue) => Object.fromEntries(Object.entries(v.scores).filter((x): x is [string, number] => x[1] !== undefined));

/** Bitta offline esse: varoqlar (AI belgilari bilan), AI taxmini va ustoz tasdig'i */
export function OfflineEssayReview({ resultId, onClose, onChanged }: { resultId: string; onClose: () => void; onChanged: () => void }) {
  const q = useQuery({
    queryKey: ["offline-essay", resultId],
    queryFn: () => offlineApi.detail(resultId),
    refetchInterval: (x) => (x.state.data?.status === "CHECKING" ? 5000 : false),
  });
  return (
    <Modal wide title={q.data?.name ?? "Esse"} onClose={onClose}>
      {q.isPending ? <Spinner className="text-ink-4" /> : q.isError ? <p className="text-sm text-red-600">{errMsg(q.error)}</p> : null}
      {q.data && <Body key={`${q.data.status}-${q.data.pages}`} d={q.data} onChanged={onChanged} onClose={onClose} />}
    </Modal>
  );
}

function Body({ d, onChanged, onClose }: { d: OfflineEssayDetail; onChanged: () => void; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [rubric, setRubric] = useState<RubricValue>(() => initialRubric(d));
  const [comment, setComment] = useState(d.review?.comment ?? "");
  const [transcript, setTranscript] = useState<TranscriptValue>(() => ({ text: d.transcript ?? d.text ?? "", checked: !!d.transcript }));
  // Varoq o'chsa raqamlar suriladi: eski rasm keshda qolmasin
  const refresh = () => (
    qc.removeQueries({ queryKey: ["offline-essay-page", d.resultId] }),
    qc.invalidateQueries({ queryKey: ["offline-essay", d.resultId] }),
    onChanged()
  );
  const fail = (e: unknown) => toast(errMsg(e), "error");
  const confirm = useMutation({
    mutationFn: () =>
      offlineApi.confirm(d.resultId, {
        special: rubric.special,
        scores: rubric.special ? {} : definedScores(rubric),
        transcript: d.text && transcript.checked ? transcript.text : null,
        comment: comment.trim() || null,
        comments: rubric.special ? {} : rubricComments(rubric),
      }),
    onSuccess: () => (toast("Baho saqlandi va natijaga yozildi"), qc.invalidateQueries({ queryKey: ["offline-essay-agreement"] }), onChanged(), onClose()),
    onError: fail,
  });
  const recheck = useMutation({ mutationFn: () => offlineApi.check(d.testId, [d.resultId]), onSuccess: refresh, onError: fail });
  const removePage = useMutation({ mutationFn: (n: number) => offlineApi.removePage(d.resultId, n), onSuccess: refresh, onError: fail });
  const busy = d.status === "CHECKING";
  return (
    <div className="space-y-4">
      {busy && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          <Spinner /> AI o'qimoqda va tekshirmoqda. Bir necha daqiqa olishi mumkin, oynani yopsangiz ham davom etadi.
        </p>
      )}
      {d.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{d.error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: d.pages }, (_, n) => (
          <div key={n} className="relative">
            <Page resultId={d.resultId} n={n} anno={d.ai?.annotations?.pages[n] ?? EMPTY_PAGE} />
            {!busy && (
              <ConfirmButton className="btn-secondary btn-sm absolute right-2 top-2 shadow" label="Varoq o'chirilsinmi?" onConfirm={() => removePage.mutate(n)}>
                <Trash2 size={14} />
              </ConfirmButton>
            )}
          </div>
        ))}
      </div>
      {d.ai && <AiSummary ai={d.ai} />}
      {d.text && <OfflineTranscript aiText={d.text} value={transcript} onChange={setTranscript} />}
      {(d.status === "FAILED" || d.status === "CHECKED") && (
        <button className="btn-secondary btn-sm" disabled={recheck.isPending} onClick={() => recheck.mutate()}>
          <RotateCcw size={14} /> AI qayta tekshirsin
        </button>
      )}
      <section className="space-y-3 border-t border-line pt-4">
        <h3 className="font-extrabold">Sizning bahoyingiz</h3>
        {d.review ? (
          <p className="text-xs text-ink-3">
            Baholagan: {d.review.reviewer ?? "—"} · {fmtDateTime(d.review.reviewedAt)}. O'zgartirsangiz yangi baho saqlanadi.
          </p>
        ) : (
          d.ai && <p className="text-xs text-ink-3">Bandlar AI bahosi bilan to'ldirildi. Rozi bo'lmagan bandingizni o'zgartiring.</p>
        )}
        <RubricForm comments value={rubric} onChange={setRubric} aiHint={d.ai ? Object.fromEntries(d.ai.criteria.map((c) => [c.key, c.score])) : undefined} />
        <textarea
          className="input min-h-[90px] py-2 text-[16px] sm:text-sm"
          placeholder="Izoh: umumiy xulosa va maslahat (o'quvchiga natijasida ko'rinadi)"
          value={comment}
          maxLength={3000}
          onChange={(e) => setComment(e.target.value)}
        />
        <button className="btn-primary w-full" disabled={!rubricComplete(rubric) || confirm.isPending} onClick={() => confirm.mutate()}>
          Saqlash: {formatScore(rubricTotal(rubric))}/24{d.essayScore != null ? ` (hozir ${formatScore(d.essayScore)})` : ""}
        </button>
      </section>
    </div>
  );
}

function AiSummary({ ai }: { ai: OfflineEssayAi }) {
  return (
    <details className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm" open>
      <summary className="cursor-pointer font-bold text-sky-900">
        AI bahosi (taxminiy): {formatScore(ai.total)}/24{ai.special ? ` · ${ai.special.label}` : ""}
      </summary>
      {ai.feedback && <p className="mt-2 text-sky-900">{ai.feedback}</p>}
      {ai.mistakes.length > 0 && (
        <ul className="mt-2 space-y-1 text-sky-800">
          {ai.mistakes.map((m, i) => (
            <li key={i}>
              {m.type && <b>{errorTypeLabel(m.type)}: </b>}
              <s>{m.wrong}</s> → {m.right}
              {m.note && <span className="text-sky-700"> — {m.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function Page({ resultId, n, anno }: { resultId: string; n: number; anno: PageAnnotations }) {
  const [ratio, setRatio] = useState(1.4);
  const img = useQuery({
    queryKey: ["offline-essay-page", resultId, n],
    queryFn: () => offlineApi.page(resultId, n),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
  if (img.isPending)
    return (
      <div className="flex h-64 items-center justify-center rounded-xl bg-surface-3">
        <Spinner className="text-ink-4" />
      </div>
    );
  if (!img.data)
    return (
      <div className="flex h-24 items-center justify-center gap-2 rounded-xl bg-surface-3 text-sm text-ink-3">
        <ImageOff size={16} /> Rasm yuklanmadi
      </div>
    );
  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-3">
      <img
        src={img.data}
        alt={`${n + 1}-varoq`}
        className="block w-full"
        onLoad={(e) => setRatio(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth || 1.4)}
      />
      <AnnotationOverlay a={anno} ratio={ratio} />
    </div>
  );
}
