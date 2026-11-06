import type { Prisma } from "@onatili/db";
import { ESSAY_MAX_SCORE, estimateTheta, milliyBreakdown, raschT, type MilliyBreakdown } from "@onatili/shared";

/** Urinishdan Milliy sertifikat natijasini hisoblash uchun kerakli maydonlar */
export const milliySelect = {
  test: {
    select: {
      gradingScale: true,
      raschMu: true,
      raschSigma: true,
      raschN: true,
      questions: { orderBy: { order: "asc" as const }, select: { questionId: true, points: true, raschB: true, question: { select: { type: true } } } },
    },
  },
  answers: { select: { questionId: true, points: true, isCorrect: true, textAnswer: true } },
} satisfies Prisma.AttemptSelect;

type Row = Prisma.AttemptGetPayload<{ select: typeof milliySelect }>;

/**
 * Baholash mezonlari hujjati bo'yicha natija:
 * - test qismi Rasch modeli bilan: savol qiyinliklari bo'yicha θ, so'ng T = 50 + 10(θ − μ)/σ (0..75).
 *   Kalibrlash uchun natijalar yetarli bo'lmasa: barcha savollar teng qiyin, μ = 0, σ = 1 (dastlabki baho);
 * - yozma ish 24 ballik mezon bo'yicha, jadval asosida 75 ballik shkalaga;
 * - umumiy ball ikki qismning o'rtachasi.
 * Milliy sertifikat bo'lmasa null.
 */
export function milliyOf(a: Row): MilliyBreakdown | null {
  const t = a.test;
  if (t.gradingScale !== "MILLIY_SERTIFIKAT") return null;
  const ans = new Map(a.answers.map((x) => [x.questionId, x]));
  const items = t.questions.filter((q) => q.question.type !== "ESSAY");
  const essays = t.questions.filter((q) => q.question.type === "ESSAY");

  const responses = items.map((q) => (ans.get(q.questionId)?.isCorrect ? 1 : 0) as 0 | 1);
  const calibrated = t.raschMu !== null && t.raschSigma !== null && items.every((q) => q.raschB !== null);
  const b = items.map((q) => (calibrated ? q.raschB! : 0));
  const theta = estimateTheta(responses, b);
  const scaled = calibrated ? raschT(theta, t.raschMu!, t.raschSigma!) : raschT(theta, 0, 1);

  // Esse: Milliy sertifikatda ball har doim rasmiy mezon bo'yicha 0..24 saqlanadi (savolning "points"i ishlatilmaydi)
  let essayScore24: number | null = null;
  let essayPending = false;
  for (const q of essays) {
    const g = ans.get(q.questionId);
    if (g?.textAnswer?.trim() && g.points == null) essayPending = true;
    if (g?.points != null) essayScore24 = Math.min(ESSAY_MAX_SCORE, (essayScore24 ?? 0) + g.points);
  }

  return milliyBreakdown({
    test: { correct: responses.filter(Boolean).length, total: items.length, theta, scaled, calibrated, sampleSize: t.raschN },
    essayScore24,
    hasEssay: essays.length > 0,
    essayPending,
  });
}
