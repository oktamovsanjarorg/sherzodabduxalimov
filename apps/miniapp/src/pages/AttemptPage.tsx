import { ESSAY_REQUIREMENTS, type AttemptQuestion, type AttemptResult, type AttemptState } from "@onatili/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenText, ChevronLeft, ChevronRight, Clock, Grid3x3, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FullPage } from "../components/FullPage";
import { Markdown } from "../components/Markdown";
import { ApiError, api, isFinished } from "../lib/api";
import { useBackButton, useCountdown } from "../lib/hooks";
import { confirmDialog, haptic, hapticResult } from "../lib/telegram";
import { ResultView } from "./ResultView";

export function AttemptPage() {
  const { id = "" } = useParams();
  const attempt = useQuery({ queryKey: ["attempt", id], queryFn: () => api.attempt(id), retry: false, staleTime: 0 });

  if (attempt.isPending) {
    return (
      <FullPage>
        <div className="skeleton h-8 w-1/2" />
        <div className="skeleton mt-4 h-40" />
        <div className="skeleton mt-3 h-14" />
        <div className="skeleton mt-2 h-14" />
      </FullPage>
    );
  }
  if (attempt.isError) {
    return (
      <FullPage>
        <p className="card text-center text-sm text-hint">Test topilmadi</p>
      </FullPage>
    );
  }
  if (isFinished(attempt.data)) return <ResultView result={attempt.data} />;
  if (attempt.data.questions.length === 0) {
    return (
      <FullPage>
        <p className="card text-center text-sm text-hint">Bu testda hozircha savollar yo'q</p>
      </FullPage>
    );
  }
  return <Runner key={attempt.data.id} state={attempt.data} />;
}

type Answer = { optionIds: string[]; textAnswer: string | null };

function isAnswered(a: Answer | undefined) {
  return Boolean(a && (a.optionIds.length > 0 || a.textAnswer?.trim()));
}

