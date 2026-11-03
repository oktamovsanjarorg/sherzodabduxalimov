import type { AttemptResult, ResultQuestion } from "@onatili/shared";
import { useMutation } from "@tanstack/react-query";
import { Check, Lightbulb, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FullPage } from "../components/FullPage";
import { api } from "../lib/api";
import { formatClock, useBackButton } from "../lib/hooks";

export function ResultView({ result }: { result: AttemptResult }) {
  const navigate = useNavigate();
  const [onlyMistakes, setOnlyMistakes] = useState(false);
  useBackButton(() => navigate(-1));

  const retry = useMutation({
    mutationFn: () => api.startTest(result.testId),
    onSuccess: (a) => navigate(`/attempt/${a.id}`, { replace: true }),
  });

  const spentSec = Math.round((new Date(result.finishedAt).getTime() - new Date(result.startedAt).getTime()) / 1000);
  const list = onlyMistakes ? result.questions.filter((q) => !q.isCorrect) : result.questions;
  const tone = result.percent >= 80 ? "text-success" : result.percent >= 50 ? "text-brand" : "text-danger";
  const verdict =
    result.percent >= 86 ? "A'lo natija!" : result.percent >= 70 ? "Yaxshi natija" : result.percent >= 50 ? "Yomon emas" : "Mavzuni takrorlang";

  return (
    <FullPage
      bottom={
        <div className="flex gap-2">
          <button className="btn-ghost w-auto shrink-0 px-5" onClick={() => navigate(-1)}>
            Orqaga
          </button>
          <button className="btn-primary" disabled={retry.isPending} onClick={() => retry.mutate()}>
            <RotateCcw size={18} /> Qayta topshirish
          </button>
        </div>
      }
    >
      <div className="card flex flex-col items-center py-6 text-center">
        <ScoreRing percent={result.percent} className={tone} />
        <p className="mt-3 text-lg font-extrabold">{verdict}</p>
        <p className="text-sm text-hint">{result.testTitle}</p>
        {result.status === "EXPIRED" && (
          <p className="mt-2 rounded-full bg-danger/10 px-3 py-1 text-xs font-bold text-danger">Vaqt tugadi</p>
        )}
        <div className="mt-5 grid w-full grid-cols-3 divide-x divide-hint/15">
          <Stat value={`${result.correctCount}/${result.totalCount}`} label="To'g'ri" />
          <Stat value={`${trim(result.score)}/${trim(result.maxScore)}`} label="Ball" />
          <Stat value={formatClock(Math.max(0, spentSec))} label="Vaqt" />
        </div>
      </div>

      <div className="mb-2 mt-6 flex items-center justify-between px-1">
        <h2 className="text-[15px] font-bold">Javoblar tahlili</h2>
        <div className="flex rounded-full bg-section p-1 text-xs font-bold">
          {[
            [false, "Hammasi"],
            [true, "Xatolar"],
          ].map(([v, label]) => (
            <button
              key={String(v)}
              onClick={() => setOnlyMistakes(v as boolean)}
              className={`rounded-full px-3 py-1.5 ${onlyMistakes === v ? "bg-brand text-white" : "text-hint"}`}
            >
              {label as string}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 && <p className="card text-center text-sm text-hint">Xato yo'q 🎉</p>}
      <div className="space-y-3">
        {list.map((q) => (
          <QuestionReview key={q.id} q={q} n={result.questions.indexOf(q) + 1} />
        ))}
      </div>
    </FullPage>
  );
}

const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-base font-extrabold tabular-nums">{value}</p>
      <p className="text-xs text-hint">{label}</p>
    </div>
  );
}

function ScoreRing({ percent, className }: { percent: number; className: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className={`relative h-32 w-32 ${className}`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-hint/15" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-3xl font-extrabold">{percent}%</span>
    </div>
  );
}

function QuestionReview({ q, n }: { q: ResultQuestion; n: number }) {
  return (
    <div className="card">
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${
            q.isCorrect ? "bg-success" : "bg-danger"
          }`}
        >
          {q.isCorrect ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
        </span>
        <p className="whitespace-pre-line text-[15px] font-semibold">
          <span className="text-hint">{n}. </span>
          {q.text}
        </p>
      </div>

      {q.type === "TEXT" ? (
        <div className="mt-3 space-y-1 text-sm">
          <p>
            <span className="text-hint">Sizning javobingiz: </span>
            <span className={`font-bold ${q.isCorrect ? "text-success" : "text-danger"}`}>{q.yourText || "—"}</span>
          </p>
          {!q.isCorrect && q.correctText && (
            <p>
              <span className="text-hint">To'g'ri javob: </span>
              <span className="font-bold text-success">{q.correctText}</span>
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {q.options.map((o, i) => {
            const correct = q.correctOptionIds.includes(o.id);
            const mine = q.yourOptionIds.includes(o.id);
            const cls = correct
              ? "bg-success/15 text-success font-bold"
              : mine
                ? "bg-danger/10 text-danger font-bold line-through decoration-2"
                : "text-hint";
            return (
              <div key={o.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${cls}`}>
                <span className="w-4 shrink-0 font-extrabold">{String.fromCharCode(65 + i)}</span>
                <span className="flex-1">{o.text}</span>
                {mine && <span className="text-[11px] font-bold no-underline">siz</span>}
              </div>
            );
          })}
          {q.yourOptionIds.length === 0 && <p className="px-3 text-xs font-semibold text-hint">Javob berilmagan</p>}
        </div>
      )}

      {q.explanation && (
        <div className="mt-3 flex gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm">
          <Lightbulb size={16} className="mt-0.5 shrink-0 text-brand" />
          <p>{q.explanation}</p>
        </div>
      )}
    </div>
  );
}
