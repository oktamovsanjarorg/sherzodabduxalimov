import type { PrismaClient } from "@onatili/db";

/**
 * Umumiy oylik narx: Tariflardagi faol oylik tarif (28–31 kun) narxi. Offline guruhga alohida narx
 * yozilmagan bo'lsa shu olinadi. Oylik tarif bo'lmasa null.
 */
export async function defaultMonthlyFee(prisma: Pick<PrismaClient, "plan">): Promise<number | null> {
  const p = await prisma.plan.findFirst({
    where: { isActive: true, durationDays: { gte: 28, lte: 31 } },
    orderBy: [{ sortOrder: "asc" }, { priceUzs: "asc" }],
    select: { priceUzs: true },
  });
  return p?.priceUzs ?? null;
}

/** Guruhning amaldagi oylik narxi: o'z narxi, bo'lmasa umumiy */
export const effectiveFee = (own: number | null | undefined, fallback: number | null) => own ?? fallback;
