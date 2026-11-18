import { ESSAY_MAX_SCORE, essayTo75, formatScore, milliyTotal, sectionQuestions, type ExternalSection, type ExternalTestDetail } from "@onatili/shared";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Modal, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";

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
      {t.rasch && (
        <p className="mt-3 text-xs text-ink-3">
          Hisob: {row.correct}/{t.questionCount} to'g'ri, og'irlangan ulush {got.toFixed(2)} / {all.toFixed(2)} → test bali{" "}
          {row.testScore != null ? formatScore(row.testScore) : "—"}. Bo'lim bali = test bali × bo'limda yechilgan savollar og'irligi ulushi. Foiz = umumiy / 65.
        </p>
      )}
    </Modal>
  );
}

/** Yozma ish ballari: har o'quvchiga 0–24 (0,5 qadam) yoki ro'yxatni joylash ("Ism Familiya 17,5") */
export function EssayModal({ t, onClose, onDone }: { t: ExternalTestDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(t.rows.map((r) => [r.id, r.essayScore != null ? formatScore(r.essayScore) : ""])));
  const [paste, setPaste] = useState("");
  const byName = useMemo(() => new Map(t.rows.flatMap((r) => [[norm(r.name), r.id], ...(r.student ? [[norm(r.student.name), r.id] as const] : [])])), [t.rows]);
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const bad = t.rows.filter((r) => {
    const x = num(v[r.id] ?? "");
    return x != null && (!Number.isFinite(x) || x < 0 || x > ESSAY_MAX_SCORE || Math.round(x * 2) !== x * 2);
  });
  const changed = t.rows.filter((r) => num(v[r.id] ?? "") !== r.essayScore);
  const save = useMutation({
    mutationFn: () => api.externalEssays(t.id, changed.map((r) => ({ resultId: r.id, score: num(v[r.id] ?? "") }))),
    onSuccess: (r) => (toast(`Saqlandi: ${r.updated} ta`), onDone(), onClose()),
    onError: (e) => toast(errMsg(e), "error"),
  });
  const applyPaste = () => {
    let ok = 0;
    const miss: string[] = [];
    for (const l of paste.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
      const m = /^(.*?)[\s;,\t]+(\d+(?:[.,]\d)?)$/.exec(l);
      const id = m && byName.get(norm(m[1]));
      if (m && id) (ok++, setV((p) => ({ ...p, [id]: m[2] })));
      else miss.push(m?.[1] ?? l);
    }
    toast(miss.length ? `${ok} ta qo'yildi, topilmadi: ${miss.slice(0, 3).join(", ")}${miss.length > 3 ? "…" : ""}` : `${ok} ta qo'yildi`, miss.length ? "error" : undefined);
  };
  return (
    <Modal
      wide
      title="Yozma ish (esse) ballari"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Bekor qilish</button>
          <button className="btn-primary" disabled={!changed.length || bad.length > 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner />} Saqlash{changed.length ? ` (${changed.length})` : ""}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-3">
        24 ballik rasmiy mezon bo'yicha, 0,5 qadam bilan. 75 ballik shkalaga o'zi o'tkaziladi (17,5 → 62) va umumiy ball (test + yozma) / 2 bo'ladi.
      </p>
      <details className="mb-3 rounded-lg border border-line p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Ro'yxatni joylash</summary>
        <textarea className="input mt-2 h-28" aria-label="Esse ballari ro'yxati" placeholder={"Har qatorda ism va ball:\nAliyev Vali 17,5\nKarimova Aziza 20"} value={paste} onChange={(e) => setPaste(e.target.value)} />
        <button className="btn-secondary btn-sm mt-2" disabled={!paste.trim()} onClick={applyPaste}>Ismlar bo'yicha qo'yish</button>
      </details>
      <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">
        {t.rows.map((r) => {
          const x = num(v[r.id] ?? "");
          const wrong = bad.includes(r);
          return (
            <li key={r.id} className="flex items-center gap-3 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate">{r.student?.name ?? r.name}</span>
              <span className="w-16 text-right text-xs text-ink-3">{x != null && !wrong ? `→ ${essayTo75(x)}` : ""}</span>
              <input
                className={`input h-8 w-20 text-right ${wrong ? "border-red-500" : ""}`}
                inputMode="decimal"
                aria-label={`${r.name}: esse bali`}
                value={v[r.id] ?? ""}
                onChange={(e) => setV((p) => ({ ...p, [r.id]: e.target.value }))}
              />
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function norm(s: string) {
  return s.toLowerCase().replace(/[ʻʼ'`‘’]/g, "").replace(/\s+/g, " ").trim();
}
