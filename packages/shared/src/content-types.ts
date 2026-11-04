import { z } from "zod";

// ===================== Kontent (o'quvchi ko'rinishi) =====================

export interface LessonSummary {
  id: string;
  title: string;
  durationSec: number | null;
  isFree: boolean;
  locked: boolean; // obuna kerak
  completed: boolean;
}

export interface TestSummary {
  id: string;
  title: string;
  type: "TOPIC" | "MOCK";
  isFree: boolean;
  locked: boolean;
  questionCount: number;
  timeLimitSec: number | null;
  bestPercent: number | null; // eng yaxshi natija, %
  inProgressAttemptId: string | null;
  /** Nashr qilinmagan: faqat ustoz/yordamchiga ko'rinadi (sinab ko'rish uchun) */
  isDraft?: boolean;
}

export interface TopicView {
  id: string;
  title: string;
  lessons: LessonSummary[];
  tests: TestSummary[];
}

export interface CourseView {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  topics: TopicView[];
  progress: { completed: number; total: number };
}

export interface LessonDetail {
  id: string;
  title: string;
  topicId: string;
  topicTitle: string;
  videoUrl: string | null;
  /** Serverga yuklangan himoyalangan video */
  video: LessonVideo | null;
  content: string | null;
  attachments: { name: string; url: string }[];
  completed: boolean;
  topicTests: TestSummary[];
  nextLessonId: string | null;
}

export interface LessonVideo {
  status: "READY" | "PROCESSING";
  /** Imzolangan HLS manzili (3 soat amal qiladi), faqat READY holatda */
  hlsUrl: string | null;
  /** Video ustida suzib yuradigan matn: ism, ID, telefon */
  watermark: string;
}

// ===================== Test topshirish =====================

export interface AttemptOption {
  id: string;
  text: string;
}

export interface PassageView {
  id: string;
  title: string | null;
  body: string; // markdown
}

export interface AttemptQuestion {
  id: string;
  type: "SINGLE" | "MULTIPLE" | "TEXT" | "ESSAY";
  text: string; // markdown (qalin, kursiv)
  imageUrl: string | null;
  /** Savol tayanadigan umumiy matn (bir nechta savolga bitta) */
  passage: PassageView | null;
  points: number;
  options: AttemptOption[]; // isCorrect YUBORILMAYDI
}

export interface SavedAnswer {
  questionId: string;
  optionIds: string[];
  textAnswer: string | null;
}

export interface AttemptState {
  id: string;
  testId: string;
  testTitle: string;
  testType: "TOPIC" | "MOCK";
  status: "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
  startedAt: string;
  deadlineAt: string | null;
  serverNow: string; // klient soatiga ishonmaslik uchun
  questions: AttemptQuestion[];
  answers: SavedAnswer[];
}

export interface ResultQuestion extends Omit<AttemptQuestion, "points"> {
  correctOptionIds: string[];
  correctText: string | null;
  explanation: string | null;
  yourOptionIds: string[];
  yourText: string | null;
  isCorrect: boolean;
  /** ESSAY ustoz baholamaguncha null */
  points: number | null;
  maxPoints: number;
  pending: boolean;
  reviewComment: string | null;
}

export interface AttemptResult {
  id: string;
  testId: string;
  testTitle: string;
  status: "SUBMITTED" | "EXPIRED";
  score: number;
  maxScore: number;
  percent: number;
  /** Ustoz tekshirishi kutilayotgan ballar (esse) */
  pendingPoints: number;
  gradingScale: "NONE" | "MILLIY_SERTIFIKAT";
  /** Milliy sertifikat darajasi (esse tekshirilmagan bo'lsa, taxminiy) */
  level: { code: string; label: string } | null;
  correctCount: number;
  totalCount: number;
  startedAt: string;
  finishedAt: string;
  questions: ResultQuestion[];
}

export const saveAnswerBody = z.object({
  optionIds: z.array(z.string()).max(20).default([]),
  // Esse uchun uzun matn (taxminan 2000 so'zgacha)
  textAnswer: z.string().max(20_000).nullable().default(null),
});

/**
 * Milliy sertifikat darajalari (100 ballik). Chegaralar shu yerda bitta joyda:
 * rasmiy talab o'zgarsa, faqat shu jadvalni yangilash kifoya.
 */
export const MILLIY_LEVELS = [
  { code: "A+", min: 70 },
  { code: "A", min: 65 },
  { code: "B+", min: 60 },
  { code: "B", min: 55 },
  { code: "C+", min: 50 },
  { code: "C", min: 46 },
] as const;

export function milliyLevel(score: number): { code: string; label: string } {
  const l = MILLIY_LEVELS.find((x) => score >= x.min);
  return l ? { code: l.code, label: `${l.code} daraja` } : { code: "—", label: "Sertifikat berilmaydi (46 balldan kam)" };
}
export type SaveAnswerBody = z.infer<typeof saveAnswerBody>;

export interface StudentStats {
  lessonsCompleted: number;
  testsTaken: number;
  averagePercent: number | null;
  lastLesson: { id: string; title: string; topicTitle: string } | null;
}

/** API xato javobidagi mashina o'qiydigan kodlar */
export const ERROR_CODES = {
  SUBSCRIPTION_REQUIRED: "SUBSCRIPTION_REQUIRED",
  ATTEMPT_CLOSED: "ATTEMPT_CLOSED",
  PARENT_REQUIRED: "PARENT_REQUIRED",
} as const;
