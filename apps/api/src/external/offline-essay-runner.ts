import { Prisma, type PrismaClient } from "@onatili/db";
import { ESSAY_SPECIAL, NO_ESSAY_ERROR, type EssaySpecialKey, type OfflineEssayAi, type OfflineEssayTeacherReview, type RubricSnapshot } from "@onatili/shared";
import { assessEssay, type EssayAssessment, type GradeFn, type LocateFn, type ReadFn } from "../essays/ai-runner";

/** Bazadagi AI natijasi (ExternalEssay.ai) → admin ko'rinishi. Buzuq yoki bo'sh bo'lsa null */
export function offlineAiView(raw: unknown): OfflineEssayAi | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Partial<EssayAssessment>;
  if (typeof a.total !== "number") return null;
  const special = a.special && a.special in ESSAY_SPECIAL ? { key: a.special, label: ESSAY_SPECIAL[a.special as EssaySpecialKey].label } : null;
  return {
    special,
    criteria: a.criteria ?? [],
    total: a.total,
    mistakes: (a.mistakes ?? []).map((m) => ({ wrong: m.wrong, right: m.right, note: m.note ?? null, type: m.type })),
    annotations: a.annotations ?? null,
    feedback: a.feedback ?? null,
    provider: a.provider ?? null,
  };
}

/** ExternalEssay.review: ustoz bahosi va shu paytda ko'ringan AI bahosi (keyin AI qayta tekshirsa ham o'zgarmaydi) */
export interface StoredReview extends RubricSnapshot {
  special: EssaySpecialKey | null;
  ai: RubricSnapshot | null;
  comment?: string | null;
  comments?: Record<string, string>;
}

export const aiSnapshot = (ai: OfflineEssayAi | null): RubricSnapshot | null =>
  ai ? { special: ai.special?.key ?? null, scores: Object.fromEntries(ai.criteria.map((c) => [c.key, c.score])), total: ai.total } : null;

export function teacherReviewView(e: {
  review: unknown;
  reviewedAt: Date | null;
  reviewedBy: { firstName: string; lastName: string | null } | null;
}): OfflineEssayTeacherReview | null {
  const r = e.review as StoredReview | null;
  if (!r || typeof r.total !== "number" || !e.reviewedAt) return null;
  return {
    special: r.special,
    scores: r.scores ?? {},
    total: r.total,
    aiTotal: r.ai?.total ?? null,
    comment: r.comment ?? null,
    comments: r.comments ?? {},
    reviewer: e.reviewedBy ? [e.reviewedBy.firstName, e.reviewedBy.lastName].filter(Boolean).join(" ") : null,
    reviewedAt: e.reviewedAt.toISOString(),
  };
}

/**
 * Offline test essesini AI bilan tekshiradi va TAXMINIY bahoni saqlaydi. Natijaga (essayScore) yozilmaydi:
 * buni faqat ustoz tasdiqlaydi. O'quvchiga hech narsa yuborilmaydi. Worker chaqiradi; testda grade soxta bo'ladi.
 */
export async function gradeOfflineEssayJob(prisma: PrismaClient, id: string, deps: { grade: GradeFn; read?: ReadFn; locate?: LocateFn }) {
  const e = await prisma.externalEssay.findUnique({ where: { id } });
  if (!e || e.status !== "CHECKING" || !e.prompt) return null; // o'chirilgan, varoq o'zgargan yoki allaqachon tekshirilgan
  const done = await assessEssay(
    { prompt: e.prompt, text: e.text, imageUrls: e.imageUrls },
    { ...deps, onRead: (text) => prisma.externalEssay.updateMany({ where: { id, status: "CHECKING" }, data: { text } }) },
  );
  if (!done) {
    await prisma.externalEssay.updateMany({ where: { id, status: "CHECKING" }, data: { status: "FAILED", error: NO_ESSAY_ERROR } });
    return null;
  }
  // Holat CHECKING bo'lsagina yoziladi: shu orada varoq o'zgargan bo'lsa (DRAFT), eski natija yozilmaydi
  const { count } = await prisma.externalEssay.updateMany({
    where: { id, status: "CHECKING" },
    data: { status: "CHECKED", error: null, aiError: null, ai: done.result as unknown as Prisma.InputJsonValue },
  });
  return count ? done.result.total : null;
}

/** Barcha urinishlar tugadi: ustoz qayta yuborishi mumkin */
export async function markOfflineEssayFailed(prisma: PrismaClient, id: string, message: string) {
  console.error(`[essay-ai] offline ${id}: ${message}`);
  await prisma.externalEssay.updateMany({
    where: { id, status: "CHECKING" },
    data: { status: "FAILED", error: "AI tekshira olmadi. Qayta urinib ko'ring.", aiError: message.slice(0, 500) },
  });
}
