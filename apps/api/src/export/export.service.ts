import { Injectable } from "@nestjs/common";
import { ATTENDANCE_LABELS } from "@onatili/shared";
import { PrismaService } from "../prisma/prisma.service";
import { buildXlsx, type Sheet } from "./xlsx";

const fullName = (u: { firstName: string; lastName: string | null } | null | undefined) => (u ? [u.firstName, u.lastName].filter(Boolean).join(" ") : "");
const TZ_MS = 5 * 3600 * 1000; // Toshkent, UTC+5 (yozgi vaqt yo'q)
/** "2026-11-09 14:05" Toshkent vaqti bo'yicha */
const dt = (d: Date | null | undefined) => (d ? new Date(d.getTime() + TZ_MS).toISOString().slice(0, 16).replace("T", " ") : "");
/** Sana ustuni (@db.Date): vaqtsiz */
const day = (d: Date) => d.toISOString().slice(0, 10);
const yesNo = (b: boolean) => (b ? "ha" : "yo'q");
const PARENT_STATUS: Record<string, string> = { PENDING: "kutilmoqda", APPROVED: "tasdiqlangan", REJECTED: "rad etilgan" };
const PAY_STATUS: Record<string, string> = { PENDING: "kutilmoqda", APPROVED: "tasdiqlangan", REJECTED: "rad etilgan" };
const ACCESS: Record<string, string> = { AUTO: "avtomatik", FREE: "bepul ochiq", CLOSED: "yopiq" };

