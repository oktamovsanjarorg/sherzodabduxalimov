import { ESSAY_RUBRIC } from "./essay-types";

/**
 * AI bahosi va ustoz bahosini solishtirish (AI qayerda adashishini o'lchash). Faqat haqiqiy ustoz bahosi bilan:
 * docs/ESSAY_AI_RESEARCH.md. Sof funksiyalar: API statistikasi va testlar shu yerdan foydalanadi.
 */

export interface RubricSnapshot {
  special: string | null;
  scores: Record<string, number>;
  total: number;
}

export interface AgreementBand {
  key: string;
  label: string;
  /** Ikkalasi ham shu bandni baholagan esselar */
  n: number;
  /** AI − ustoz o'rtacha farqi: musbat — AI oshirib qo'yadi, manfiy — pasaytirib */
  meanDiff: number;
  /** AI ustoz bilan aynan bir xil ball qo'ygan ulush (0..1) */
  exact: number;
}

export interface EssayAgreement {
  /** Ustoz baholagan va o'sha paytda AI bahosi bo'lgan esselar */
  count: number;
  /** Umumiy ball farqining o'rtachasi (mutlaq, 24 ballik) */
  meanAbs: number | null;
  /** Farq 2 balldan oshmagan ulush (0..1) */
  within2: number | null;
  /** AI ustozdan yuqori, past va teng qo'ygan esselar soni */
  higher: number;
  lower: number;
  equal: number;
  /** Bandlar: farqi kattasi birinchi */
  bands: AgreementBand[];
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function essayAgreement(pairs: { ai: RubricSnapshot; teacher: RubricSnapshot }[]): EssayAgreement {
  const diffs = pairs.map((p) => p.ai.total - p.teacher.total);
  const n = diffs.length;
  const bands = ESSAY_RUBRIC.map((c) => {
    // Maxsus holatda bandlar baholanmaydi: faqat ikkalasi ham 12 band bo'yicha baholaganlar
    const d = pairs
      .filter((p) => !p.ai.special && !p.teacher.special && p.ai.scores[c.key] !== undefined && p.teacher.scores[c.key] !== undefined)
      .map((p) => p.ai.scores[c.key] - p.teacher.scores[c.key]);
    return {
      key: c.key as string,
      label: c.label as string,
      n: d.length,
      meanDiff: d.length ? r2(d.reduce((s, x) => s + x, 0) / d.length) : 0,
      exact: d.length ? r2(d.filter((x) => x === 0).length / d.length) : 0,
    };
  })
    .filter((b) => b.n > 0)
    .sort((a, b) => Math.abs(b.meanDiff) - Math.abs(a.meanDiff) || a.exact - b.exact);
  return {
    count: n,
    meanAbs: n ? r2(diffs.reduce((s, x) => s + Math.abs(x), 0) / n) : null,
    within2: n ? r2(diffs.filter((x) => Math.abs(x) <= 2).length / n) : null,
    higher: diffs.filter((x) => x > 0).length,
    lower: diffs.filter((x) => x < 0).length,
    equal: diffs.filter((x) => x === 0).length,
    bands,
  };
}

const tokens = (t: string) => t.match(/\S+/g) ?? [];

/**
 * AI o'qigan matn va ustoz tuzatgan matn orasidagi so'z farqi (so'z darajasidagi Levenshtein: almashtirilgan,
 * tushib qolgan va ortiqcha so'zlar). Tinish belgisi so'zga yopishgan holda solishtiriladi: AI vergulni
 * "tuzatib" yuborsa ham farq sanaladi. words — ustoz matnidagi so'zlar (to'g'ri matn).
 */
export function wordChanges(ai: string, fixed: string): { words: number; errors: number } {
  const a = tokens(ai);
  const b = tokens(fixed);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return { words: b.length, errors: prev[b.length] };
}
