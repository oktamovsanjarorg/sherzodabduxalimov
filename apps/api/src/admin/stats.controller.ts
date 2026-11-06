import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { MILLIY_LEVELS, type TeacherStats } from "@onatili/shared";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { milliyOf, milliySelect } from "../tests/milliy";

const TZ = 5 * 3600_000; // Toshkent
const DAY = 86_400_000;
const FINISHED = ["SUBMITTED", "EXPIRED"] as const;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const name = (u: { firstName: string; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ");
const monthOf = (d: Date) => new Date(d.getTime() + TZ).toISOString().slice(0, 7);
const shiftMonth = (m: string, k: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + k, 1));
  return d.toISOString().slice(0, 7);
};
/** Oyning Toshkent bo'yicha boshlanishi (UTC vaqtda) */
const monthStart = (m: string) => new Date(Date.parse(`${m}-01T00:00:00Z`) - TZ);
/** Attendance.date (@db.Date) uchun: oyning 1-kuni UTC yarim tunda */
const monthDate = (m: string) => new Date(`${m}-01T00:00:00Z`);

/**
 * Ustoz statistikasi: tanlangan oy bo'yicha o'quvchilar, davomat, natijalar, esselar va kimga e'tibor kerakligi.
 * Daromad faqat egaga (yordamchi pulga oid ma'lumot ko'rmaydi).
 */
@Roles("TEACHER", "ASSISTANT")
@Controller("admin/stats")
export class StatsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@CurrentUser() u: JwtUser, @Query("month") monthQ?: string): Promise<TeacherStats> {
    const now = new Date();
    const month = monthQ || monthOf(now);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException("Oy noto'g'ri (YYYY-MM)");
    const from = monthStart(month);
    const to = monthStart(shiftMonth(month, 1));
    const p = this.prisma;

    const students = await p.user.findMany({
      where: { role: "STUDENT", createdAt: { lt: to } },
      select: { id: true, firstName: true, lastName: true, createdAt: true, student: { select: { id: true, groupId: true, group: { select: { name: true, isActive: true, monthlyFeeUzs: true } } } } },
    });
    const byUser = new Map(students.map((s) => [s.id, s]));
    const offline = students.filter((s) => s.student?.groupId && s.student.group?.isActive);

