import type { PrismaClient } from "@onatili/db";

const DAY = 86_400_000;
/** Toshkent vaqti bo'yicha "05.12" */
const ddmm = (d: Date) => new Date(d.getTime() + 5 * 3600_000).toISOString().slice(5, 10).split("-").reverse().join(".");

export type SendFn = (chatId: bigint, text: string, button?: { text: string; webAppUrl: string }) => Promise<unknown>;

/** Qaysi eslatma kerak: 0 hali erta, 1 "3 kun qoldi", 2 "1 kun qoldi", 3 "tugadi" */
export function reminderStageFor(endsAt: Date, now: Date): number {
  const left = endsAt.getTime() - now.getTime();
  if (left <= 0) return 3;
  if (left <= DAY) return 2;
  if (left <= 3 * DAY) return 1;
  return 0;
}

const TEXT: Record<number, (end: Date) => string> = {
  1: (e) => `⏳ Obunangiz tugashiga <b>3 kun</b> qoldi (${ddmm(e)} gacha). Darslar uzilib qolmasligi uchun oldindan uzaytirib qo'ying.`,
  2: (e) => `⏳ Obunangiz <b>ertaga</b> tugaydi (${ddmm(e)}). Hozir uzaytirsangiz, kunlar yo'qolmaydi: yangi muddat eski tugagan kundan boshlanadi.`,
  3: () => `⌛ Obunangiz tugadi. <b>1 kun</b> ichida uzaytirsangiz, darslar uzilmaydi.`,
};

/**
 * Online obunalar uchun to'lov jadvali: tugashidan oldin va tugaganda o'quvchiga eslatma.
 * Har soatda ishlaydi; har bir bosqich bir marta yuboriladi (Subscription.reminderStage).
 */
export async function runSubscriptionReminders(prisma: PrismaClient, send: SendFn, miniAppUrl: string | undefined, now = new Date()) {
  const subs = await prisma.subscription.findMany({
    where: { status: "ACTIVE", reminderStage: { lt: 3 }, endsAt: { gt: new Date(now.getTime() - 2 * DAY), lte: new Date(now.getTime() + 3 * DAY) } },
    include: { user: { select: { telegramId: true, isBlocked: true, role: true, student: { select: { group: { select: { isActive: true } } } } } } },
  });
  let sent = 0;
  for (const s of subs) {
    const stage = reminderStageFor(s.endsAt, now);
    if (stage <= s.reminderStage) continue;
    // Uzaytirilgan (keyingi obuna bor), offline guruhdagi yoki xodim: eslatma kerak emas
    const renewed = await prisma.subscription.count({ where: { userId: s.userId, status: "ACTIVE", endsAt: { gt: s.endsAt } } });
    const silent = renewed > 0 || s.user.telegramId === null || s.user.isBlocked || s.user.role !== "STUDENT" || s.user.student?.group?.isActive === true;
    // Shartli yangilash: ikki jarayon bir vaqtda ishlasa ham xabar bir marta ketadi
    const { count } = await prisma.subscription.updateMany({ where: { id: s.id, reminderStage: s.reminderStage }, data: { reminderStage: silent ? 3 : stage } });
    if (!count || silent) continue;
    await send(s.user.telegramId!, TEXT[stage](s.endsAt), miniAppUrl ? { text: "💳 Obunani uzaytirish", webAppUrl: `${miniAppUrl.replace(/\/$/, "")}/subscribe` } : undefined);
    sent++;
  }
  return { checked: subs.length, sent };
}
