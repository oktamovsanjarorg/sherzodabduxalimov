import { z } from "zod";

/**
 * Ustozning esse ustidagi belgilari (rasmiy talab: "har bir xato belgilab, so'z ustiga xato turi yozib ko'rsatiladi").
 * Koordinatalar rasmga nisbatan 0..1 (rasm o'lchamidan qat'i nazar aniq joylashadi).
 */
export const ERROR_TYPES = [
  { key: "spelling", label: "Imlo", short: "I" },
  { key: "punctuation", label: "Punktuatsiya", short: "P" },
  { key: "affix", label: "Qo'shimcha", short: "Q" },
  { key: "word", label: "So'z qo'llash", short: "S" },
  { key: "style", label: "Uslub", short: "U" },
  { key: "logic", label: "Mantiq/izchillik", short: "M" },
  { key: "other", label: "Boshqa", short: "!" },
] as const;
export type ErrorTypeKey = (typeof ERROR_TYPES)[number]["key"];
export const errorTypeLabel = (k: string) => ERROR_TYPES.find((t) => t.key === k)?.label ?? k;
const errorType = z.enum(ERROR_TYPES.map((t) => t.key) as [ErrorTypeKey, ...ErrorTypeKey[]]);

const coord = z.number().min(0).max(1);
export const strokeSchema = z.object({
  tool: z.enum(["pen", "marker"]),
  /** Chiziq qalinligi (rasm kengligiga nisbatan) */
  width: z.number().min(0.0005).max(0.05),
  points: z.array(z.tuple([coord, coord])).min(1).max(4000),
});
export const markSchema = z.object({
  x: coord,
  y: coord,
  type: errorType,
  /** To'g'ri shakli yoki qisqa izoh */
  note: z.string().trim().max(120).nullable().default(null),
});
export const pageAnnotationsSchema = z.object({
  strokes: z.array(strokeSchema).max(1500).default([]),
  marks: z.array(markSchema).max(300).default([]),
});
export const textMarkSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(1),
  type: errorType,
  note: z.string().trim().max(120).nullable().default(null),
});
export const essayAnnotationsSchema = z.object({
  /** Varoqlar tartibida */
  pages: z.array(pageAnnotationsSchema).max(4).default([]),
  /** Matndagi belgilar (yozilgan esse) */
  text: z.array(textMarkSchema).max(500).default([]),
});
export type Stroke = z.infer<typeof strokeSchema>;
export type PageMark = z.infer<typeof markSchema>;
export type PageAnnotations = z.infer<typeof pageAnnotationsSchema>;
export type TextMark = z.infer<typeof textMarkSchema>;
export type EssayAnnotations = z.infer<typeof essayAnnotationsSchema>;

/** Xato turlari bo'yicha soni (mezonning "1–2 o'rinda", "3–4 o'rinda" bandlarini qo'yishga yordam) */
export function countMarks(a: EssayAnnotations | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!a) return out;
  for (const p of a.pages) for (const m of p.marks) out[m.type] = (out[m.type] ?? 0) + 1;
  for (const m of a.text) out[m.type] = (out[m.type] ?? 0) + 1;
  return out;
}
