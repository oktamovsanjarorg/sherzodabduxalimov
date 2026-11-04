import type { PrismaClient } from "@onatili/db";
import { ESSAY_MAX_SCORE, ESSAY_RUBRIC } from "@onatili/shared";
import type { AiEssayResult } from "../ai/deepseek";
import type { SendFn } from "../billing/reminders";
import { esc } from "../notify/telegram";

export type GradeFn = (topic: string, text: string, handwritten: boolean) => Promise<AiEssayResult>;
/** Varoq rasmlarini matnga aylantiradi (nisbiy yo'llar: essays/<id>/<n>.jpg) */
export type ReadFn = (imagePaths: string[]) => Promise<string>;

export const NO_ESSAY_ERROR = "Rasmda esse matni topilmadi. Varoqni yorug' joyda, tekis va aniq qilib suratga oling.";

/** Bitta esseni AI bilan baholaydi va natijani saqlaydi. Worker chaqiradi; testda grade soxta bo'ladi. */
export async function gradeEssayJob(prisma: PrismaClient, essayId: string, grade: GradeFn, send: SendFn, miniAppUrl: string | undefined, read?: ReadFn) {
  const e = await prisma.essay.findUnique({ where: { id: essayId }, include: { user: { select: { telegramId: true } } } });
  if (!e || e.status !== "AI_CHECKING") return null; // o'chirilgan yoki allaqachon tekshirilgan
  const handwritten = e.imageUrls.length > 0;
  let text = e.text;
  if (!text && handwritten) {
    if (!read) throw new Error("Qo'lyozmani o'qish sozlanmagan");
    const got = (await read(e.imageUrls)).trim();
    if (!got || /^NO_ESSAY\b/.test(got) || (got.match(/\S+/g)?.length ?? 0) < 15) {
      await prisma.essay.updateMany({ where: { id: essayId, status: "AI_CHECKING" }, data: { status: "AI_FAILED", error: NO_ESSAY_ERROR } });
      return null;
    }
    text = got;
    // O'qilgan matn saqlanadi: qayta urinishda yana o'qilmaydi, o'quvchi va ustoz ham ko'radi
    await prisma.essay.update({ where: { id: essayId }, data: { text } });
  }
  if (!text) return null;
  const r = await grade(e.prompt, text, handwritten);
  const criteria = ESSAY_RUBRIC.map((c) => {
    const got = r.criteria.find((x) => x.key === c.key);
    return { key: c.key, label: c.label, max: c.max, score: got?.score ?? 0, comment: got?.comment ?? null };
  });
  const total = criteria.reduce((s, c) => s + c.score, 0);
  const { count } = await prisma.essay.updateMany({ where: { id: essayId, status: "AI_CHECKING" }, data: { status: "AI_CHECKED", error: null } });
  if (!count) return null;
  await prisma.essayReview.create({ data: { essayId, source: "AI", provider: "deepseek", criteria, mistakes: r.mistakes, totalScore: total, feedback: r.feedback || null } });
  if (e.user.telegramId !== null) await send(
    e.user.telegramId,
    `🤖 <b>AI essengizni tekshirdi</b>\n«${esc(e.prompt.slice(0, 80))}»\nTaxminiy ball: <b>${total} / ${ESSAY_MAX_SCORE}</b>`,
    miniAppUrl ? { text: "Natija va xatolarni ko'rish", webAppUrl: `${miniAppUrl.replace(/\/$/, "")}/essays/${essayId}` } : undefined,
  );
  return total;
}

/** Barcha urinishlar tugadi: o'quvchi qayta urinishi mumkin (bugungi limitga hisoblanmaydi) */
export async function markEssayFailed(prisma: PrismaClient, essayId: string, message: string) {
  console.error(`[essay-ai] ${essayId}: ${message}`);
  await prisma.essay.updateMany({ where: { id: essayId, status: "AI_CHECKING" }, data: { status: "AI_FAILED", error: null } });
}
