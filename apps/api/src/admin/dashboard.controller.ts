import { Controller, Get } from "@nestjs/common";
import { Roles } from "../auth/decorators";
import { PrismaService } from "../prisma/prisma.service";

export interface AdminDashboard {
  pendingParents: number;
  pendingEssays: number;
  pendingPayments: number;
  /** 7 kun ichida tugaydigan online obunalar */
  expiringSubscriptions: number;
  videos: { processing: number; failed: number };
  students: { total: number; withoutApprovedParent: number };
  attendanceToday: { groups: { id: string; name: string; schedule: string | null; marked: number; total: number }[] };
  content: { lessonsPublished: number; lessonsDraft: number; tests: number; questions: number };
}

/** Admin "Asosiy" sahifasi: bugun nima qilish kerakligi */
@Roles("TEACHER", "ASSISTANT")
@Controller("admin/dashboard")
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(): Promise<AdminDashboard> {
    const today = new Date(`${new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10)}T00:00:00.000Z`);
    const pendingEssays = await this.prisma.attemptAnswer.count({
      where: { question: { type: "ESSAY" }, points: null, textAnswer: { not: null }, attempt: { status: { in: ["SUBMITTED", "EXPIRED"] } } },
    });
    const pendingHwEssays = await this.prisma.essay.count({ where: { mode: "TEACHER", status: "SUBMITTED" } });
    const pendingPayments = await this.prisma.payment.count({ where: { status: "PENDING" } });
    const now = new Date();
    const expiringSubscriptions = (
      await this.prisma.subscription.groupBy({
        by: ["userId"],
        where: { status: "ACTIVE", endsAt: { gt: now } },
        _max: { endsAt: true },
      })
    ).filter((g) => g._max.endsAt! <= new Date(now.getTime() + 7 * 86_400_000)).length;
    const [pendingParents, processing, failed, total, withApproved, groups, lp, ld, tests, questions] = await Promise.all([
      this.prisma.parentLink.count({ where: { status: "PENDING" } }),
      this.prisma.video.count({ where: { status: { in: ["PROCESSING", "UPLOADING"] }, lesson: { isNot: null } } }),
      this.prisma.video.count({ where: { status: "FAILED", lesson: { isNot: null } } }),
      this.prisma.user.count({ where: { role: "STUDENT" } }),
      this.prisma.user.count({ where: { role: "STUDENT", student: { parents: { some: { status: "APPROVED" } } } } }),
      this.prisma.group.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, schedule: true, _count: { select: { students: true } }, attendance: { where: { date: today }, select: { id: true } } },
      }),
      this.prisma.lesson.count({ where: { isPublished: true } }),
      this.prisma.lesson.count({ where: { isPublished: false } }),
      this.prisma.test.count(),
      this.prisma.question.count(),
    ]);
    return {
      pendingParents,
      pendingEssays: pendingEssays + pendingHwEssays,
      pendingPayments,
      expiringSubscriptions,
      videos: { processing, failed },
      students: { total, withoutApprovedParent: total - withApproved },
      attendanceToday: { groups: groups.map((g) => ({ id: g.id, name: g.name, schedule: g.schedule, marked: g.attendance.length, total: g._count.students })) },
      content: { lessonsPublished: lp, lessonsDraft: ld, tests, questions },
    };
  }
}
