import type { PrismaClient } from "@onatili/db";
import { ESSAY_MAX_SCORE, ESSAY_RUBRIC } from "@onatili/shared";
import type { AiEssayResult } from "../ai/deepseek";
import type { SendFn } from "../billing/reminders";
import { esc } from "../notify/telegram";

export type GradeFn = (topic: string, text: string) => Promise<AiEssayResult>;

/** Bitta esseni AI bilan baholaydi va natijani saqlaydi. Worker chaqiradi; testda grade soxta bo'ladi. */
export async function gradeEssayJob(prisma: PrismaClient, essayId: string, grade: GradeFn, send: SendFn, miniAppUrl: string | undefined) {
  const e = await prisma.essay.findUnique({ where: { id: essayId }, include: { user: { select: { telegramId: true } } } });
  if (!e || e.status !== "AI_CHECKING" || !e.text) return null; // o'chirilgan yoki allaqachon tekshirilgan
  const r = await grade(e.prompt, e.text);
  const criteria = ESSAY_RUBRIC.map((c) => {
    const got = r.criteria.find((x) => x.key === c.key);
    return { key: c.key, label: c.label, max: c.max, score: got?.score ?? 0, comment: got?.comment ?? null };
  });
  const total = criteria.reduce((s, c) => s + c.score, 0);
  const { count } = await prisma.essay.updateMany({ where: { id: essayId, status: "AI_CHECKING" }, data: { status: "AI_CHECKED", error: null } });
  if (!count) return null;
  await prisma.essayReview.create({ data: { essayId, source: "AI", provider: "deepseek", criteria, mistakes: r.mistakes, totalScore: total, feedback: r.feedback || null } });
  await send(
    e.user.telegramId,
    `🤖 <b>AI essengizni tekshirdi</b>\n«${esc(e.prompt.slice(0, 80))}»\nTaxminiy ball: <b>${total} / ${ESSAY_MAX_SCORE}</b>`,
    miniAppUrl ? { text: "Natija va xatolarni ko'rish", webAppUrl: `${miniAppUrl.replace(/\/$/, "")}/essays/${essayId}` } : undefined,
  );
  return total;
}

/** Barcha urinishlar tugadi: o'quvchi qayta urinishi mumkin (bugungi limitga hisoblanmaydi) */
export async function markEssayFailed(prisma: PrismaClient, essayId: string, message: string) {
  await prisma.essay.updateMany({ where: { id: essayId, status: "AI_CHECKING" }, data: { status: "AI_FAILED", error: message.slice(0, 500) } });
}
