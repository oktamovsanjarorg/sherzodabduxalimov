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
  content: string | null;
  attachments: { name: string; url: string }[];
  completed: boolean;
  topicTests: TestSummary[];
  nextLessonId: string | null;
}

// ===================== Test topshirish =====================

export interface AttemptOption {
  id: string;
  text: string;
}

export interface AttemptQuestion {
  id: string;
  type: "SINGLE" | "MULTIPLE" | "TEXT";
  text: string;
  imageUrl: string | null;
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

export interface ResultQuestion extends AttemptQuestion {
  correctOptionIds: string[];
  correctText: string | null;
  explanation: string | null;
  yourOptionIds: string[];
  yourText: string | null;
  isCorrect: boolean;
  points: number;
  maxPoints: number;
}

export interface AttemptResult {
  id: string;
  testId: string;
  testTitle: string;
  status: "SUBMITTED" | "EXPIRED";
  score: number;
  maxScore: number;
  percent: number;
  correctCount: number;
  totalCount: number;
  startedAt: string;
  finishedAt: string;
  questions: ResultQuestion[];
}

export const saveAnswerBody = z.object({
  optionIds: z.array(z.string()).max(20).default([]),
  textAnswer: z.string().max(500).nullable().default(null),
});
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
} as const;
