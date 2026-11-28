import { z } from "zod";
import { textMarkSchema, type TextMark } from "./annotation-types";
import { ESSAY_RUBRIC, ESSAY_SPECIAL, RUBRIC_STEPS, type EssaySpecialKey } from "./essay-types";

/**
 * Esse AI'ni o'lchash uchun sinov to'plami (docs/ESSAY_AI_EVAL.md).
 * Har bir esse: varoq rasmlari, aynan ko'chirilgan matn (xatolari belgilangan) va kamida ikki ustozning
 * bir-birini ko'rmasdan qo'ygan bahosi.
 */
export const GOLD_TARGET = 50;
/** Bundan kam esse bo'lsa, o'lchovdan xulosa chiqarilmaydi */
export const GOLD_MIN = 30;

export const goldCreateInput = z.object({
  topic: z.string().trim().min(3, "Mavzuni yozing").max(2000),
  consent: z.literal(true, { message: "O'quvchi roziligi kerak" }),
});
export type GoldCreateInput = z.infer<typeof goldCreateInput>;

export const goldFromEssayInput = z.object({
  consent: z.literal(true, { message: "O'quvchi roziligi kerak" }),
});

export const goldTranscriptInput = z.object({
  transcript: z.string().max(20_000),
  marks: z.array(textMarkSchema).max(500),
});
export type GoldTranscriptInput = z.infer<typeof goldTranscriptInput>;

export const essaySpecialSchema = z.enum(Object.keys(ESSAY_SPECIAL) as [EssaySpecialKey, ...EssaySpecialKey[]]);
export const rubricStepSchema = z.number().refine((n) => (RUBRIC_STEPS as readonly number[]).includes(n), "Ball 0, 0.5, 1, 1.5 yoki 2");
const specialKey = essaySpecialSchema;
const step = rubricStepSchema;

export const goldRatingInput = z
  .object({
    special: specialKey.nullable().default(null),
    scores: z.record(z.string(), step).default({}),
  })
  .refine((r) => r.special !== null || ESSAY_RUBRIC.every((c) => r.scores[c.key] !== undefined), "Hamma 12 bandni baholang");
export type GoldRatingInput = z.infer<typeof goldRatingInput>;

export interface GoldSummary {
  total: number;
  transcribed: number;
  /** Kamida ikki ustoz baholagan */
  doubleRated: number;
  /** O'lchovga tayyor: ko'chirilgan va ikki baho bor */
  ready: number;
  target: number;
  min: number;
}

export interface GoldRow {
  id: string;
  topic: string;
  pages: number;
  /** Botdagi esseden olingan (aks holda qog'ozdagi esse yuklangan) */
  fromBot: boolean;
  transcribed: boolean;
  marks: number;
  ratings: number;
  ratedByMe: boolean;
  createdAt: string;
}

export interface GoldRatingView {
  rater: string;
  mine: boolean;
  special: EssaySpecialKey | null;
  scores: Record<string, number>;
  total: number;
}

export interface GoldDetail {
  id: string;
  topic: string;
  pages: number;
  fromBot: boolean;
  transcript: string | null;
  marks: TextMark[];
  transcribedBy: string | null;
  /** Qo'lyozmani AI o'qigan matn: ko'chirish shundan boshlanadi (ustoz faqat tuzatadi) */
  aiText: string | null;
  /** Mening bahom (bo'lsa) */
  myRating: GoldRatingView | null;
  /** Boshqalarning bahosi faqat o'zim baholagandan keyin ko'rinadi (mustaqil baho) */
  others: GoldRatingView[] | null;
  otherCount: number;
  createdAt: string;
}

export interface GoldList {
  summary: GoldSummary;
  rows: GoldRow[];
}

/** O'lchovda hisobga olinadigan xato turlari: mezonning 4 ta "soniga qarab" bandi */
const GOLD_TYPES: Record<string, "I" | "P" | "Q" | "S"> = { spelling: "I", punctuation: "P", affix: "Q", word: "S" };

/**
 * Ko'chirilgan matn + belgilar → o'lchov formati: `{yozilgani|to'g'risi|T}`.
 * Boshqa turdagi (uslub, mantiq) yoki ustma-ust tushgan belgilar o'tkazib yuboriladi va sanaladi.
 */
export function toGoldMarkup(text: string, marks: TextMark[]): { markup: string; skipped: number } {
  const clean = (s: string) => s.replace(/[{}|]/g, "");
  const sorted = [...marks].sort((a, b) => a.start - b.start);
  let out = "";
  let pos = 0;
  let skipped = 0;
  for (const m of sorted) {
    const t = GOLD_TYPES[m.type];
    if (!t || m.start < pos || m.end > text.length || m.end <= m.start) {
      skipped++;
      continue;
    }
    const wrong = text.slice(m.start, m.end);
    out += clean(text.slice(pos, m.start)) + `{${clean(wrong)}|${clean(m.note ?? wrong)}|${t}}`;
    pos = m.end;
  }
  return { markup: out + clean(text.slice(pos)), skipped };
}
