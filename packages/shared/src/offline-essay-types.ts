import { z } from "zod";
import type { EssayAnnotations } from "./annotation-types";
import { ESSAY_MAX_SCORE, MAX_ESSAY_PAGES, type EssayReviewView } from "./essay-types";

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

/** Ustoz tasdiqlagan yakuniy ball (24 ballik, 0,5 qadam) */
export const offlineEssayConfirmBody = z.object({
  score: z
    .number()
    .min(0)
    .max(ESSAY_MAX_SCORE)
    .refine((x) => Math.round(x * 2) === x * 2, "Ball 0,5 qadam bilan"),
});

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
}