    const [lessonsDone, attempts, essays, att, groups, reviews, waitingHw, waitingMock] = await Promise.all([
      p.lessonProgress.findMany({ where: { completedAt: { gte: from, lt: to }, user: { role: "STUDENT" } }, select: { userId: true } }),
      p.attempt.findMany({
        where: { status: { in: [...FINISHED] }, finishedAt: { gte: from, lt: to }, user: { role: "STUDENT" } },
        select: { id: true, userId: true, score: true, maxScore: true, test: { select: { gradingScale: true } } },
      }),
      p.essay.findMany({ where: { createdAt: { gte: from, lt: to }, status: { not: "DRAFT" }, user: { role: "STUDENT" } }, select: { userId: true } }),
      p.attendance.findMany({ where: { date: { gte: monthDate(month), lt: monthDate(shiftMonth(month, 1)) } }, select: { groupId: true, studentId: true, date: true, status: true } }),
      p.group.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { students: true } } } }),
      p.essayReview.findMany({ where: { createdAt: { gte: from, lt: to } }, select: { source: true, totalScore: true } }),
      p.essay.count({ where: { mode: "TEACHER", status: "SUBMITTED" } }),
      p.attemptAnswer.count({ where: { question: { type: "ESSAY" }, points: null, textAnswer: { not: null }, attempt: { status: { in: [...FINISHED] } } } }),
    ]);

    // ---- o'quvchilar ----
    const active = new Set([...lessonsDone.map((x) => x.userId), ...attempts.map((x) => x.userId), ...essays.map((x) => x.userId)]);

    // ---- davomat ----
    const count = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
    for (const a of att) count[a.status]++;
    const byGroup = groups.map((g) => {
      const rows = att.filter((a) => a.groupId === g.id);
      const came = rows.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
      return {
        groupId: g.id,
        name: g.name,
        lessons: new Set(rows.map((a) => a.date.toISOString())).size,
        rate: pct(came, rows.length),
        absent: rows.filter((a) => a.status === "ABSENT").length,
        students: g._count.students,
      };
    });
    const lessons = byGroup.reduce((s, g) => s + g.lessons, 0);

    // ---- testlar (Milliy sertifikat alohida: u 75 ballik shkalada) ----
    const plain = attempts.filter((a) => a.test.gradingScale !== "MILLIY_SERTIFIKAT" && (a.maxScore ?? 0) > 0);
    const percentOf = (a: (typeof plain)[number]) => ((a.score ?? 0) / a.maxScore!) * 100;
    const avgPercent = plain.length ? Math.round(plain.reduce((s, a) => s + percentOf(a), 0) / plain.length) : null;
    const perUser = new Map<string, number[]>();
    for (const a of plain) perUser.set(a.userId, [...(perUser.get(a.userId) ?? []), percentOf(a)]);
    const userAvg = (id: string) => {
      const l = perUser.get(id);
      return l?.length ? Math.round(l.reduce((s, x) => s + x, 0) / l.length) : null;
    };

    // Qiyin mavzular: savol mavzusi bo'yicha to'g'ri javoblar ulushi
    const answers = await p.attemptAnswer.findMany({
      where: { attemptId: { in: attempts.map((a) => a.id) }, isCorrect: { not: null }, question: { topicId: { not: null }, type: { not: "ESSAY" } } },
      select: { isCorrect: true, question: { select: { topicId: true } } },
    });
    const topicAgg = new Map<string, { ok: number; n: number }>();
    for (const a of answers) {
      const t = topicAgg.get(a.question.topicId!) ?? { ok: 0, n: 0 };
      t.n++;
      if (a.isCorrect) t.ok++;
      topicAgg.set(a.question.topicId!, t);
    }
    const topicIds = [...topicAgg.entries()].filter(([, v]) => v.n >= 5).map(([k]) => k);
    const topics = await p.topic.findMany({ where: { id: { in: topicIds } }, select: { id: true, title: true } });
    const weakTopics = topics
      .map((t) => ({ topicId: t.id, title: t.title, correctPercent: pct(topicAgg.get(t.id)!.ok, topicAgg.get(t.id)!.n)!, answers: topicAgg.get(t.id)!.n }))
      .sort((a, b) => a.correctPercent - b.correctPercent)
      .slice(0, 6);

    // ---- mock (Milliy sertifikat) ----
    const milliyIds = attempts.filter((a) => a.test.gradingScale === "MILLIY_SERTIFIKAT").map((a) => a.id);
    const milliyRows = milliyIds.length ? await p.attempt.findMany({ where: { id: { in: milliyIds } }, select: milliySelect }) : [];
    const totals = milliyRows.map((r) => milliyOf(r)?.total).filter((x): x is number => typeof x === "number");
    const levels = [...MILLIY_LEVELS.map((l) => l.code as string), "—"].map((code) => ({ code, count: 0 }));
    for (const t of totals) {
      const l = MILLIY_LEVELS.find((x) => t >= x.min);
      levels.find((x) => x.code === (l?.code ?? "—"))!.count++;
    }

    // ---- e'tibor kerak ----
    const absentBy = new Map<string, number>();
    for (const a of att) if (a.status === "ABSENT") absentBy.set(a.studentId, (absentBy.get(a.studentId) ?? 0) + 1);
    const lastSeen = await this.lastActivity(students.map((s) => s.id));
    const attention: TeacherStats["attention"] = [];
    for (const s of students) {
      const reasons: string[] = [];
      const absent = s.student ? (absentBy.get(s.student.id) ?? 0) : 0;
      if (absent >= 2) reasons.push(`Bu oy ${absent} marta darsga kelmadi`);
      const avg = userAvg(s.id);
      if (avg !== null && avg < 50 && (perUser.get(s.id)?.length ?? 0) >= 2) reasons.push(`Test natijasi past: o'rtacha ${avg}%`);
      const isOnline = !(s.student?.groupId && s.student.group?.isActive);
      const seen = lastSeen.get(s.id) ?? s.createdAt;
      const idle = Math.floor((now.getTime() - seen.getTime()) / DAY);
      if (isOnline && idle >= 14 && now.getTime() - s.createdAt.getTime() >= 14 * DAY) reasons.push(`${idle} kundan beri ilovada hech narsa qilmagan`);
      if (reasons.length) attention.push({ userId: s.id, name: name(s), group: s.student?.group?.name ?? null, reasons });
    }
    attention.sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name));

    const top = [...perUser.entries()]
      .filter(([, l]) => l.length >= 2)
      .map(([id, l]) => ({ id, avg: Math.round(l.reduce((s, x) => s + x, 0) / l.length), n: l.length }))
      .sort((a, b) => b.avg - a.avg || b.n - a.n)
      .slice(0, 5)
      .map((x) => ({ userId: x.id, name: byUser.get(x.id) ? name(byUser.get(x.id)!) : "—", group: byUser.get(x.id)?.student?.group?.name ?? null, avgPercent: x.avg, tests: x.n }));

    return {
      month,
      students: {
        total: students.length,
        offline: offline.length,
        online: students.length - offline.length,
        newThisMonth: students.filter((s) => s.createdAt >= from).length,
        active: [...active].filter((id) => byUser.has(id)).length,
      },
      attendance: {
        rate: pct(count.PRESENT + count.LATE, att.length),
        lessons,
        present: count.PRESENT,
        late: count.LATE,
        absent: count.ABSENT,
        excused: count.EXCUSED,
        byGroup,
      },
      tests: { attempts: plain.length, avgPercent, weakTopics },
      mocks: { attempts: milliyRows.length, avgTotal: totals.length ? Math.round((totals.reduce((s, x) => s + x, 0) / totals.length) * 10) / 10 : null, levels },
      essays: {
        submitted: essays.length,
        checkedByTeacher: reviews.filter((r) => r.source === "TEACHER").length,
        checkedByAi: reviews.filter((r) => r.source === "AI").length,
        avgScore: reviews.length ? Math.round((reviews.reduce((s, r) => s + r.totalScore, 0) / reviews.length) * 10) / 10 : null,
        waiting: waitingHw + waitingMock,
      },
      attention: attention.slice(0, 15),
      top,
      weeks: await this.weeks(now),
      income: u.role === "TEACHER" ? await this.income(month, offline) : null,
    };
  }

  /** Har bir o'quvchining ilovadagi oxirgi faolligi (dars, test, esse) */
  private async lastActivity(userIds: string[]) {
    const [l, a, e] = await Promise.all([
      this.prisma.lessonProgress.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _max: { updatedAt: true } }),
      this.prisma.attempt.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _max: { startedAt: true } }),
      this.prisma.essay.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _max: { createdAt: true } }),
    ]);
    const m = new Map<string, Date>();
    const put = (id: string, d: Date | null) => d && (!m.has(id) || m.get(id)! < d) && m.set(id, d);
    l.forEach((x) => put(x.userId, x._max.updatedAt));
    a.forEach((x) => put(x.userId, x._max.startedAt));
    e.forEach((x) => put(x.userId, x._max.createdAt));
    return m;
  }

  /** Oxirgi 8 hafta (dushanbadan): ko'rilgan darslar, ishlangan testlar, yuborilgan esselar */
  private async weeks(now: Date) {
    const local = new Date(now.getTime() + TZ);
    const dow = (local.getUTCDay() + 6) % 7; // dushanba = 0
    const thisMonday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow) - TZ;
    const start = new Date(thisMonday - 7 * 7 * DAY);
    const [l, a, e] = await Promise.all([
      this.prisma.lessonProgress.findMany({ where: { completedAt: { gte: start }, user: { role: "STUDENT" } }, select: { completedAt: true } }),
      this.prisma.attempt.findMany({ where: { finishedAt: { gte: start }, status: { in: [...FINISHED] }, user: { role: "STUDENT" } }, select: { finishedAt: true } }),
      this.prisma.essay.findMany({ where: { createdAt: { gte: start }, status: { not: "DRAFT" }, user: { role: "STUDENT" } }, select: { createdAt: true } }),
    ]);
    const idx = (d: Date) => Math.floor((d.getTime() - start.getTime()) / (7 * DAY));
    const weeks = Array.from({ length: 8 }, (_, i) => ({ start: new Date(start.getTime() + i * 7 * DAY + TZ).toISOString().slice(0, 10), lessons: 0, tests: 0, essays: 0 }));
    l.forEach((x) => weeks[idx(x.completedAt!)] && weeks[idx(x.completedAt!)].lessons++);
    a.forEach((x) => weeks[idx(x.finishedAt!)] && weeks[idx(x.finishedAt!)].tests++);
    e.forEach((x) => weeks[idx(x.createdAt)] && weeks[idx(x.createdAt)].essays++);
    return weeks;
  }

  /** Oxirgi 6 oy daromadi: online (tasdiqlangan cheklar) va offline (oylik to'lovlar) */
  private async income(month: string, offline: { student: { id: string; group: { monthlyFeeUzs: number | null } | null } | null }[]) {
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
    const [pays, off, paidNow] = await Promise.all([
      this.prisma.payment.findMany({ where: { status: "APPROVED", createdAt: { gte: monthStart(months[0]), lt: monthStart(shiftMonth(month, 1)) } }, select: { amountUzs: true, createdAt: true, essayId: true } }),
      this.prisma.offlinePayment.groupBy({ by: ["month"], where: { month: { in: months } }, _sum: { amountUzs: true } }),
      this.prisma.offlinePayment.findMany({ where: { month }, select: { studentId: true } }),
    ]);
    const paid = new Set(paidNow.map((x) => x.studentId));
    return {
      months: months.map((m) => ({
        month: m,
        online: pays.filter((x) => !x.essayId && monthOf(x.createdAt) === m).reduce((s, x) => s + x.amountUzs, 0),
        essays: pays.filter((x) => x.essayId && monthOf(x.createdAt) === m).reduce((s, x) => s + x.amountUzs, 0),
        offline: off.find((x) => x.month === m)?._sum.amountUzs ?? 0,
      })),
      // Oylik summasi kiritilmagan guruhdagilar ham qarzdor sanaladi (summasi noma'lum bo'lsa ham to'lashi kerak)
      offlineDebtors: offline.filter((s) => !paid.has(s.student!.id)).length,
      feeMissing: offline.filter((s) => !s.student?.group?.monthlyFeeUzs).length,
    };
  }
}
