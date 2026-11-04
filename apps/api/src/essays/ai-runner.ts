import type { PrismaClient } from "@onatili/db";
import { ESSAY_MAX_SCORE, ESSAY_SPECIAL, countWords, isMostlyCyrillic, rubricScore, type EssaySpecialKey } from "@onatili/shared";
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

  // Mezon: to'liq kirillcha -> 0; 100 so'zdan kam -> 2 (tekshirilmaydi). Buni AI emas, server aniq hisoblaydi
  const auto: EssaySpecialKey | null = isMostlyCyrillic(text) ? "CYRILLIC" : countWords(text) < 100 ? "TOO_SHORT" : null;
  const r = auto
    ? { special: auto, criteria: [], feedback: `${ESSAY_SPECIAL[auto].label}: mezon bo'yicha esse tekshirilmaydi va ${ESSAY_SPECIAL[auto].score} ball bilan baholanadi.${auto === "TOO_SHORT" ? ` Matningizda ${countWords(text)} ta so'z bor, kamida 100 ta kerak.` : ""}`, mistakes: [] }
    : await grade(e.prompt, text, handwritten);
  const special = (r.special ?? null) as EssaySpecialKey | null;
  const scored = rubricScore(special, r.criteria);
  const criteria = scored.criteria.map((c) => ({ ...c, comment: r.criteria.find((x) => x.key === c.key)?.comment ?? null }));
  const total = scored.total;
  const { count } = await prisma.essay.updateMany({ where: { id: essayId, status: "AI_CHECKING" }, data: { status: "AI_CHECKED", error: null } });
  if (!count) return null;
  await prisma.essayReview.create({ data: { essayId, source: "AI", provider: "deepseek", criteria, special, mistakes: r.mistakes, totalScore: total, feedback: r.feedback || null } });
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
