// Admin panel bo'ylab bir xil ko'rinish uchun umumiy formatlar

/** 06.11.2026 */
export const fmtDate = (iso: string | Date) => new Date(iso).toLocaleDateString("ru-RU");

/** "2026-11-05" (sana matni) -> 05.11.2026, vaqt zonasisiz */
export const fmtYmd = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`;

/** 06.11.2026, 14:05 */
export const fmtDateTime = (iso: string | Date) =>
  new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** 06.11, 14:05 — joriy yil uchun qisqa ko'rinish (ro'yxatlarda) */
export const fmtShortDateTime = (iso: string | Date) =>
  new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Ro'yxatdagi qisqa ko'rinish uchun Markdown belgilarini olib tashlaydi (**qalin**, *kursiv*, # sarlavha) */
export const plainText = (md: string) =>
  md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|[\s(])[*_]|[*_](?=[\s.,;:!?)]|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
