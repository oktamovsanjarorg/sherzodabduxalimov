import { Injectable } from "@nestjs/common";
import { Prisma } from "@onatili/db";
import {
  ESSAY_RUBRIC,
  ESSAY_SPECIAL,
  countWords,
  type AdminEssayLogRow,
  type AdminEssayStats,
  type EssayScoreStats,
  type EssaySpecialKey,
  type EssayStatsPeriod,
} from "@onatili/shared";
import { PrismaService } from "../prisma/prisma.service";
import { userSearchWhere } from "../users/user-search";

const DAY = 86_400_000;
const TZ_OFFSET = 5 * 3600_000; // Toshkent
const fullName = (u: { firstName: string; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ");
const round1 = (x: number) => Math.round(x * 10) / 10;
const avgOf = (xs: number[]) => (xs.length ? round1(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
/** Toshkent sanasi YYYY-MM-DD */
const tashkentDate = (d: Date) => new Date(d.getTime() + TZ_OFFSET).toISOString().slice(0, 10);
const specialLabel = (k: string) => (k in ESSAY_SPECIAL ? ESSAY_SPECIAL[k as EssaySpecialKey].label : k);

const BUCKETS = [
  { label: "0–6", max: 6 },
  { label: "6,5–12", max: 12 },
  { label: "12,5–18", max: 18 },
  { label: "18,5–24", max: Infinity },
];

type Review = { totalScore: number; special: string | null; criteria: Prisma.JsonValue };

function scoreStats(reviews: Review[]): EssayScoreStats {
  const buckets = BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const r of reviews) buckets[BUCKETS.findIndex((b) => r.totalScore <= b.max)].count++;
  // Maxsus holatda (mavzuga mos emas va h.k.) bandlar baholanmaydi: o'rtachani buzmasin
  const graded = reviews.filter((r) => !r.special && Array.isArray(r.criteria) && r.criteria.length);
  const criteria = ESSAY_RUBRIC.map((c) => {
    const xs = graded
      .map((r) => (r.criteria as { key: string; score: number }[]).find((x) => x.key === c.key)?.score)
      .filter((x): x is number => typeof x === "number");
    return { key: c.key as string, label: c.label as string, avg: avgOf(xs) ?? 0, max: c.max as number };
  });
  return { count: reviews.length, avg: avgOf(reviews.map((r) => r.totalScore)), buckets, criteria: graded.length ? criteria : [] };
}

/** Admin: erkin esselar (AI va ustoz) bo'yicha statistika va jurnal. Faqat o'qiydi */
@Injectable()
export class EssayStatsService {
  constructor(private readonly prisma: PrismaService) {}

  private since(days: EssayStatsPeriod) {
    return days ? new Date(Date.now() - days * DAY) : undefined;
  }

  async stats(days: EssayStatsPeriod): Promise<AdminEssayStats> {
    const since = this.since(days);
    const essays = await this.prisma.essay.findMany({
      where: { status: { not: "DRAFT" }, ...(since ? { createdAt: { gte: since } } : {}) },
      select: {
        mode: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, username: true } },
        reviews: { select: { source: true, totalScore: true, special: true, criteria: true, provider: true } },
      },
    });

    const aiReviews = essays.flatMap((e) => e.reviews.filter((r) => r.source === "AI"));
    const teacherReviews = essays.flatMap((e) => e.reviews.filter((r) => r.source === "TEACHER"));

    const specials = new Map<string, number>();
    for (const r of aiReviews) if (r.special) specials.set(r.special, (specials.get(r.special) ?? 0) + 1);
    const providers = new Map<string, number>();
    for (const r of aiReviews) providers.set(r.provider ?? "noma'lum", (providers.get(r.provider ?? "noma'lum") ?? 0) + 1);

    const students = new Map<string, { id: string; name: string; username: string | null; essays: number; ai: number[]; teacher: number[]; lastAt: Date }>();
    for (const e of essays) {
      const s = students.get(e.user.id) ?? {
        id: e.user.id,
        name: fullName(e.user),
        username: e.user.username,
        essays: 0,
        ai: [],
        teacher: [],
        lastAt: e.createdAt,
      };
      s.essays++;
      if (e.createdAt > s.lastAt) s.lastAt = e.createdAt;
      for (const r of e.reviews) (r.source === "AI" ? s.ai : s.teacher).push(r.totalScore);
      students.set(e.user.id, s);
    }

    // Kunlik grafik: tanlangan davr (butun vaqt bo'lsa oxirgi 90 kun)
    const span = days || 90;
    const daily = new Map<string, { ai: number; teacher: number }>();
    for (let i = span - 1; i >= 0; i--) daily.set(tashkentDate(new Date(Date.now() - i * DAY)), { ai: 0, teacher: 0 });
    for (const e of essays) {
      const d = daily.get(tashkentDate(e.createdAt));
      if (d) d[e.mode === "AI" ? "ai" : "teacher"]++;
    }

    const ai = essays.filter((e) => e.mode === "AI");
    const teacher = essays.filter((e) => e.mode === "TEACHER");
    return {
      days,
      totals: {
        essays: essays.length,
        students: students.size,
        ai: ai.length,
        aiChecked: ai.filter((e) => e.status === "AI_CHECKED").length,
        aiFailed: ai.filter((e) => e.status === "AI_FAILED").length,
        teacher: teacher.length,
        teacherReviewed: teacher.filter((e) => e.status === "REVIEWED").length,
        teacherWaiting: teacher.filter((e) => e.status === "SUBMITTED" || e.status === "AWAITING_PAYMENT").length,
      },
      ai: scoreStats(aiReviews),
      teacher: scoreStats(teacherReviews),
      specials: [...specials].map(([key, count]) => ({ key, label: specialLabel(key), count })).sort((a, b) => b.count - a.count),
      providers: [...providers].map(([provider, count]) => ({ provider, count })).sort((a, b) => b.count - a.count),
      topStudents: [...students.values()]
        .sort((a, b) => b.essays - a.essays || b.lastAt.getTime() - a.lastAt.getTime())
        .slice(0, 15)
        .map((s) => ({
          id: s.id,
          name: s.name,
          username: s.username,
          essays: s.essays,
          aiAvg: avgOf(s.ai),
          teacherAvg: avgOf(s.teacher),
          lastAt: s.lastAt.toISOString(),
        })),
      daily: [...daily].map(([date, v]) => ({ date, ...v })),
    };
  }

  /** Jurnal: oxirgi esselar, yangisi birinchi. q: o'quvchi ismi, username yoki mavzu bo'yicha qidiruv */
  async log(d: { days: EssayStatsPeriod; mode: "AI" | "TEACHER" | null; q: string | null; studentId: string | null }): Promise<AdminEssayLogRow[]> {
    const since = this.since(d.days);
    const q = d.q?.trim().replace(/^@/, "");
    const rows = await this.prisma.essay.findMany({
      where: {
        status: { not: "DRAFT" },
        ...(since ? { createdAt: { gte: since } } : {}),
        ...(d.mode ? { mode: d.mode } : {}),
        ...(d.studentId ? { userId: d.studentId } : {}),
        ...(q
          ? {
              OR: [{ prompt: { contains: q, mode: "insensitive" } }, { user: userSearchWhere(q) ?? {} }],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        mode: true,
        prompt: true,
        status: true,
        text: true,
        imageUrls: true,
        error: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, username: true } },
        reviews: {
          orderBy: { createdAt: "desc" },
          select: { source: true, totalScore: true, special: true, provider: true, reviewer: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    return rows.map((e) => {
      const ai = e.reviews.find((r) => r.source === "AI");
      const t = e.reviews.find((r) => r.source === "TEACHER");
      return {
        id: e.id,
        student: { id: e.user.id, name: fullName(e.user), username: e.user.username },
        mode: e.mode,
        prompt: e.prompt,
        status: e.status,
        words: e.text ? countWords(e.text) : null,
        pages: e.imageUrls.length,
        ai: ai ? { score: ai.totalScore, special: ai.special ? specialLabel(ai.special) : null, provider: ai.provider } : null,
        teacher: t ? { score: t.totalScore, special: t.special ? specialLabel(t.special) : null, reviewer: t.reviewer ? fullName(t.reviewer) : null } : null,
        error: e.error,
        createdAt: e.createdAt.toISOString(),
      };
    });
  }
}
