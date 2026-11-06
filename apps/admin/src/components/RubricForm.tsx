import { ESSAY_RUBRIC, ESSAY_SPECIAL, RUBRIC_STEPS, rubricScore, type EssaySpecialKey } from "@onatili/shared";

export interface RubricValue {
  special: EssaySpecialKey | null;
  scores: Record<string, number | undefined>;
}

export const emptyRubric = (): RubricValue => ({ special: null, scores: {} });

/** Hamma 12 band baholanganmi yoki maxsus holat tanlanganmi */
export const rubricComplete = (v: RubricValue) => !!v.special || ESSAY_RUBRIC.every((c) => v.scores[c.key] !== undefined);
export const rubricTotal = (v: RubricValue) =>
  rubricScore(
    v.special,
    Object.entries(v.scores)
      .filter(([, s]) => s !== undefined)
      .map(([key, score]) => ({ key, score: score! })),
  ).total;

const fmt = (n: number) => String(n).replace(".", ",");

/**
 * Rasmiy mezon (BBA): 12 band, har biri 2 / 1,5 / 1 / 0,5 / 0. Har bir ball tugmasi ostida mezondagi tavsif.
 * Yuqorida: esse tekshirilmaydigan holatlar (2 yoki 0 ball).
 */
export function RubricForm({ value, onChange, aiHint }: { value: RubricValue; onChange: (v: RubricValue) => void; aiHint?: Record<string, number> }) {
  let lastGroup = "";
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Esse tekshirilmaydigan holatlar</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(ESSAY_SPECIAL) as EssaySpecialKey[]).map((k) => {
            const on = value.special === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => onChange({ ...value, special: on ? null : k })}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                {ESSAY_SPECIAL[k].label} · {ESSAY_SPECIAL[k].score} ball
              </button>
            );
          })}
        </div>
      </div>

      {!value.special &&
        ESSAY_RUBRIC.map((c, i) => {
          const header = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          const cur = value.scores[c.key];
          return (
            <div key={c.key}>
              {header && <p className="mb-1 mt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{header}</p>}
              <div className={`rounded-lg border p-3 ${cur === undefined ? "border-amber-300" : "border-slate-200"}`}>
                <p className="text-sm font-bold">
                  {i + 1}. {c.label}
                  {aiHint?.[c.key] !== undefined && <span className="ml-2 text-xs font-semibold text-sky-700">AI: {fmt(aiHint[c.key])}</span>}
                </p>
                <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-5">
                  {RUBRIC_STEPS.map((step, j) => {
                    const on = cur === step;
                    return (
                      <button
                        key={step}
                        type="button"
                        title={c.levels[j]}
                        onClick={() => onChange({ ...value, scores: { ...value.scores, [c.key]: step } })}
                        className={`rounded-md border px-2 py-1.5 text-left text-[11px] leading-tight transition ${
                          on ? "border-brand bg-brand-soft text-brand-dark" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span className="block text-sm font-extrabold">{fmt(step)}</span>
                        <span className="line-clamp-3">{c.levels[j]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}
