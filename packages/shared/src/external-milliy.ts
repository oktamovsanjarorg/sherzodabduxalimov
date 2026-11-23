import { essayTo75, milliyLevel } from "./content-types";
import { sectionQuestions, type ExternalRasch, type ExternalRowInput, type ExternalSection, type ExternalSectionScore } from "./external-types";
import { RASCH_MIN_SAMPLE, abilityT, calibrate, difficultyWeights } from "./rasch";

/**
 * Ona tili va adabiyot, Milliy sertifikat (49 katak: 1–35 test, 36–49 yozma qismlar).
 * Bo'limlar sertifikatdagi tartibda (ustoz bergan taqsimot, 2026-11-18). Yozma savodxonlik (esse)
 * bu yerda emas: u alohida 75 ballik qism.
 */
export const ONA_TILI_MILLIY_SECTIONS: ExternalSection[] = [
  { title: "Tilshunoslik nazariyasi", fromQ: 1, toQ: 35, questions: [...range(1, 12), 33, 34, 35] },
  { title: "Adabiyot nazariyasi va adabiyot tarixi", fromQ: 13, toQ: 17 },
  { title: "O'qish savodxonligi", fromQ: 18, toQ: 32 },
  { title: "Lingvistik va badiiy tahlil", fromQ: 36, toQ: 49 },
];
export const ONA_TILI_MILLIY_CELLS = 49;

function range(a: number, b: number) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}
const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function sectionScore(s: ExternalSection, answers: string): ExternalSectionScore {
  const part = sectionQuestions(s).map((q) => answers[q - 1] ?? "-");
  const correct = part.filter((x) => x === "c").length;
  const blank = part.filter((x) => x === "b").length;
  const max = part.length;
  return { ...s, correct, wrong: max - correct - blank, blank, raw: correct, max, percent: max ? Math.round((correct / max) * 1000) / 10 : 0 };
}

/**
 * Umumiy natija sertifikatdagidek: esse bo'lsa (test + esse75)/2, bo'lmasa test qismi;
 * foiz = umumiy / 65 (sertifikatdagi «umumiy ballga nisbatan foiz»: 55,95 → 86,08%).
 */
export function milliyTotal(testScore: number | null, essayScore24: number | null) {
  if (testScore == null) return { scaledScore: null, grade: null, essay75: null, certPercent: null };
  const essay75 = essayScore24 == null ? null : essayTo75(essayScore24);
  const total = r2(essay75 == null ? testScore : (testScore + essay75) / 2);
  const level = milliyLevel(total).code;
  return { scaledScore: total, grade: level === "—" ? null : level, essay75, certPercent: r2(Math.min(100, (total / 65) * 100)) };
}

/**
 * Milliy sertifikat bahosi (ilovadagi mock bilan bir xil, rasch.ts → abilityT):
 * kamida RASCH_MIN_SAMPLE qatnashchi bo'lsa savol qiyinliklari shu natijalardan kalibrlanadi va og'irlik
 * bo'ladi; kam bo'lsa hamma savol teng. Test bali bo'limlarga sertifikatdagidek bo'linadi: har bo'limga
 * o'sha bo'limda to'g'ri yechilgan savollar og'irligi ulushi (bo'limlar yig'indisi = test bali).
 * Qatorlarda testScore, bo'lim points, umumiy ball (esse hali yo'q) yoziladi.
 */
export function gradeMilliy(rows: ExternalRowInput[]): ExternalRasch {
  const L = rows[0]?.answers.length ?? 0;
  const matrix = rows.map((r) => [...r.answers].map((x) => (x === "c" ? 1 : 0)) as (0 | 1)[]);
  const calibrated = rows.length >= RASCH_MIN_SAMPLE;
  const b = calibrated ? calibrate(matrix).b : new Array<number>(L).fill(0);
  const w = calibrated ? difficultyWeights(b) : b.map(() => 1);
  rows.forEach((r, i) => {
    const t = abilityT(matrix[i], w);
    const got = (qs: number[]) => qs.reduce((s, q) => s + (matrix[i][q - 1] ? w[q - 1] : 0), 0);
    const all = got(range(1, L));
    r.testScore = t;
    r.sections = r.sections.map((s) => ({ ...s, points: all ? r3((t * got(sectionQuestions(s))) / all) : 0 }));
    const f = milliyTotal(t, null);
    r.scaledScore = f.scaledScore;
    r.grade = f.grade;
  });
  const n = rows.length || 1;
  return {
    calibrated,
    n: rows.length,
    items: b.map((x, j) => ({ q: j + 1, b: r3(x), w: r3(w[j]), correctPct: Math.round((matrix.reduce((s, m) => s + m[j], 0) / n) * 1000) / 10 })),
  };
}

/**
 * Esse ballari jadvali (Excel yoki CSV): bir ustun ism, bir ustun ball; sarlavha bo'lishi ham, bo'lmasligi ham mumkin.
 * Ball 24 ballik mezonda yoki 75 ballik shkalada bo'lishi mumkin: 75 lik shkalada 0 dan keyingi eng kichik
 * qiymat 28 (0,5 → 28), shuning uchun 24 dan katta har qiymat 75 lik deb olinib 24 likka qaytariladi
 * (62 → 17,5). 25–27 va 0,5 qadamga tushmaydigan qiymatlar xato hisoblanadi.
 */
export function parseEssayTable(rows: string[][]): { rows: { name: string; score24: number }[]; bad: string[] } {
  const filled = rows.filter((r) => r.some((c) => c?.trim()));
  const isNum = (s: string) => /^\d+(?:[.,]\d+)?$/.test(s.trim());
  const width = Math.max(0, ...filled.map((r) => r.length));
  const share = (c: number, f: (s: string) => boolean) => filled.filter((r) => f(r[c] ?? "")).length / (filled.length || 1);
  const cols = Array.from({ length: width }, (_, c) => c);
  const scoreCol = cols.sort((a, b) => share(b, isNum) - share(a, isNum))[0] ?? 1;
  const nameCol =
    Array.from({ length: width }, (_, c) => c)
      .filter((c) => c !== scoreCol)
      .sort((a, b) => share(b, (s) => /\p{L}{2}/u.test(s)) - share(a, (s) => /\p{L}{2}/u.test(s)))[0] ?? 0;
  const out: { name: string; score24: number }[] = [];
  const bad: string[] = [];
  for (const r of filled) {
    const name = (r[nameCol] ?? "").trim();
    const raw = (r[scoreCol] ?? "").trim();
    if (!name || !isNum(raw)) {
      // Sarlavha yoki ballsiz qator: xato emas, shunchaki o'tkaziladi
      if (name && raw && out.length) bad.push(name);
      continue;
    }
    const v = Number(raw.replace(",", "."));
    const s24 = v <= 24 ? v : v >= 28 && v <= 75 ? (v - 27) / 2 : NaN;
    if (!Number.isFinite(s24) || Math.round(s24 * 2) !== s24 * 2) bad.push(name);
    else out.push({ name, score24: s24 });
  }
  return { rows: out, bad };
}

/**
 * Har savoldan olingan ball: test bali to'g'ri yechilgan savollarga og'irligiga qarab bo'linadi
 * (bo'lim bali ham shu yig'indi). Xato yoki bo'sh savol 0.
 */
export function questionPoints(answers: string, weights: number[], testScore: number): number[] {
  const got = [...answers].reduce((s, x, j) => s + (x === "c" ? (weights[j] ?? 1) : 0), 0);
  return [...answers].map((x, j) => (x === "c" && got ? r3((testScore * (weights[j] ?? 1)) / got) : 0));
}