function Runner({ state }: { state: AttemptState }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const qs = state.questions;

  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(state.answers.map((a) => [a.questionId, { optionIds: a.optionIds, textAnswer: a.textAnswer }])),
  );
  const [index, setIndex] = useState(() => Math.max(0, qs.findIndex((q) => !state.answers.some((a) => a.questionId === q.id))));
  const [showMap, setShowMap] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const answersRef = useRef(answers);
  answersRef.current = answers;

  // Har bir savol uchun oxirgi saqlash so'rovi: yakunlashdan oldin hammasi kutib olinadi
  const pending = useRef(new Map<string, Promise<unknown>>());
  const textTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const onClosed = useCallback(() => qc.invalidateQueries({ queryKey: ["attempt", state.id] }), [qc, state.id]);

  const persist = useCallback(
    (qid: string, a: Answer) => {
      const p = api
        .saveAnswer(state.id, qid, a)
        .then(() => setSaveError(null))
        .catch((e) => {
          if (e instanceof ApiError && e.code === "ATTEMPT_CLOSED") onClosed();
          else setSaveError("Javob saqlanmadi. Internetni tekshiring.");
        });
      pending.current.set(qid, p);
      return p;
    },
    [state.id, onClosed],
  );

  const flush = useCallback(async () => {
    for (const [qid, t] of textTimers.current) {
      clearTimeout(t);
      textTimers.current.delete(qid);
      const a = answersRef.current[qid];
      if (a) persist(qid, a);
    }
    await Promise.all(pending.current.values());
  }, [persist]);

  const submit = useCallback(
    async (auto = false) => {
      if (submitting) return;
      if (!auto) {
        const left = qs.filter((q) => !isAnswered(answersRef.current[q.id])).length;
        const ok = await confirmDialog(
          left ? `${left} ta savolga javob berilmagan. Testni yakunlaysizmi?` : "Testni yakunlaysizmi?",
        );
        if (!ok) return;
      }
      setSubmitting(true);
      try {
        await flush();
        const result = await api.submit(state.id);
        hapticResult(result.percent >= 50 ? "success" : "warning");
        qc.setQueryData<AttemptResult>(["attempt", state.id], result);
        qc.invalidateQueries({ queryKey: ["courses"] });
        qc.invalidateQueries({ queryKey: ["mocks"] });
        qc.invalidateQueries({ queryKey: ["stats"] });
        qc.invalidateQueries({ queryKey: ["lesson"] });
      } catch {
        setSaveError("Yakunlab bo'lmadi. Qayta urinib ko'ring.");
        setSubmitting(false);
      }
    },
    [submitting, qs, flush, state.id, qc],
  );

  const timerRef = useCountdown(state.deadlineAt, state.serverNow, () => submit(true));

  useBackButton(async () => {
    await flush();
    if (state.deadlineAt) {
      const ok = await confirmDialog("Chiqsangiz ham vaqt to'xtamaydi. Chiqasizmi?");
      if (!ok) return;
    }
    navigate(-1);
  });

  // Sahifa yopilayotganda kutilayotgan matnli javoblarni yuborib qolamiz
  useEffect(() => () => void flush(), [flush]);

  const q = qs[index];
  const a = answers[q.id];

  function choose(optionId: string) {
    haptic();
    const prev = answers[q.id]?.optionIds ?? [];
    const optionIds =
      q.type === "MULTIPLE"
        ? prev.includes(optionId)
          ? prev.filter((x) => x !== optionId)
          : [...prev, optionId]
        : [optionId];
    const next = { optionIds, textAnswer: null };
    setAnswers((s) => ({ ...s, [q.id]: next }));
    persist(q.id, next);
  }

  function typeText(value: string) {
    const next = { optionIds: [], textAnswer: value };
    setAnswers((s) => ({ ...s, [q.id]: next }));
    const t = textTimers.current.get(q.id);
    if (t) clearTimeout(t);
    textTimers.current.set(
      q.id,
      setTimeout(
        () => {
          textTimers.current.delete(q.id);
          persist(q.id, next);
        },
        q.type === "ESSAY" ? 1500 : 700,
      ),
    );
  }

  const go = (i: number) => {
    haptic();
    setIndex(Math.min(qs.length - 1, Math.max(0, i)));
    setShowMap(false);
  };
  const answeredCount = qs.filter((x) => isAnswered(answers[x.id])).length;
  const isLast = index === qs.length - 1;

  return (
    <FullPage
      bottom={
        <div className="flex gap-2">
          <button className="btn-ghost w-14 shrink-0 px-0" disabled={index === 0} onClick={() => go(index - 1)} aria-label="Oldingi">
            <ChevronLeft size={22} />
          </button>
          {isLast ? (
            <button className="btn-primary" disabled={submitting} onClick={() => submit()}>
              {submitting ? <Loader2 size={18} className="animate-spin" /> : null}
              Yakunlash
            </button>
          ) : (
            <button className="btn-primary" onClick={() => go(index + 1)}>
              Keyingi <ChevronRight size={20} />
            </button>
          )}
        </div>
      }
    >
      {/* Sarlavha: test nomi, progress, taymer */}
      <div className="flex items-center gap-2 px-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-hint">{state.testTitle}</p>
          <p className="text-lg font-extrabold">
            {index + 1} <span className="text-hint">/ {qs.length}</span>
          </p>
        </div>
        {state.deadlineAt && (
          <span className="flex items-center gap-1.5 rounded-full bg-section px-3 py-2 text-sm font-extrabold tabular-nums">
            <Clock size={16} className="text-brand" />
            <span ref={timerRef} className="data-[low=true]:text-danger" />
          </span>
        )}
        <button className="tap flex h-10 w-10 items-center justify-center rounded-full bg-section" onClick={() => setShowMap(true)} aria-label="Savollar xaritasi">
          <Grid3x3 size={18} />
        </button>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-hint/20">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(answeredCount / qs.length) * 100}%` }} />
      </div>

      {saveError && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{saveError}</p>}

      <QuestionView
        key={q.id}
        q={q}
        answer={a}
        onChoose={choose}
        onText={typeText}
        passageIsNew={Boolean(q.passage) && qs[index - 1]?.passage?.id !== q.passage?.id}
        milliy={state.gradingScale === "MILLIY_SERTIFIKAT"}
      />

      {showMap && (
        <QuestionMap
          questions={qs}
          answers={answers}
          current={index}
          onPick={go}
          onClose={() => setShowMap(false)}
          onSubmit={() => {
            setShowMap(false);
            submit();
          }}
        />
      )}
    </FullPage>
  );
}

export const fmtPoints = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
const countWords = (t: string) => (t.trim().match(/\S+/g) ?? []).length;

/** Umumiy matn (o'qish matni, she'r, g'azal): yig'iladigan karta */
function PassageCard({ title, body, defaultOpen }: { title: string | null; body: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card mt-4 border border-brand/20 p-0">
      <button className="tap flex w-full items-center gap-2 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <BookOpenText size={18} className="shrink-0 text-brand" />
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{title ?? "Matn"}</span>
        <span className="text-xs font-semibold text-brand">{open ? "Yig'ish" : "Matnni ochish"}</span>
      </button>
      {open && (
        <div className="max-h-[55vh] overflow-y-auto border-t border-hint/10 px-4 py-3">
          <Markdown text={body} />
        </div>
      )}
    </div>
  );
}

