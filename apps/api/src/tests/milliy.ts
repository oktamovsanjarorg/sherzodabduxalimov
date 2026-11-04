import type { Prisma } from "@onatili/db";
import { milliyBreakdown, type MilliyBreakdown } from "@onatili/shared";

/** Urinishdan Milliy sertifikat natijasini hisoblash uchun kerakli maydonlar */
export const milliySelect = {
  test: { select: { gradingScale: true, questions: { select: { questionId: true, points: true, question: { select: { type: true } } } } } },
  answers: { select: { questionId: true, points: true, textAnswer: true } },
} satisfies Prisma.AttemptSelect;

type Row = Prisma.AttemptGetPayload<{ select: typeof milliySelect }>;

/** Test qismi va yozma ishni ajratib, baholash mezonlari hujjati bo'yicha natija (Milliy sertifikat bo'lmasa null) */
export function milliyOf(a: Row): MilliyBreakdown | null {
  if (a.test.gradingScale !== "MILLIY_SERTIFIKAT") return null;
  const ans = new Map(a.answers.map((x) => [x.questionId, x]));
  let testScore = 0, testMax = 0, essayScore = 0, essayMax = 0, essayPending = false;
  for (const tq of a.test.questions) {
    const g = ans.get(tq.questionId);
    if (tq.question.type === "ESSAY") {
      essayMax += tq.points;
      essayScore += g?.points ?? 0;
      if (g?.textAnswer?.trim() && g.points == null) essayPending = true;
    } else {
      testMax += tq.points;
      testScore += g?.points ?? 0;
    }
  }
  return milliyBreakdown({ testScore, testMax, essayScore, essayMax, essayPending });
}
