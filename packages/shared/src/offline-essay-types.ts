import { z } from "zod";
import type { EssayAnnotations } from "./annotation-types";
import { ESSAY_RUBRIC, MAX_ESSAY_PAGES, type EssaySpecialKey, type EssayReviewView } from "./essay-types";
import type { EssayAgreement } from "./essay-agreement";
import { essaySpecialSchema, rubricStepSchema } from "./gold-types";

/**
 * Offline (qog'ozda o'tkazilgan) test essesi: ustoz varoqni suratga oladi, AI o'qib taxminiy baho beradi,
 * ustoz tasdiqlaganda ball natijaga yoziladi. AI o'zi hech qachon ball yozmaydi.
 */
export const OFFLINE_ESSAY_MAX_PAGES = MAX_ESSAY_PAGES;

export type OfflineEssayStatus = "NONE" | "DRAFT" | "CHECKING" | "CHECKED" | "FAILED";

export const OFFLINE_ESSAY_STATUS_LABELS: Record<OfflineEssayStatus, string> = {
  NONE: "Rasm yo'q",
  DRAFT: "Yuklangan",
  CHECKING: "AI tekshirmoqda",
  CHECKED: "AI baholadi",
  FAILED: "AI tekshira olmadi",
};

export const offlineEssayPromptBody = z.object({
  prompt: z.string().trim().min(10, "Mavzuni to'liq yozing").max(4000),
});

/**
 * Ustoz bahosi: 12 band (yoki maxsus holat). Yakuniy ball serverda shu bandlardan hisoblanadi.
 * transcript: AI o'qigan matnni ustoz varoq bilan solishtirib tuzatgani; null — solishtirilmagan.
 */
export const offlineEssayConfirmBody = z
  .object({
    special: essaySpecialSchema.nullable().default(null),
    scores: z.record(z.string(), rubricStepSchema).default({}),
    transcript: z.string().max(20_000).nullable().default(null),
  })
  .refine((r) => r.special !== null || ESSAY_RUBRIC.every((c) => r.scores[c.key] !== undefined), "Hamma 12 bandni baholang");
export type OfflineEssayConfirmInput = z.infer<typeof offlineEssayConfirmBody>;

/** AI'ga yuborish: tanlanganlar yoki (bo'sh bo'lsa) varog'i bor, hali tekshirilmaganlarning hammasi */
export const offlineEssayCheckBody = z.object({ resultIds: z.array(z.string()).max(500).default([]) });

export interface OfflineEssayTest {
  id: string;
  title: string;
  takenAt: string | null;
  /** Milliy shkaladagi natijalar soni (essesi bo'lishi mumkin bo'lganlar) */
  total: number;
  withPages: number;
  aiChecked: number;
  /** Ustoz ball qo'ygan (essayScore bor) */
  confirmed: number;
}

export interface OfflineEssayRow {
  resultId: string;
  name: string;
  student: { id: string; name: string } | null;
  status: OfflineEssayStatus;
  pages: number;
  /** AI taxminiy bahosi (24 ballik) */
  aiTotal: number | null;
  /** Ustoz tasdiqlagan ball */
  essayScore: number | null;
  error: string | null;
}

export interface OfflineEssayTestDetail {
  id: string;
  title: string;
  essayPrompt: string | null;
  aiEnabled: boolean;
  rows: OfflineEssayRow[];
}

export interface OfflineEssayAi {
  special: { key: string; label: string } | null;
  criteria: EssayReviewView["criteria"];
  total: number;
  mistakes: EssayReviewView["mistakes"];
  annotations: EssayAnnotations | null;
  feedback: string | null;
  provider: string | null;
}

export interface OfflineEssayDetail {
  resultId: string;
  testId: string;
  name: string;
  status: OfflineEssayStatus;
  pages: number;
  /** AI o'qigan matn */
  text: string | null;
  /** Qaysi mavzu bo'yicha tekshirilgan */
  prompt: string | null;
  ai: OfflineEssayAi | null;
  error: string | null;
  essayScore: number | null;
  /** Ustoz tuzatgan matn (AI o'qigani bilan solishtirilgan) */
  transcript: string | null;
  review: OfflineEssayTeacherReview | null;
}

/** Ustozning saqlangan bahosi. aiTotal — ustoz baholagan paytdagi AI bahosi (keyin AI qayta tekshirsa ham o'zgarmaydi) */
export interface OfflineEssayTeacherReview {
  special: EssaySpecialKey | null;
  scores: Record<string, number>;
  total: number;
  aiTotal: number | null;
  reviewer: string | null;
  reviewedAt: string;
}

/** «AI va ustoz»: ustoz baholagan offline esselar bo'yicha AI qanchalik adashadi */
export interface OfflineEssayAgreement extends EssayAgreement {
  /** Bundan kam esse bo'lsa xulosa chiqarilmaydi */
  min: number;
  /** AI o'qigan matnni ustoz varoq bilan solishtirgan esselar: errors — AI noto'g'ri o'qigan so'zlar */
  transcripts: { count: number; words: number; errors: number };
}
