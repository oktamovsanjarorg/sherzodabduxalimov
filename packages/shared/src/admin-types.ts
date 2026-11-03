import { z } from "zod";

// ===================== Admin: kontent sxemalari =====================

const title = z.string().trim().min(1, "Nomi kerak").max(200);
const optText = z.string().trim().max(5000).nullable().optional();

export const courseInput = z.object({
  title,
  description: optText,
  isPublished: z.boolean().optional(),
});
export type CourseInput = z.infer<typeof courseInput>;

export const topicInput = z.object({ title });

export const lessonInput = z.object({
  title,
  content: z.string().max(50_000).nullable().optional(),
  videoUrl: z.string().trim().url("Havola noto'g'ri").max(1000).nullable().optional().or(z.literal("").transform(() => null)),
  videoId: z.string().nullable().optional(),
  durationSec: z.number().int().min(0).max(36_000).nullable().optional(),
  isFree: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  attachments: z.array(z.object({ name: z.string().min(1).max(200), url: z.string().url() })).max(20).optional(),
});
export type LessonInput = z.infer<typeof lessonInput>;

export const reorderInput = z.object({
  kind: z.enum(["course", "topic", "lesson"]),
  ids: z.array(z.string()).min(1).max(500),
});

export const QUESTION_TYPES = ["SINGLE", "MULTIPLE", "TEXT", "ESSAY"] as const;

export const passageInput = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().min(1, "Matn kerak").max(30_000),
});
export type PassageInput = z.infer<typeof passageInput>;

export interface AdminPassage {
  id: string;
  title: string | null;
  body: string;
  questionCount: number;
}

export const questionInput = z
  .object({
    topicId: z.string().nullable().optional(),
    passageId: z.string().nullable().optional(),
    type: z.enum(QUESTION_TYPES),
    text: z.string().trim().min(1, "Savol matni kerak").max(5000),
    explanation: optText,
    imageUrl: z.string().url().nullable().optional(),
    difficulty: z.number().int().min(1).max(5).default(2),
    correctText: z.string().trim().max(500).nullable().optional(),
    options: z
      .array(z.object({ id: z.string().optional(), text: z.string().trim().min(1, "Variant matni bo'sh").max(1000), isCorrect: z.boolean() }))
      .max(10)
      .default([]),
  })
  .superRefine((q, ctx) => {
    const correct = q.options.filter((o) => o.isCorrect).length;
    if (q.type === "ESSAY") return; // esse: variant ham, kalit ham yo'q, ustoz baholaydi
    if (q.type === "TEXT") {
      if (!q.correctText) ctx.addIssue({ code: "custom", path: ["correctText"], message: "To'g'ri javobni yozing" });
      return;
    }
    if (q.options.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Kamida 2 ta variant kerak" });
    if (q.type === "SINGLE" && correct !== 1)
      ctx.addIssue({ code: "custom", path: ["options"], message: "Bitta to'g'ri javob belgilang" });
    if (q.type === "MULTIPLE" && correct < 1)
      ctx.addIssue({ code: "custom", path: ["options"], message: "Kamida bitta to'g'ri javob belgilang" });
  });
export type QuestionInput = z.input<typeof questionInput>;

export const testInput = z.object({
  type: z.enum(["TOPIC", "MOCK"]),
  title,
  description: optText,
  topicId: z.string().nullable().optional(),
  timeLimitSec: z.number().int().min(60).max(4 * 3600).nullable().optional(),
  shuffle: z.boolean().optional(),
  gradingScale: z.enum(["NONE", "MILLIY_SERTIFIKAT"]).optional(),
  isFree: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  questions: z
    .array(z.object({ questionId: z.string(), points: z.number().min(0.1).max(100).default(1) }))
    .max(300)
    .optional(),
});
export type TestInput = z.input<typeof testInput>;

// ===================== Admin: javob tiplari =====================

export interface AdminVideo {
  id: string;
  status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
  originalName: string;
  sizeBytes: number;
  receivedBytes: number;
  durationSec: number | null;
  error: string | null;
  processingPct: number | null;
}

export interface AdminLesson {
  id: string;
  topicId: string;
  title: string;
  content: string | null;
  videoUrl: string | null;
  video: AdminVideo | null;
  durationSec: number | null;
  isFree: boolean;
  isPublished: boolean;
  order: number;
  attachments: { name: string; url: string }[];
}

export interface AdminTestRow {
  id: string;
  type: "TOPIC" | "MOCK";
  title: string;
  topicId: string | null;
  topicTitle: string | null;
  isFree: boolean;
  isPublished: boolean;
  timeLimitSec: number | null;
  questionCount: number;
  attemptCount: number;
}

export interface AdminTopic {
  id: string;
  title: string;
  order: number;
  lessons: AdminLesson[];
  tests: AdminTestRow[];
}

export interface AdminCourse {
  id: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  order: number;
  topics: AdminTopic[];
}

export interface AdminQuestion {
  id: string;
  topicId: string | null;
  topicTitle: string | null;
  type: "SINGLE" | "MULTIPLE" | "MATCHING" | "TEXT" | "ESSAY";
  passageId: string | null;
  passageTitle: string | null;
  /** Import qilingan savollarda javob kaliti ustoz tasdig'ini kutadi */
  keyStatus: "proposed" | "uncertain" | null;
  text: string;
  explanation: string | null;
  imageUrl: string | null;
  difficulty: number;
  correctText: string | null;
  options: { id: string; text: string; isCorrect: boolean }[];
  usedInTests: number;
}

export interface AdminTestDetail extends AdminTestRow {
  description: string | null;
  shuffle: boolean;
  gradingScale: "NONE" | "MILLIY_SERTIFIKAT";
  questions: { questionId: string; points: number; question: AdminQuestion }[];
}

export interface Paged<T> {
  items: T[];
  total: number;
}

/** Video bo'laklab yuklash: har bir bo'lak hajmi */
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB

/** Esse tekshirish navbati */
export interface AdminEssay {
  attemptId: string;
  questionId: string;
  student: { name: string; username: string | null };
  testTitle: string;
  prompt: string; // esse topshirig'i (markdown)
  text: string;
  words: number;
  maxPoints: number;
  points: number | null;
  reviewComment: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export const essayReviewInput = z.object({
  points: z.number().min(0).max(100),
  comment: z.string().trim().max(5000).nullable().optional(),
});
