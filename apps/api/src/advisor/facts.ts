/** Yordamchi uchun umumiy hisob-kitoblar: esse mezonlari, xato turlari, mavzu bo'yicha to'g'ri javoblar. */
import { ESSAY_RUBRIC, errorTypeLabel } from "@onatili/shared";
import type { PrismaService } from "../prisma/prisma.service";

export const DAY = 86_400_000;
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
export const fullName = (u: { firstName: string; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ");
export const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
/** Attendance.date (@db.Date) uchun: n kun oldingi sana */
export const dateDaysAgo = (n: number) => new Date(`${daysAgo(n).toISOString().slice(0, 10)}T00:00:00Z`);
/** «Ali, Vali, Soli va yana 4 ta» */
export const names = (l: string[], max = 4) => (l.length > max ? `${l.slice(0, max).join(", ")} va yana ${l.length - max} ta` : l.join(", "));

type ReviewRow = { criteria: unknown; mistakes: unknown };

/** Esse baholari: har mezon bo'yicha o'rtacha foiz va xato turlari ulushi */
export function essayFacts(reviews: ReviewRow[]) {
  const crit = new Map<string, { got: number; max: number }>();
  const types = new Map<string, number>();
  for (const r of reviews) {
    for (const c of (Array.isArray(r.criteria) ? r.criteria : []) as { key?: string; score?: number; max?: number }[]) {
      const max = c.max ?? ESSAY_RUBRIC.find((x) => x.key === c.key)?.max ?? 0;
      if (!c.key || !max) continue;
      const v = crit.get(c.key) ?? { got: 0, max: 0 };
      crit.set(c.key, { got: v.got + (c.score ?? 0), max: v.max + max });
    }
    for (const m of (Array.isArray(r.mistakes) ? r.mistakes : []) as { type?: string }[]) types.set(m.type ?? "other", (types.get(m.type ?? "other") ?? 0) + 1);
  }
  const criteria = [...crit.entries()]
    .map(([key, v]) => ({ key, label: ESSAY_RUBRIC.find((x) => x.key === key)?.label ?? key, percent: pct(v.got, v.max) }))
    .sort((a, b) => a.percent - b.percent);
  const totalMistakes = [...types.values()].reduce((s, x) => s + x, 0);
  const mistakes = [...types.entries()]
    .map(([type, n]) => ({ type, label: errorTypeLabel(type), n, share: pct(n, totalMistakes) }))
    .sort((a, b) => b.n - a.n);
  return { criteria, mistakes, totalMistakes };
}

/** Mavzular bo'yicha to'g'ri javob foizi (kamida minN javob bo'lganlari), eng zaifi birinchi */
export async function topicAccuracy(prisma: PrismaService, where: { userId?: string; since: Date }, minN: number) {
  const rows = await prisma.attemptAnswer.findMany({
    where: {
      isCorrect: { not: null },
      question: { topicId: { not: null }, type: { not: "ESSAY" } },
      attempt: { status: { in: ["SUBMITTED", "EXPIRED"] }, finishedAt: { gte: where.since }, ...(where.userId ? { userId: where.userId } : { user: { role: "STUDENT" } }) },
    },
    select: { isCorrect: true, question: { select: { topicId: true, topic: { select: { title: true } } } } },
  });
  const agg = new Map<string, { title: string; ok: number; n: number }>();
  for (const r of rows) {
    const id = r.question.topicId!;
    const v = agg.get(id) ?? { title: r.question.topic?.title ?? "—", ok: 0, n: 0 };
    v.n++;
    if (r.isCorrect) v.ok++;
    agg.set(id, v);
  }
  return [...agg.entries()]
    .filter(([, v]) => v.n >= minN)
    .map(([topicId, v]) => ({ topicId, title: v.title, percent: pct(v.ok, v.n), answers: v.n }))
    .sort((a, b) => a.percent - b.percent);
}