function QuestionView({
  q,
  answer,
  onChoose,
  onText,
  passageIsNew,
  milliy,
}: {
  milliy: boolean;
  q: AttemptQuestion;
  answer: Answer | undefined;
  onChoose: (id: string) => void;
  onText: (v: string) => void;
  /** Oldingi savol boshqa matnga tegishli bo'lsa, matn ochiq ko'rsatiladi */
  passageIsNew: boolean;
}) {
  const [essayWords, setEssayWords] = useState(() => countWords(answer?.textAnswer ?? ""));
  return (
    <div className="mt-2">
      {q.passage && <PassageCard key={q.passage.id} title={q.passage.title} body={q.passage.body} defaultOpen={passageIsNew} />}
      <div className="card mt-3">
        <div className="mb-2 flex items-center gap-2">
          {q.type === "MULTIPLE" && <span className="text-xs font-bold text-brand">Bir nechta javob tanlang</span>}
          {q.type === "TEXT" && <span className="text-xs font-bold text-brand">Javobni yozing</span>}
          {q.type === "ESSAY" && <span className="text-xs font-bold text-brand">Esse · ustoz rasmiy mezon (24 ball) bo'yicha baholaydi</span>}
          <span className="flex-1" />
          {/* Milliy sertifikat: savol ballari ko'rsatilmaydi, ballni Rasch modeli beradi */}
          {!milliy && <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-hint">{fmtPoints(q.points)} ball</span>}
        </div>
        <div className="font-medium">
          <Markdown text={q.text} />
        </div>
        {q.imageUrl && <img src={q.imageUrl} alt="" className="mt-3 w-full rounded-xl" />}
      </div>

      {q.type === "ESSAY" ? (
        <>
          {milliy && (
            <details className="mt-3 rounded-xl bg-brand-soft px-3 py-2 text-sm">
              <summary className="cursor-pointer font-bold text-brand">Esse talablari (rasmiy mezon)</summary>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[13px]">
                {ESSAY_REQUIREMENTS.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
              <p className="mt-1 text-[12px] text-hint">100 so'zdan kam yoki mavzuga mos bo'lmasa — 2 ball; to'liq kirillcha yoki faqat kirish qismi — 0 ball.</p>
            </details>
          )}
          <textarea
            key={q.id}
            className="mt-3 min-h-[50vh] w-full resize-y rounded-card border-2 border-transparent bg-section px-4 py-3 text-[16px] leading-relaxed outline-none focus:border-brand"
            placeholder="Esseni shu yerga yozing. Yozganingiz avtomatik saqlanib boradi."
            defaultValue={answer?.textAnswer ?? ""}
            onChange={(e) => {
              setEssayWords(countWords(e.target.value));
              onText(e.target.value);
            }}
            spellCheck={false}
          />
          <p className="mt-1 px-1 text-xs font-semibold text-hint">{essayWords} ta so'z</p>
        </>
      ) : q.type === "TEXT" ? (
        <input
          key={q.id}
          className="mt-3 h-14 w-full rounded-card border-2 border-transparent bg-section px-4 text-[16px] font-semibold outline-none focus:border-brand"
          placeholder="Javobingizni yozing"
          defaultValue={answer?.textAnswer ?? ""}
          onChange={(e) => onText(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
        />
      ) : (
        <div className="mt-3 space-y-2" role={q.type === "SINGLE" ? "radiogroup" : "group"}>
          {q.options.map((o, i) => {
            const selected = answer?.optionIds.includes(o.id) ?? false;
            return (
              <button
                key={o.id}
                role={q.type === "SINGLE" ? "radio" : "checkbox"}
                aria-checked={selected}
                onClick={() => onChoose(o.id)}
                className={`tap flex min-h-[56px] w-full items-center gap-3 rounded-card border-2 bg-section px-4 py-3 text-left transition ${
                  selected ? "border-brand" : "border-transparent"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center text-sm font-extrabold ${
                    q.type === "MULTIPLE" ? "rounded-lg" : "rounded-full"
                  } ${selected ? "bg-brand text-white" : "bg-surface text-hint"}`}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="text-[15px] font-medium">{o.text}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuestionMap({
  questions,
  answers,
  current,
  onPick,
  onClose,
  onSubmit,
}: {
  questions: AttemptQuestion[];
  answers: Record<string, Answer>;
  current: number;
  onPick: (i: number) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const answered = questions.filter((q) => isAnswered(answers[q.id])).length;
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-section px-4 pt-4"
        style={{ paddingBottom: "max(16px, var(--tg-safe-area-inset-bottom, 0px), env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto max-w-md">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-extrabold">
              Javob berilgan: {answered} / {questions.length}
            </p>
            <button className="tap flex h-9 w-9 items-center justify-center rounded-full bg-surface" onClick={onClose} aria-label="Yopish">
              <X size={18} />
            </button>
          </div>
          <div className="grid max-h-[50vh] grid-cols-6 gap-2 overflow-y-auto pb-1">
            {questions.map((q, i) => {
              const done = isAnswered(answers[q.id]);
              return (
                <button
                  key={q.id}
                  onClick={() => onPick(i)}
                  className={`tap h-11 rounded-xl text-sm font-extrabold ${
                    done ? "bg-brand text-white" : "bg-surface text-hint"
                  } ${i === current ? "ring-2 ring-brand ring-offset-2 ring-offset-section" : ""}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <button className="btn-primary mt-4" onClick={onSubmit}>
            Testni yakunlash
          </button>
        </div>
      </div>
    </div>
  );
}
