import { Controller, Get } from "@nestjs/common";
import { CurrentUser, Roles, type JwtUser, can } from "../auth/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { attendanceTodo } from "./attendance-todo";

export interface AdminDashboard {
  pendingParents: number;
  /** Botdan o'zi kirgan, ustoz hali ko'rib chiqmagan o'quvchilar */
  newStudents: number;
  pendingEssays: number;
  /** Esselar sahifasidagi bo'limlar bo'yicha: qo'lyozma (ustoz tekshiruvi) va mock test esselari */
  pendingEssaysBy: { hw: number; mock: number };
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
    const isTeacher = can(u, "PAYMENTS");
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
    const newStudents = await this.prisma.studentProfile.count({
      where: { acceptedAt: null, user: { role: "STUDENT", isBlocked: false, telegramId: { not: null } } },
    });
    const [pendingParents, processing, failed, total, withApproved, attendance, lp, ld, tests, questions] = await Promise.all([
      this.prisma.parentLink.count({ where: { status: "PENDING" } }),
      this.prisma.video.count({ where: { status: { in: ["PROCESSING", "UPLOADING"] }, lesson: { isNot: null } } }),
      this.prisma.video.count({ where: { status: "FAILED", lesson: { isNot: null } } }),
      this.prisma.user.count({ where: { role: "STUDENT" } }),
      this.prisma.user.count({ where: { role: "STUDENT", student: { parents: { some: { status: "APPROVED" } } } } }),
      attendanceTodo(this.prisma, now),
      this.prisma.lesson.count({ where: { isPublished: true } }),
      this.prisma.lesson.count({ where: { isPublished: false } }),
      this.prisma.test.count(),
      this.prisma.question.count(),
    ]);
    return {
      newStudents,
      pendingParents,
      pendingEssays: pendingEssays + pendingHwEssays,
      pendingEssaysBy: { hw: pendingHwEssays, mock: pendingEssays },
      pendingPayments: isTeacher ? pendingPayments : 0,
      expiringSubscriptions: isTeacher ? expiringSubscriptions : 0,
      videos: { processing, failed },
      students: { total, withoutApprovedParent: total - withApproved },
      ...attendance,
      content: { lessonsPublished: lp, lessonsDraft: ld, tests, questions },
    };
  }
}
