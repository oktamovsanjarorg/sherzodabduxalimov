import { z } from "zod";
import type { BillingCard, MyPayment } from "./billing-types";

// ===================== Erkin esse (AI yoki ustoz tekshiradi) =====================

export type EssayModeName = "AI" | "TEACHER";
export type EssayStatusName = "DRAFT" | "AWAITING_PAYMENT" | "SUBMITTED" | "AI_CHECKING" | "AI_CHECKED" | "AI_FAILED" | "REVIEWED";

/**
 * Baholash mezonlari (jami 24 ball: Milliy sertifikatdagi esse topshirig'i bali).
 * Rasmiy mezonlar boshqacha bo'lsa, faqat shu jadvalni o'zgartirish kifoya.
 */
export const ESSAY_RUBRIC = [
  { key: "topic", label: "Mavzuga moslik", max: 4 },
  { key: "content", label: "Mazmun va dalillar", max: 6 },
  { key: "structure", label: "Tuzilish va mantiqiy izchillik", max: 4 },
  { key: "spelling", label: "Imlo va tinish belgilari", max: 6 },
  { key: "style", label: "Uslub va so'z boyligi", max: 4 },
] as const;
export const ESSAY_MAX_SCORE = ESSAY_RUBRIC.reduce((s, c) => s + c.max, 0);
export type EssayCriterionKey = (typeof ESSAY_RUBRIC)[number]["key"];

export const MAX_ESSAY_PAGES = 4;
export const AI_ESSAY_DAILY_LIMIT = 2;
export const ESSAY_STATUS_LABELS: Record<EssayStatusName, string> = {
  DRAFT: "Qoralama",
  AWAITING_PAYMENT: "To'lov kutilmoqda",
  SUBMITTED: "Ustoz tekshirmoqda",
  AI_CHECKING: "AI tekshirmoqda",
  AI_CHECKED: "AI tekshirdi",
  AI_FAILED: "AI tekshira olmadi",
  REVIEWED: "Ustoz tekshirdi",
};

export interface EssayReviewView {
  source: "AI" | "TEACHER";
  reviewer: string | null;
  criteria: { key: string; label: string; score: number; max: number; comment: string | null }[];
  totalScore: number;
  maxScore: number;
  feedback: string | null;
  /** Faqat AI: topilgan xatolar */
  mistakes: { wrong: string; right: string; note: string | null }[];
  createdAt: string;
}

export interface MyEssaySummary {
  id: string;
  mode: EssayModeName;
  prompt: string;
  status: EssayStatusName;
  score: { total: number; max: number } | null;
  createdAt: string;
}

export interface MyEssayDetail extends MyEssaySummary {
  text: string | null;
  pages: number;
  priceUzs: number | null;
  error: string | null;
  /** To'lov (faqat ustoz tekshiruvi) */
  payment: MyPayment | null;
  reviews: EssayReviewView[];
}

export interface EssayConfig {
  /** AI yozilgan matnni tekshira oladi */
  aiEnabled: boolean;
  /** AI qo'lyozma rasmini o'qiy oladi */
  aiPhotoEnabled: boolean;
  aiDailyLimit: number;
  aiUsedToday: number;
  /** Ustoz tekshiruvi narxi; null bo'lsa hali yoqilmagan */
  teacherPriceUzs: number | null;
  card: BillingCard | null;
}

export const createEssayInput = z
  .object({
    mode: z.enum(["AI", "TEACHER"]),
    prompt: z.string().trim().min(3, "Esse mavzusini yozing").max(300),
    text: z.string().trim().max(20_000).nullable().default(null),
  })
  // AI: matn yozilsa kamida 30 so'z; matnsiz bo'lsa varoq rasmlari yuklanadi
  .refine((d) => d.mode !== "AI" || !d.text || (d.text.match(/\S+/g)?.length ?? 0) >= 30, { message: "AI tekshiruvi uchun kamida 30 so'zli matn kerak", path: ["text"] });
export type CreateEssayInput = z.infer<typeof createEssayInput>;

export const teacherEssayReviewInput = z.object({
  criteria: z.array(z.object({ key: z.string(), score: z.coerce.number().min(0).max(100), comment: z.string().trim().max(1000).nullable().default(null) })).min(1),
  feedback: z.string().trim().max(5000).nullable().default(null),
});
export type TeacherEssayReviewInput = z.infer<typeof teacherEssayReviewInput>;

export interface AdminHwEssay {
  id: string;
  student: { id: string; name: string; username: string | null; phone: string | null };
  mode: EssayModeName;
  prompt: string;
  text: string | null;
  pages: number;
  status: EssayStatusName;
  createdAt: string;
  reviews: EssayReviewView[];
}
