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
  /** MILLIY_SERTIFIKAT: savollarga ball ko'rsatilmaydi (ballni Rasch modeli beradi) */
  gradingScale: "NONE" | "MILLIY_SERTIFIKAT";
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
  /** Esse: rasmiy mezon bo'yicha 12 band bahosi va maxsus holat */
  rubric: { key: string; label: string; max: number; score: number }[] | null;
  special: { key: string; label: string } | null;
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
  /** Milliy sertifikat darajasi (esse tekshirilmaguncha null) */
  level: { code: string; label: string } | null;
  /** Milliy sertifikat: test qismi, yozma ish, umumiy ball, oliygoh bali */
  milliy: MilliyBreakdown | null;
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

/**
 * Yozma ish (24 ballik mezon) -> 75 ballik shkala. Rasmiy jadval: 24→75, 23,5→74, …, 12→51, …, 0,5→28, 0→0
 * (har 0,5 ball = 1 ball; ya'ni 27 + 2×ball). Jadvalda faqat 0,5 qadamlar bor: oraliq ball pastga yaxlitlanadi.
 */
export function essayTo75(score24: number): number {
  const x = Math.floor(Math.max(0, Math.min(24, score24)) * 2) / 2;
  return x <= 0 ? 0 : 27 + 2 * x;
}

export interface MilliyBreakdown {
  /**
   * Test qismi Rasch modeli bilan: θ (qobiliyat), T = 50 + 10Z (0..75).
   * calibrated=false: savol qiyinliklari hali yetarli natijadan hisoblanmagan (dastlabki baho)
   */
  test: { correct: number; total: number; theta: number; scaled: number; calibrated: boolean; sampleSize: number };
  /** Yozma ish: 24 ballik baho va 75 ballik shkaladagisi. Testda esse bo'lmasa null */
  essay: { score24: number; scaled: number } | null;
  /** Esse ustoz tekshiruvini kutmoqda: umumiy ball hali chiqmaydi */
  essayPending: boolean;
  /** Umumiy ball = ikki qismning o'rtacha arifmetigi (esse bo'lmasa test qismi) */
  total: number | null;
  level: { code: string; label: string } | null;
  /** Oliygohga kirish: mutaxassislik blokida 1-fan (max 93) va 2-fan (max 63) bo'lsa. 46 dan kam bo'lsa null */
  university: { first: number; second: number } | null;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Milliy sertifikat: baholash mezonlari hujjati bo'yicha natija (test qismi T allaqachon Rasch bilan hisoblangan) */
export function milliyBreakdown(p: {
  test: MilliyBreakdown["test"];
  /** Esse 24 ballik shkalada (null: yozilmagan yoki testda yo'q) */
  essayScore24: number | null;
  hasEssay: boolean;
  essayPending: boolean;
}): MilliyBreakdown {
  const essay = p.hasEssay ? { score24: r1(p.essayScore24 ?? 0), scaled: essayTo75(p.essayScore24 ?? 0) } : null;
  const total = p.essayPending ? null : r1(essay ? (p.test.scaled + essay.scaled) / 2 : p.test.scaled);
  return {
    test: { ...p.test, theta: Math.round(p.test.theta * 100) / 100 },
    essay: p.essayPending ? null : essay,
    essayPending: p.essayPending,
    total,
    level: total === null ? null : milliyLevel(total),
    university:
      total === null || total < 46
        ? null
        : total >= 65
          ? { first: 93, second: 63 }
          : { first: r2((total * 93) / 65), second: r2((total * 63) / 65) },
  };
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
