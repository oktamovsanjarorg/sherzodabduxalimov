// Admin panel bo'ylab bir xil ko'rinish uchun umumiy formatlar

/** 06.11.2026 */
export const fmtDate = (iso: string | Date) => new Date(iso).toLocaleDateString("ru-RU");

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
