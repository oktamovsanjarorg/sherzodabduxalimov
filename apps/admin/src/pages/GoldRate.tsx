import { ESSAY_MAX_SCORE, ESSAY_RUBRIC, ESSAY_SPECIAL, formatScore, type GoldDetail, type GoldRatingView } from "@onatili/shared";
import { useMutation } from "@tanstack/react-query";
import { EyeOff, Save } from "lucide-react";
import { useState } from "react";
import { RubricForm, rubricComplete, rubricTotal, type RubricValue } from "../components/RubricForm";
import { Badge } from "../components/ui";
import { errMsg } from "../lib/api";
import { goldApi } from "../lib/gold-api";
import { useToast } from "../lib/toast";
import { GoldImage } from "./GoldEssayPage";

const toValue = (r: GoldRatingView | null): RubricValue => ({ special: r?.special ?? null, scores: r ? { ...r.scores } : {} });

/** Mustaqil baho: AI bahosi ko'rsatilmaydi, boshqa ustozniki — o'zi baholagandan keyin */
export function GoldRate({ g, onSaved }: { g: GoldDetail; onSaved: (g: GoldDetail) => void }) {
  const toast = useToast();
  const [v, setV] = useState<RubricValue>(() => toValue(g.myRating));
  const save = useMutation({
    mutationFn: () => goldApi.rate(g.id, { special: v.special, scores: v.special ? {} : (v.scores as Record<string, number>) }),
    onSuccess: (next) => {
      onSaved(next);
      toast("Baho saqlandi");
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="max-h-[38vh] space-y-3 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:border-0 lg:p-0 lg:shadow-none">
        {g.pages > 0
          ? Array.from({ length: g.pages }, (_, n) => <GoldImage key={n} id={g.id} n={n} />)
          : g.transcript && <p className="card whitespace-pre-wrap p-4 text-sm leading-relaxed">{g.transcript}</p>}
      </div>
      <div className="space-y-3">
        {!g.myRating && (
          <p className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm text-ink-2">
            <EyeOff size={16} className="mt-0.5 shrink-0" />
            <span>
              O'zingiz mustaqil baholang. AI bahosi ko'rsatilmaydi.
              {g.otherCount > 0 && ` ${g.otherCount} ta ustoz baholagan: uning bahosi siz saqlagandan keyin ko'rinadi.`}
            </span>
          </p>
        )}
        {g.others && g.others.length > 0 && <Compare mine={g.myRating} others={g.others} />}
        <RubricForm value={v} onChange={setV} />
        <div
          // Telefonda pastki navigatsiya (fixed) ustida turadi
          className="sticky bottom-[calc(4.25rem+var(--safe-bottom))] flex items-center justify-between gap-3 border-t border-line bg-surface py-3 md:bottom-0"
        >
          <p className="text-sm font-bold">
            Jami: {formatScore(rubricTotal(v))}/{ESSAY_MAX_SCORE}
          </p>
          <button className="btn-primary" disabled={!rubricComplete(v) || save.isPending} onClick={() => save.mutate()}>
            <Save size={16} /> {g.myRating ? "Bahoni yangilash" : "Bahoni saqlash"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Ustozlar bahosini band bo'yicha solishtirish: farq 1 balldan oshsa ajratib ko'rsatiladi */
function Compare({ mine, others }: { mine: GoldRatingView | null; others: GoldRatingView[] }) {
  const all = [...(mine ? [mine] : []), ...others];
  const cell = (r: GoldRatingView, key: string) => (r.special ? "—" : formatScore(r.scores[key] ?? 0));
  return (
    <div className="card overflow-x-auto p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">Ustozlar bahosi</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-3">
            <th className="py-1 pr-2 font-semibold">Band</th>
            {all.map((r) => (
              <th key={r.rater} className="px-2 py-1 font-semibold">
                {r.mine ? "Siz" : r.rater}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {all.some((r) => r.special) && (
            <tr>
              <td className="py-1 pr-2">Maxsus holat</td>
              {all.map((r) => (
                <td key={r.rater} className="px-2 py-1">
                  {r.special ? ESSAY_SPECIAL[r.special].label : "—"}
                </td>
              ))}
            </tr>
          )}
          {ESSAY_RUBRIC.map((c) => {
            const vals = all.filter((r) => !r.special).map((r) => r.scores[c.key] ?? 0);
            const far = vals.length > 1 && Math.max(...vals) - Math.min(...vals) > 1;
            return (
              <tr key={c.key} className={far ? "bg-amber-50" : ""}>
                <td className="py-1 pr-2">{c.label}</td>
                {all.map((r) => (
                  <td key={r.rater} className="px-2 py-1 font-semibold">
                    {cell(r, c.key)}
                  </td>
                ))}
              </tr>
            );
          })}
          <tr className="border-t border-line font-bold">
            <td className="py-1 pr-2">Jami</td>
            {all.map((r) => (
              <td key={r.rater} className="px-2 py-1">
                <Badge tone="brand">{formatScore(r.total)}</Badge>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
