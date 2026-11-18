import { formatScore, milliyTotal, questionPoints, sectionQuestions, type ExternalSection, type ExternalTestDetail } from "@onatili/shared";
import { useState } from "react";
import { Modal } from "../components/ui";

type Row = ExternalTestDetail["rows"][number];

/** "1–12, 33–35": bo'lim savollari qisqa yozuvda */
export function questionsLabel(s: ExternalSection) {
  const qs = sectionQuestions(s);
  const parts: string[] = [];
  for (let i = 0; i < qs.length; ) {
    let j = i;
    while (j + 1 < qs.length && qs[j + 1] === qs[j] + 1) j++;
    parts.push(i === j ? `${qs[i]}` : `${qs[i]}–${qs[j]}`);
    i = j + 1;
  }
  return parts.join(", ");
}

const sectionOf = (t: ExternalTestDetail, q: number) => t.sections.find((s) => sectionQuestions(s).includes(q))?.title ?? "";

/** Rasch tahlili: har savolning qiyinligi va ballga ta'siri (og'irlik) */
export function RaschCard({ t }: { t: ExternalTestDetail }) {
  const [sort, setSort] = useState<"q" | "hard">("q");
  if (!t.rasch) return null;
  const r = t.rasch;
  const items = sort === "q" ? r.items : [...r.items].sort((a, b) => b.b - a.b);
  const maxAbs = Math.max(1, ...r.items.map((i) => Math.abs(i.b)));
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-extrabold">Rasch tahlili</h2>
          <p className="mt-1 max-w-3xl text-xs text-ink-3">
            {r.calibrated
              ? `Savollar qiyinligi shu ${r.n} ta natijadan hisoblandi: kam yechilgan savol qiyin (qiyinlik musbat) va ballga ko'proq ta'sir qiladi (og'irlik 1 dan katta).`
              : `Qatnashchi ${r.n} ta: qiyinlikni hisoblash uchun kamida 30 ta kerak, shuning uchun hamma savol teng (og'irlik 1).`}{" "}
            Test bali = 50 + 14 · logit((to'g'ri savollar og'irligi + 0,5) / (jami og'irlik + 1)), 0–75 oralig'ida; guruh o'rtachasiga bog'liq emas.
          </p>
        </div>
        <div className="flex gap-1 text-xs font-bold">
          {(["q", "hard"] as const).map((k) => (
            <button key={k} className={`h-8 rounded-full px-3 ${sort === k ? "bg-ink text-page" : "bg-surface-3 text-ink-2"}`} onClick={() => setSort(k)}>
              {k === "q" ? "Tartib bo'yicha" : "Eng qiyini avval"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 max-h-[480px] overflow-auto border-t border-line">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface text-left text-xs text-ink-3">
            <tr>
              <th className="px-4 py-2 font-semibold sm:px-5">Savol</th>
              <th className="hidden px-2 py-2 font-semibold md:table-cell">Bo'lim</th>
              <th className="px-2 py-2 text-right font-semibold">To'g'ri</th>
              <th className="px-2 py-2 font-semibold">Qiyinlik (logit)</th>
              <th className="px-4 py-2 text-right font-semibold sm:px-5">Og'irlik</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((i) => (
              <tr key={i.q}>
                <td className="px-4 py-1.5 font-semibold sm:px-5">{i.q}</td>
                <td className="hidden max-w-[220px] truncate px-2 py-1.5 text-ink-3 md:table-cell">{sectionOf(t, i.q)}</td>
                <td className="px-2 py-1.5 text-right">{formatScore(i.correctPct)}%</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    {/* Markaz 0: chapga oson, o'ngga qiyin */}
                    <div className="relative h-2 w-28 rounded bg-surface-3">
                      <span className="absolute inset-y-0 left-1/2 w-px bg-ink-5" />
                      <span
                        className={`absolute inset-y-0 rounded ${i.b > 0 ? "left-1/2 bg-red-400" : "right-1/2 bg-emerald-500"}`}
                        style={{ width: `${(Math.abs(i.b) / maxAbs) * 50}%` }}
                      />
                    </div>
                    <span className="w-12 text-xs tabular-nums text-ink-3">{i.b > 0 ? "+" : ""}{i.b.toFixed(2)}</span>
                  </div>
                </td>
                <td className="px-4 py-1.5 text-right tabular-nums sm:px-5">{i.w.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Natija kartasi: sertifikatdagi tartibda (bo'limlar → test → yozma → umumiy, foiz, daraja) */
export function ResultCardModal({ t, row, onClose }: { t: ExternalTestDetail; row: Row; onClose: () => void }) {
  const f = milliyTotal(row.testScore, row.essayScore);
  const w = t.rasch?.items.map((i) => i.w) ?? [];
  const got = [...row.answers].reduce((s, x, j) => s + (x === "c" ? (w[j] ?? 1) : 0), 0);
  const all = w.reduce((s, x) => s + x, 0);
  const line = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-4 py-1.5 ${strong ? "font-extrabold" : ""}`}>
      <span className={strong ? "" : "text-ink-2"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <Modal title={row.student?.name ?? row.name} onClose={onClose}>
      <div className="rounded-xl border border-gold/40 bg-gold/5 p-4 text-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-3">{t.title}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-surface p-2">
            <p className="text-[11px] text-ink-3">Umumiy ball</p>
            <p className="text-xl font-extrabold">{f.scaledScore != null ? formatScore(f.scaledScore) : "—"}</p>
          </div>
          <div className="rounded-lg bg-surface p-2">
            <p className="text-[11px] text-ink-3">Foiz</p>
            <p className="text-xl font-extrabold">{f.certPercent != null ? `${formatScore(f.certPercent)}%` : "—"}</p>
          </div>
          <div className="rounded-lg bg-surface p-2">
            <p className="text-[11px] text-ink-3">Daraja</p>
            <p className="text-xl font-extrabold">{f.grade ?? "—"}</p>
          </div>
        </div>
        <p className="mb-1 mt-4 font-bold">Bo'limlar bo'yicha test sinovi natijalari</p>
        <div className="divide-y divide-line">
          {row.sectionScores.map((s) => line(`${s.title} (${s.correct}/${s.max})`, s.points != null ? s.points.toFixed(3).replace(".", ",") : "—"))}
          {line("Test natijasi", row.testScore != null ? formatScore(row.testScore) : "—", true)}
          {line("Yozma savodxonlik", f.essay75 != null ? `${formatScore(f.essay75)} (esse ${formatScore(row.essayScore!)}/24)` : "kiritilmagan", true)}
        </div>
        {f.essay75 == null && <p className="mt-2 text-xs text-amber-700">Esse kiritilmaguncha umumiy ball faqat test qismidan: sertifikatda (test + yozma) / 2.</p>}
      </div>
      {row.testScore != null && <QuestionBreakdown t={t} row={row} />}
      {t.rasch && (
        <p className="mt-3 text-xs text-ink-3">
          Hisob: {row.correct}/{t.questionCount} to'g'ri, og'irlangan ulush {got.toFixed(2)} / {all.toFixed(2)} → test bali{" "}
          {row.testScore != null ? formatScore(row.testScore) : "—"}. Bo'lim bali = test bali × bo'limda yechilgan savollar og'irligi ulushi. Foiz = umumiy / 65.
        </p>
      )}
    </Modal>
  );
}

const CELL = { c: "bg-emerald-100 text-emerald-800", w: "bg-red-100 text-red-700", b: "bg-surface-3 text-ink-4" } as const;

/** Har savol: to'g'ri/xato/bo'sh va undan olingan ball; eng zaif bo'lim va xato savollar ro'yxati */
function QuestionBreakdown({ t, row }: { t: ExternalTestDetail; row: Row }) {
  const pts = questionPoints(row.answers, t.rasch?.items.map((i) => i.w) ?? [], row.testScore!);
  const weak = [...row.sectionScores].sort((a, b) => a.percent - b.percent)[0];
  const wrong = [...row.answers].flatMap((x, j) => (x === "c" ? [] : [j + 1]));
  return (
    <div className="mt-4 text-sm">
      {weak && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
          Eng zaif bo'lim: <b>{weak.title}</b> — {weak.correct}/{weak.max} ({formatScore(weak.percent)}%)
        </p>
      )}
      <p className="mb-1 font-bold">Har savol va olingan ball</p>
      {t.sections.map((s) => (
        <div key={s.title} className="mb-2">
          <p className="mb-1 text-xs text-ink-3">{s.title}</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(46px,1fr))] gap-1">
            {sectionQuestions(s).map((q) => {
              const a = (row.answers[q - 1] ?? "b") as keyof typeof CELL;
              return (
                <div key={q} title={`${q}-savol: ${a === "c" ? "to'g'ri" : a === "w" ? "xato" : "bo'sh"}`} className={`rounded px-1 py-1 text-center ${CELL[a] ?? CELL.b}`}>
                  <p className="text-[10px] opacity-70">{q}</p>
                  <p className="text-[11px] font-bold tabular-nums">{a === "c" ? pts[q - 1].toFixed(2).replace(".", ",") : a === "w" ? "✕" : "–"}</p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-ink-3">
        Xato yoki bo'sh ({wrong.length} ta): {wrong.join(", ") || "yo'q"}
      </p>
    </div>
  );
}

export function norm(s: string) {
  return s.toLowerCase().replace(/[ʻʼ'`‘’]/g, "").replace(/\s+/g, " ").trim();
}
