/**
 * Sinov to'plami (ustoz tayyorlagan real esselar) bo'yicha o'lchovlar. Sof funksiyalar — testlari: metrics.test.ts.
 * Format: docs/ESSAY_AI_EVAL.md.
 */

export type GoldType = "spelling" | "punctuation" | "affix" | "word";
export interface GoldError {
  type: GoldType;
  wrong: string;
  right: string;
}

const TYPE: Record<string, GoldType> = { I: "spelling", P: "punctuation", Q: "affix", S: "word" };

/**
 * Ustoz belgilagan matn: {yozilgani|to'g'risi|T}, T — I (imlo), P (punktuatsiya), Q (qo'shimcha), S (so'z qo'llash).
 * Masalan: "{Albatta|Albatta,|P} bu {dust|do'st|I}". Natija — o'quvchi yozgan sof matn va xatolar ro'yxati.
 */
export function parseTranscript(marked: string): { text: string; errors: GoldError[] } {
  const errors: GoldError[] = [];
  const text = marked.replace(/\{([^{}|]*)\|([^{}|]*)\|([IPQS])\}/g, (_m, wrong: string, right: string, t: string) => {
    errors.push({ type: TYPE[t], wrong, right });
    return wrong;
  });
  const left = text.match(/[{}]/);
  if (left) throw new Error(`Belgilashda xato: yopilmagan yoki noto'g'ri "{...}" (${text.slice(Math.max(0, (left.index ?? 0) - 20), (left.index ?? 0) + 20)})`);
  return { text, errors };
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ʻʼ‘’`´']/g, "'")
    .replace(/[«»“”„"]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** Levenshtein masofasi (xotira O(m)) */
export function levenshtein<T>(a: T[], b: T[]) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** O'qish xatosi: CER (harf) va WER (so'z). Tutuq belgisi variantlari va bo'shliqlar farqi hisobga olinmaydi; tinish belgilari hisobga olinadi */
export function cerWer(gold: string, ocr: string) {
  const g = norm(gold);
  const o = norm(ocr);
  const gw = g.split(" ").filter(Boolean);
  const ow = o.split(" ").filter(Boolean);
  return { cer: g.length ? levenshtein([...g], [...o]) / g.length : 0, wer: gw.length ? levenshtein(gw, ow) / gw.length : 0 };
}

const hasWord = (hay: string, q: string) => {
  const re = new RegExp(`(?<![\\p{L}\\p{N}'])${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}'])`, "u");
  return re.test(hay);
};

/**
 * O'qish o'quvchi xatosini saqlab qoldimi yoki "tuzatib yubordimi" (hisobotdagi asosiy xavf: tuzatilgan xato sanalmaydi).
 * kept — xato shakli o'qilgan matnda bor; corrected — xato shakli yo'q, to'g'ri shakli bor; unclear — ikkalasi ham yo'q.
 */
export function ocrErrorFidelity(errors: GoldError[], ocr: string) {
  const o = norm(ocr);
  let kept = 0;
  let corrected = 0;
  let unclear = 0;
  for (const e of errors) {
    const w = norm(e.wrong);
    const r = norm(e.right);
    if (w && hasWord(o, w)) kept++;
    else if (r && hasWord(o, r)) corrected++;
    else unclear++;
  }
  return { kept, corrected, unclear };
}

export interface Detected {
  type: string;
  wrong: string;
}

/**
 * AI topgan xatolarni ustoz xatolari bilan moslash (savodxonlik turlari bo'yicha).
 * Mos: tur bir xil va iqtiboslardan biri ikkinchisini o'z ichiga oladi. Har bir ustoz xatosi ko'pi bilan bir marta moslanadi.
 */
export function matchErrors(gold: GoldError[], ai: Detected[]) {
  const types: GoldType[] = ["spelling", "punctuation", "affix", "word"];
  const used = new Set<number>();
  const per = Object.fromEntries(types.map((t) => [t, { tp: 0, fp: 0, fn: 0 }])) as Record<GoldType, { tp: number; fp: number; fn: number }>;
  for (const a of ai) {
    if (!types.includes(a.type as GoldType)) continue;
    const w = norm(a.wrong);
    const i = gold.findIndex((g, k) => !used.has(k) && g.type === a.type && w && (w.includes(norm(g.wrong)) || norm(g.wrong).includes(w)));
    if (i >= 0) {
      used.add(i);
      per[a.type as GoldType].tp++;
    } else per[a.type as GoldType].fp++;
  }
  gold.forEach((g, k) => {
    if (!used.has(k)) per[g.type].fn++;
  });
  return per;
}

/** Aniqlik, to'liqlik va F0.5 (aniqlikka ikki baravar og'irlik: soxta xato o'quvchiga ball yo'qotadi) */
export function prf(tp: number, fp: number, fn: number) {
  const p = tp + fp ? tp / (tp + fp) : 1;
  const r = tp + fn ? tp / (tp + fn) : 1;
  const b2 = 0.25;
  const f = p + r ? ((1 + b2) * p * r) / (b2 * p + r) : 0;
  return { p, r, f05: f };
}

/** Kvadrat vaznli Kappa (QWK). Ballar 0, 0.5, … 2 → 0..4 toifalar */
export function qwk(a: number[], b: number[], k = 5) {
  const n = a.length;
  if (!n) return NaN;
  const A = a.map((x) => Math.round(x * 2));
  const B = b.map((x) => Math.round(x * 2));
  const O = Array.from({ length: k }, () => Array<number>(k).fill(0));
  A.forEach((x, i) => O[x][B[i]]++);
  const ra = O.map((row) => row.reduce((s, v) => s + v, 0));
  const cb = O[0].map((_, j) => O.reduce((s, row) => s + row[j], 0));
  let num = 0;
  let den = 0;
  for (let i = 0; i < k; i++)
    for (let j = 0; j < k; j++) {
      const w = (i - j) ** 2 / (k - 1) ** 2;
      num += w * O[i][j];
      den += (w * ra[i] * cb[j]) / n;
    }
  return den === 0 ? (num === 0 ? 1 : 0) : 1 - num / den;
}

const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / (x.length || 1);
const sd = (x: number[]) => Math.sqrt(mean(x.map((v) => (v - mean(x)) ** 2)));

/** Umumiy ball: o'rtacha mutlaq farq (MAE) va standartlashtirilgan o'rtacha farq (SMD; musbat — AI saxiyroq) */
export function totalAgreement(ai: number[], human: number[]) {
  const mae = mean(ai.map((v, i) => Math.abs(v - human[i])));
  const pooled = Math.sqrt((sd(ai) ** 2 + sd(human) ** 2) / 2);
  return { mae, smd: pooled ? (mean(ai) - mean(human)) / pooled : 0, bias: mean(ai) - mean(human) };
}

/** Bir xil ball va ±1 qadam (0,5) ichida mos kelish ulushi */
export function exactAdjacent(a: number[], b: number[]) {
  const n = a.length || 1;
  return { exact: a.filter((v, i) => v === b[i]).length / n, adjacent: a.filter((v, i) => Math.abs(v - b[i]) <= 0.5).length / n };
}