/** Admin paneldan yuklab olinadigan hamma asosiy ma'lumot: bitta Excel fayl, har bo'lim alohida varaqda */
@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async workbook(actorId: string): Promise<{ file: Buffer; name: string }> {
    const [students, groups, attendance, offline, payments, parents] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where: { user: { role: "STUDENT" } },
        orderBy: [{ group: { name: "asc" } }, { user: { firstName: "asc" } }],
        select: {
          createdAt: true,
          acceptedAt: true,
          accessMode: true,
          group: { select: { name: true } },
          user: { select: { firstName: true, lastName: true, phone: true, username: true, telegramId: true, isBlocked: true, blockedReason: true } },
          parents: { select: { status: true, phone: true, relation: true, parent: { select: { firstName: true, lastName: true } } } },
          _count: { select: { attendance: true } },
        },
      }),
      this.prisma.group.findMany({ orderBy: { name: "asc" }, select: { name: true, schedule: true, monthlyFeeUzs: true, isActive: true, createdAt: true, _count: { select: { students: true } } } }),
      this.prisma.attendance.findMany({
        orderBy: [{ date: "desc" }, { group: { name: "asc" } }],
        select: {
          date: true,
          status: true,
          note: true,
          notifiedAt: true,
          group: { select: { name: true } },
          markedBy: { select: { firstName: true, lastName: true } },
          student: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.offlinePayment.findMany({
        orderBy: [{ month: "desc" }, { createdAt: "desc" }],
        select: {
          month: true,
          amountUzs: true,
          note: true,
          createdAt: true,
          group: { select: { name: true } },
          markedBy: { select: { firstName: true, lastName: true } },
          student: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          method: true,
          amountUzs: true,
          status: true,
          payerNote: true,
          reviewNote: true,
          plan: { select: { name: true } },
          essayId: true,
          user: { select: { firstName: true, lastName: true, phone: true } },
          reviewedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.parentLink.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          status: true,
          phone: true,
          relation: true,
          rejectReason: true,
          createdAt: true,
          reviewedAt: true,
          parent: { select: { firstName: true, lastName: true, username: true } },
          reviewedBy: { select: { firstName: true, lastName: true } },
          student: { select: { group: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } } },
        },
      }),
    ]);

    const sheets: Sheet[] = [
      {
        name: "O'quvchilar",
        columns: [
          { header: "Ism-familiya", width: 30 },
          { header: "Guruh", width: 14 },
          { header: "Telefon", width: 16 },
          { header: "Telegram", width: 20 },
          { header: "Botga ulangan", width: 13 },
          { header: "Tasdiqlangan", width: 13 },
          { header: "Ota-ona", width: 40 },
          { header: "Davomat yozuvlari", width: 10 },
          { header: "Ilovaga kirish", width: 13 },
          { header: "Bloklangan", width: 24 },
          { header: "Qo'shilgan", width: 17 },
        ],
        rows: students.map((s) => [
          fullName(s.user),
          s.group?.name ?? "online",
          s.user.phone,
          s.user.username ? `@${s.user.username}` : "",
          yesNo(s.user.telegramId !== null),
          yesNo(!!s.acceptedAt),
          s.parents.map((p) => `${fullName(p.parent)}${p.relation ? ` (${p.relation})` : ""}${p.phone ? ` ${p.phone}` : ""} — ${PARENT_STATUS[p.status]}`).join("; "),
          s._count.attendance,
          ACCESS[s.accessMode] ?? s.accessMode,
          s.user.isBlocked ? `ha${s.user.blockedReason ? `: ${s.user.blockedReason}` : ""}` : "",
          dt(s.createdAt),
        ]),
      },
      {
        name: "Davomat",
        columns: [
          { header: "Sana", width: 12 },
          { header: "Guruh", width: 14 },
          { header: "O'quvchi", width: 30 },
          { header: "Holat", width: 11 },
          { header: "Izoh", width: 30 },
          { header: "Belgilagan", width: 22 },
          { header: "Ota-onaga yuborilgan", width: 17 },
        ],
        rows: attendance.map((a) => [
          day(a.date),
          a.group.name,
          fullName(a.student.user),
          ATTENDANCE_LABELS[a.status as keyof typeof ATTENDANCE_LABELS] ?? a.status,
          a.note,
          fullName(a.markedBy),
          dt(a.notifiedAt),
        ]),
      },
      {
        name: "Naqd to'lovlar",
        columns: [
          { header: "Oy", width: 9 },
          { header: "O'quvchi", width: 30 },
          { header: "Guruh", width: 14 },
          { header: "Summa (so'm)", width: 13 },
          { header: "Izoh", width: 30 },
          { header: "Belgilagan", width: 22 },
          { header: "Belgilangan vaqt", width: 17 },
        ],
        rows: offline.map((o) => [o.month, fullName(o.student.user), o.group?.name, o.amountUzs, o.note, fullName(o.markedBy), dt(o.createdAt)]),
      },
      {
        name: "Ilovadagi to'lovlar",
        columns: [
          { header: "Vaqt", width: 17 },
          { header: "Kim", width: 30 },
          { header: "Telefon", width: 16 },
          { header: "Nima uchun", width: 22 },
          { header: "Usul", width: 9 },
          { header: "Summa (so'm)", width: 13 },
          { header: "Holat", width: 13 },
          { header: "To'lovchi izohi", width: 30 },
          { header: "Ko'rib chiqdi", width: 22 },
          { header: "Izoh", width: 30 },
        ],
        rows: payments.map((p) => [
          dt(p.createdAt),
          fullName(p.user),
          p.user.phone,
          p.plan?.name ?? (p.essayId ? "esse tekshiruvi" : ""),
          p.method === "MANUAL" ? "karta" : p.method.toLowerCase(),
          p.amountUzs,
          PAY_STATUS[p.status] ?? p.status,
          p.payerNote,
          fullName(p.reviewedBy),
          p.reviewNote,
        ]),
      },
      {
        name: "Ota-onalar",
        columns: [
          { header: "Ota-ona", width: 28 },
          { header: "Kim", width: 10 },
          { header: "Telefon", width: 16 },
          { header: "Telegram", width: 18 },
          { header: "O'quvchi", width: 30 },
          { header: "Guruh", width: 14 },
          { header: "Holat", width: 13 },
          { header: "Rad sababi", width: 26 },
          { header: "Ko'rib chiqdi", width: 22 },
          { header: "So'rov vaqti", width: 17 },
        ],
        rows: parents.map((l) => [
          fullName(l.parent),
          l.relation,
          l.phone,
          l.parent.username ? `@${l.parent.username}` : "",
          fullName(l.student.user),
          l.student.group?.name ?? "online",
          PARENT_STATUS[l.status],
          l.rejectReason,
          fullName(l.reviewedBy),
          dt(l.createdAt),
        ]),
      },
      {
        name: "Guruhlar",
        columns: [
          { header: "Guruh", width: 16 },
          { header: "Jadval", width: 22 },
          { header: "Oylik narx (so'm)", width: 16 },
          { header: "O'quvchilar", width: 12 },
          { header: "Faol", width: 7 },
          { header: "Yaratilgan", width: 17 },
        ],
        rows: groups.map((g) => [g.name, g.schedule, g.monthlyFeeUzs, g._count.students, yesNo(g.isActive), dt(g.createdAt)]),
      },
    ];

    await this.prisma.auditLog.create({ data: { actorId, action: "data.export", entity: "Export", entityId: "xlsx", meta: { students: students.length, attendance: attendance.length } } });
    const stamp = dt(new Date()).replace(" ", "_").replace(":", "-");
    return { file: buildXlsx(sheets), name: `onatili_${stamp}.xlsx` };
  }
}
