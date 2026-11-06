import { Controller, Get } from "@nestjs/common";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { parseSchedule } from "@onatili/shared";
import { PrismaService } from "../prisma/prisma.service";

export interface AdminDashboard {
  pendingParents: number;
  /** Botdan o'zi kirgan, ustoz hali ko'rib chiqmagan o'quvchilar */
  newStudents: number;
  pendingEssays: number;
  pendingPayments: number;
  /** 7 kun ichida tugaydigan online obunalar */
  expiringSubscriptions: number;
  videos: { processing: number; failed: number };
  students: { total: number; withoutApprovedParent: number };
  /**
   * Davomat: bugun dars bo'lgan (jadval bo'yicha, dars vaqti boshlangan) guruhlar va oxirgi 7 kunda
   * davomati olinmay qolgan dars kunlari. Jadvaldan kunlar tushunilmasa, har kuni dars bor deb hisoblanadi.
   */
  attendanceToday: { date: string; groups: { id: string; name: string; schedule: string | null; marked: number; total: number }[] };
  attendanceMissed: { groupId: string; name: string; date: string }[];
  content: { lessonsPublished: number; lessonsDraft: number; tests: number; questions: number };
}

/** Admin "Asosiy" sahifasi: bugun nima qilish kerakligi */
@Roles("TEACHER", "ASSISTANT")
@Controller("admin/dashboard")
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@CurrentUser() u: JwtUser): Promise<AdminDashboard> {
    // Pulga oid ko'rsatkichlar (cheklar, obunalar) faqat egaga; yordamchiga 0
    const isTeacher = u.role === "TEACHER";
    const today = new Date(`${new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10)}T00:00:00.000Z`);
    const now = new Date();
    // Hammasi parallel: dashboard har 30 soniyada yangilanadi
    const [pendingEssays, pendingHwEssays, pendingPayments, subEnds] = await Promise.all([
      this.prisma.attemptAnswer.count({
        where: { question: { type: "ESSAY" }, points: null, textAnswer: { not: null }, attempt: { status: { in: ["SUBMITTED", "EXPIRED"] } } },
      }),
      this.prisma.essay.count({ where: { mode: "TEACHER", status: "SUBMITTED" } }),
      this.prisma.payment.count({ where: { status: "PENDING" } }),
      this.prisma.subscription.groupBy({ by: ["userId"], where: { status: "ACTIVE", endsAt: { gt: now } }, _max: { endsAt: true } }),
    ]);
    const expiringSubscriptions = subEnds.filter((g) => g._max.endsAt! <= new Date(now.getTime() + 7 * 86_400_000)).length;
    const newStudents = await this.prisma.studentProfile.count({ where: { acceptedAt: null, user: { role: "STUDENT", isBlocked: false, telegramId: { not: null } } } });
    const [pendingParents, processing, failed, total, withApproved, groups, lp, ld, tests, questions] = await Promise.all([
      this.prisma.parentLink.count({ where: { status: "PENDING" } }),
      this.prisma.video.count({ where: { status: { in: ["PROCESSING", "UPLOADING"] }, lesson: { isNot: null } } }),
      this.prisma.video.count({ where: { status: "FAILED", lesson: { isNot: null } } }),
      this.prisma.user.count({ where: { role: "STUDENT" } }),
      this.prisma.user.count({ where: { role: "STUDENT", student: { parents: { some: { status: "APPROVED" } } } } }),
      this.prisma.group.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, schedule: true, createdAt: true, _count: { select: { students: true } }, attendance: { where: { date: today }, select: { id: true } } },
      }),
      this.prisma.lesson.count({ where: { isPublished: true } }),
      this.prisma.lesson.count({ where: { isPublished: false } }),
      this.prisma.test.count(),
      this.prisma.question.count(),
    ]);
    // Toshkent vaqti: bugungi hafta kuni va daqiqasi
    const local = new Date(now.getTime() + 5 * 3600_000);
    const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes();
    const todayIso = today.toISOString().slice(0, 10);
    const withStudents = groups.filter((g) => g._count.students > 0);
    const lessonToday = withStudents.filter((g) => {
      const s = parseSchedule(g.schedule);
      if (s.days && !s.days.includes(today.getUTCDay())) return false;
      return s.minutes === null || nowMin >= s.minutes; // dars hali boshlanmagan bo'lsa eslatmaymiz
    });
    // O'tgan 7 kun: jadvaldagi dars kuni, lekin davomat yo'q (faqat kunlari aniq jadvallar uchun)
    const weekAgo = new Date(today.getTime() - 7 * 86_400_000);
    const marked = await this.prisma.attendance.groupBy({ by: ["groupId", "date"], where: { date: { gte: weekAgo, lt: today } } });
    const has = new Set(marked.map((m) => `${m.groupId}|${m.date.toISOString().slice(0, 10)}`));
    const attendanceMissed: AdminDashboard["attendanceMissed"] = [];
    for (const g of withStudents) {
      const s = parseSchedule(g.schedule);
      if (!s.days) continue;
      for (let i = 1; i <= 7; i++) {
        const d = new Date(today.getTime() - i * 86_400_000);
        const iso = d.toISOString().slice(0, 10);
        if (!s.days.includes(d.getUTCDay()) || iso < g.createdAt.toISOString().slice(0, 10) || has.has(`${g.id}|${iso}`)) continue;
        attendanceMissed.push({ groupId: g.id, name: g.name, date: iso });
      }
    }
    attendanceMissed.sort((a, b) => b.date.localeCompare(a.date));
    return {
      newStudents,
      pendingParents,
      pendingEssays: pendingEssays + pendingHwEssays,
      pendingPayments: isTeacher ? pendingPayments : 0,
      expiringSubscriptions: isTeacher ? expiringSubscriptions : 0,
      videos: { processing, failed },
      students: { total, withoutApprovedParent: total - withApproved },
      attendanceToday: {
        date: todayIso,
        groups: lessonToday.map((g) => ({ id: g.id, name: g.name, schedule: g.schedule, marked: g.attendance.length, total: g._count.students })),
      },
      attendanceMissed,
      content: { lessonsPublished: lp, lessonsDraft: ld, tests, questions },
    };
  }
}
