import { ESSAY_RUBRIC, ESSAY_SPECIAL, RUBRIC_STEPS, rubricScore, type EssaySpecialKey } from "@onatili/shared";

export interface RubricValue {
  special: EssaySpecialKey | null;
  scores: Record<string, number | undefined>;
  /** Ustozning band ostidagi izohi (o'quvchiga boradi) */
  comments?: Record<string, string>;
}

export const emptyRubric = (): RubricValue => ({ special: null, scores: {} });

/** Bo'sh bo'lmagan izohlar, faqat baholangan bandlar uchun */
export const rubricComments = (v: RubricValue): Record<string, string> =>
  Object.fromEntries(Object.entries(v.comments ?? {}).flatMap(([k, c]) => (c.trim() && v.scores[k] !== undefined ? [[k, c.trim()]] : [])));

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
export function RubricForm({
  value,
  onChange,
  aiHint,
  comments = false,
}: {
  value: RubricValue;
  onChange: (v: RubricValue) => void;
  aiHint?: Record<string, number>;
  /** Har band ostida izoh maydoni */
  comments?: boolean;
}) {
  let lastGroup = "";
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-line p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">Esse tekshirilmaydigan holatlar</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(ESSAY_SPECIAL) as EssaySpecialKey[]).map((k) => {
            const on = value.special === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => onChange({ ...value, special: on ? null : k })}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-red-300 bg-red-50 text-red-700" : "border-line text-ink-2 hover:bg-surface-2"}`}
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
              {header && <p className="mb-1 mt-2 text-[11px] font-bold uppercase tracking-wide text-ink-4">{header}</p>}
              <div className={`rounded-lg border p-3 ${cur === undefined ? "border-amber-400" : "border-line"}`}>
                <p className="text-sm font-bold">
                  {i + 1}. {c.label}
                  {aiHint?.[c.key] !== undefined && <span className="ml-2 text-xs font-semibold text-brand">AI: {fmt(aiHint[c.key])}</span>}
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
                          on ? "border-brand bg-brand-soft text-brand-light" : "border-line text-ink-2 hover:bg-surface-2"
                        }`}
                      >
                        <span className="block text-sm font-extrabold">{fmt(step)}</span>
                        <span className="line-clamp-3">{c.levels[j]}</span>
                      </button>
                    );
                  })}
                </div>
                {comments && (
                  <textarea
                    rows={1}
                    maxLength={1000}
                    className="input mt-2 min-h-0 py-1.5 text-[16px] sm:text-sm"
                    placeholder="Izoh (ixtiyoriy, o'quvchiga boradi)"
                    value={value.comments?.[c.key] ?? ""}
                    onChange={(e) => onChange({ ...value, comments: { ...value.comments, [c.key]: e.target.value } })}
                  />
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}
