import type { Prisma } from "@onatili/db";
import { addDays, daysBetween, monthBounds, monthOfYmd, tashkentToday } from "@onatili/shared";

/** @db.Date ustuniga yoziladigan qiymat */
export const dateCol = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
export const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

export interface PayRecord {
  month: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidOn: Date | null;
  createdAt: Date;
}

/** Davr ustunlari bo'sh (eski yozuv) bo'lsa, butun oy; to'lov kuni — yozilgan kun */
export function effective(p: PayRecord) {
  const b = monthBounds(p.month);
  return {
    start: p.periodStart ? ymdOf(p.periodStart) : b.start,
    end: p.periodEnd ? ymdOf(p.periodEnd) : b.end,
    paidOn: p.paidOn ? ymdOf(p.paidOn) : tashkentToday(p.createdAt.getTime()),
  };
}

/**
 * "Bugun to'langanmi": bugungi sana to'lov davriga tushadi. Eski yozuvda (davr yo'q) joriy oyning o'zi.
 * O'quvchining o'z sanasidan hisoblangan davr kalendar oy bilan mos tushmaydi, shuning uchun oy emas, sana tekshiriladi.
 */
export function paidNowWhere(today = tashkentToday()): Prisma.OfflinePaymentWhereInput {
  return { OR: [{ periodStart: { lte: dateCol(today) }, periodEnd: { gte: dateCol(today) } }, { periodEnd: null, month: monthOfYmd(today) }] };
}

/** Hisobotdagi oy uchun solishtirma sana: joriy oy bo'lsa bugun, o'tgan oy bo'lsa uning oxirgi kuni */
export const referenceDate = (month: string, today = tashkentToday()) => (monthOfYmd(today) === month ? today : monthBounds(month).end);

/** Oy uchun to'lov: shu oyning solishtirma sanasini qoplagan davr (eski yozuv butun oy bo'lib qoplaydi) */
export function pickPayment<T extends PayRecord>(pays: T[], month: string, today = tashkentToday()): T | undefined {
  const ref = referenceDate(month, today);
  const covering = pays.filter((p) => {
    const e = effective(p);
    return e.start <= ref && e.end >= ref;
  });
  const latest = (a: T, b: T) => (effective(a).end >= effective(b).end ? a : b);
  return covering.length ? covering.reduce(latest) : undefined;
}

/** Davr qaysi sanagacha to'langan (hisobotdagi sanagacha boshlangan davrlar ichida) va necha kun o'tgan */
export function coverage(pays: PayRecord[], ref: string) {
  const ends = pays.map(effective).filter((e) => e.start <= ref).map((e) => e.end);
  const coveredUntil = ends.length ? ends.reduce((a, b) => (a >= b ? a : b)) : null;
  return {
    coveredUntil,
    overdueDays: coveredUntil && ref > coveredUntil ? daysBetween(coveredUntil, ref) : null,
    nextPeriodStart: coveredUntil ? addDays(coveredUntil, 1) : tashkentToday(),
  };
}
