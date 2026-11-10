/**
 * To'lov davri: har o'quvchining o'z sanasidan (masalan, 05.11 – 04.12). Sanalar "YYYY-MM-DD" matni,
 * vaqt zonasi bilan bog'liq xato bo'lmasligi uchun hammasi UTC yarim tunida hisoblanadi.
 */
export const YMD_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const toDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const toYmd = (d: Date) => d.toISOString().slice(0, 10);

/** Toshkent (UTC+5) bo'yicha bugungi sana */
export const tashkentToday = (now: number = Date.now()) => toYmd(new Date(now + 5 * 3600 * 1000));

export const addDays = (ymd: string, days: number) => toYmd(new Date(toDate(ymd).getTime() + days * 86_400_000));

/** b - a, kunlarda (b keyin bo'lsa musbat) */
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);

/** Bir oydan keyingi sana: 31.01 -> 28.02 (oy kunlari yetmasa, oyning oxirgi kuni) */
export function addMonth(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // keyingi oyning kunlari soni
  return toYmd(new Date(Date.UTC(y, m, Math.min(d, last))));
}

/** Davr oxiri: boshidan bir oy keyingi sanadan bir kun oldin (05.11 -> 04.12) */
export const defaultPeriodEnd = (start: string) => addDays(addMonth(start), -1);

/** "2026-11" oyining birinchi va oxirgi kuni */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return { start: `${month}-01`, end: toYmd(new Date(Date.UTC(y, m, 0))) };
}

export const monthOfYmd = (ymd: string) => ymd.slice(0, 7);

/** "2026-11-05" -> "05.11" */
export const shortDate = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}`;
export const periodLabel = (start: string, end: string) => `${shortDate(start)} – ${shortDate(end)}`;
