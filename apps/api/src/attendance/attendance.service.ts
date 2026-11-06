import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@onatili/db";
import {
  type AdminGroup,
  type AdminStudent,
  type AttendanceDay,
  type AttendanceMonth,
  type AttendanceSaveInput,
  type AttendanceStatusName,
  type GroupInput,
} from "@onatili/shared";
import { NotifyService } from "../notify/notify.service";
import { esc } from "../notify/telegram";
import { PrismaService } from "../prisma/prisma.service";
import { TrashService } from "../trash/trash.service";

const studentInclude = {
  user: { select: { id: true, firstName: true, lastName: true, username: true, phone: true } },
  group: { select: { id: true, name: true } },
  parents: {
    where: { status: { in: ["PENDING", "APPROVED"] } },
    include: { parent: { select: { firstName: true, lastName: true, username: true, telegramId: true } } },
  },
} satisfies Prisma.StudentProfileInclude;
type StudentRow = Prisma.StudentProfileGetPayload<{ include: typeof studentInclude }>;

const fullName = (u: { firstName: string; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ");
const toDate = (d: string) => new Date(`${d}T00:00:00.000Z`);
const fmtDate = (d: string) => d.split("-").reverse().join(".");

const EMOJI: Record<AttendanceStatusName, string> = { PRESENT: "✅", LATE: "⏰", ABSENT: "❌", EXCUSED: "📝" };

/** Ota-onaga boradigan matn */
export function attendanceMessage(child: string, group: string, date: string, status: AttendanceStatusName, note?: string | null, correction = false) {
  const phrase: Record<AttendanceStatusName, string> = {
    PRESENT: "darsga keldi",
    LATE: "darsga kechikib keldi",
    ABSENT: "darsga kelmadi",
    EXCUSED: "sababli darsda qatnashmadi",
  };
  return [
    correction ? "✏️ <b>Tuzatish</b>" : null,
    `${EMOJI[status]} <b>${esc(child)}</b> ${fmtDate(date)} kuni ${phrase[status]}.`,
    `Guruh: ${esc(group)}`,
    note ? `Izoh: ${esc(note)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly trash: TrashService,
  ) {}

  private toStudent(s: StudentRow): AdminStudent {
    return {
      userId: s.user.id,
      studentId: s.id,
      name: fullName(s.user),
      username: s.user.username,
      phone: s.user.phone,
      groupId: s.group?.id ?? null,
      groupName: s.group?.name ?? null,
      parents: s.parents.map((p) => ({
        linkId: p.id,
        status: p.status,
        name: fullName(p.parent),
        username: p.parent.username,
        phone: p.phone,
        relation: p.relation,
      })),
    };
  }

  // ---------------- Guruhlar ----------------

  async listGroups(): Promise<AdminGroup[]> {
    const gs = await this.prisma.group.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], include: { _count: { select: { students: true } } } });
    return gs.map((g) => ({ id: g.id, name: g.name, schedule: g.schedule, isActive: g.isActive, studentCount: g._count.students }));
  }

  async createGroup(actorId: string, d: GroupInput) {
    const g = await this.prisma.group.create({ data: { name: d.name, schedule: d.schedule ?? null, isActive: d.isActive ?? true } });
    await this.prisma.auditLog.create({ data: { actorId, action: "create", entity: "Group", entityId: g.id } });
    return g;
  }

  async updateGroup(actorId: string, id: string, d: Partial<GroupInput>) {
    await this.mustGroup(id);
    const g = await this.prisma.group.update({ where: { id }, data: d });
    await this.prisma.auditLog.create({ data: { actorId, action: "update", entity: "Group", entityId: id, meta: d } });
    return g;
  }

  async deleteGroup(actorId: string, id: string) {
    const g = await this.prisma.group.findUnique({ where: { id }, include: { _count: { select: { attendance: true, students: true } } } });
    if (!g) throw new NotFoundException("Guruh topilmadi");
    if (g._count.attendance > 0) throw new ConflictException("Guruhda davomat tarixi bor. O'chirish o'rniga «Faolsizlantirish»ni bosing.");
    if (g._count.students > 0) throw new ConflictException("Avval guruhdagi o'quvchilarni chiqaring");
    await this.trash.remove({ kind: "GROUP", id, title: g.name, actorId });
    await this.prisma.auditLog.create({ data: { actorId, action: "delete", entity: "Group", entityId: id, meta: { name: g.name } } });
    return { ok: true };
  }

  async groupStudents(groupId: string): Promise<AdminStudent[]> {
    await this.mustGroup(groupId);
    const rows = await this.prisma.studentProfile.findMany({
      where: { groupId },
      include: studentInclude,
      orderBy: { user: { firstName: "asc" } },
    });
    return rows.map((r) => this.toStudent(r));
  }

  /** O'quvchilarni qidirish (guruhga qo'shish uchun) */
  async searchStudents(q: string): Promise<AdminStudent[]> {
    const term = q.trim().replace(/^@/, "");
    // Telefon bo'yicha faqat kamida 3 ta raqam yozilganda (aks holda "aziz_2" kabi so'z hammaning raqamiga mos keladi)
    const digits = term.replace(/\D/g, "");
    const rows = await this.prisma.studentProfile.findMany({
      where: {
        user: {
          role: "STUDENT",
          ...(term
            ? {
                OR: [
                  { firstName: { contains: term, mode: "insensitive" } },
                  { lastName: { contains: term, mode: "insensitive" } },
                  { username: { contains: term, mode: "insensitive" } },
                  ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
                ],
              }
            : {}),
        },
      },
      include: studentInclude,
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return rows.map((r) => this.toStudent(r));
  }

  async addStudents(actorId: string, groupId: string, studentIds: string[]) {
    await this.mustGroup(groupId);
    const { count } = await this.prisma.studentProfile.updateMany({ where: { id: { in: studentIds } }, data: { groupId, mode: "OFFLINE", acceptedAt: new Date() } });
    await this.prisma.auditLog.create({ data: { actorId, action: "group.add", entity: "Group", entityId: groupId, meta: { studentIds } } });
    return { added: count };
  }

  async removeStudent(actorId: string, groupId: string, studentId: string) {
    const { count } = await this.prisma.studentProfile.updateMany({ where: { id: studentId, groupId }, data: { groupId: null, mode: "ONLINE" } });
    if (!count) throw new NotFoundException("O'quvchi bu guruhda emas");
    await this.prisma.auditLog.create({ data: { actorId, action: "group.remove", entity: "Group", entityId: groupId, meta: { studentId } } });
    return { ok: true };
  }

  // ---------------- Davomat ----------------

  async day(groupId: string, date: string): Promise<AttendanceDay> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException("Sana noto'g'ri");
    const g = await this.mustGroup(groupId);
    const [students, marks] = await Promise.all([
      this.groupStudents(groupId),
      this.prisma.attendance.findMany({ where: { groupId, date: toDate(date) } }),
    ]);
    const byStudent = new Map(marks.map((m) => [m.studentId, m]));
    return {
      date,
      group: { id: g.id, name: g.name, schedule: g.schedule, isActive: g.isActive, studentCount: students.length },
      rows: students.map((s) => {
        const m = byStudent.get(s.studentId);
        return { student: s, status: m?.status ?? null, note: m?.note ?? null, notifiedAt: m?.notifiedAt?.toISOString() ?? null };
      }),
    };
  }

  /**
   * Davomatni saqlaydi va tasdiqlangan ota-onalarga xabar yuboradi.
   * Faqat yangi yoki o'zgargan yozuvlar uchun xabar ketadi; o'zgargan bo'lsa, "Tuzatish" bilan.
   */
  async save(actorId: string, groupId: string, d: AttendanceSaveInput) {
    const g = await this.mustGroup(groupId);
    const date = toDate(d.date);
    const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10); // Toshkent vaqti
    if (d.date > today) throw new BadRequestException("Kelajakdagi sana uchun davomat olib bo'lmaydi");

    const students = await this.prisma.studentProfile.findMany({
      where: { id: { in: d.items.map((i) => i.studentId) } },
      include: studentInclude,
    });
    const byId = new Map(students.map((s) => [s.id, s]));
    const foreign = d.items.filter((i) => byId.get(i.studentId)?.groupId !== groupId);
    if (foreign.length) throw new BadRequestException("Ba'zi o'quvchilar bu guruhda emas");

    const prev = new Map(
      (await this.prisma.attendance.findMany({ where: { date, studentId: { in: d.items.map((i) => i.studentId) } } })).map((a) => [a.studentId, a]),
    );

    let notified = 0;
    for (const item of d.items) {
      const before = prev.get(item.studentId);
      const note = item.note?.trim() || null;
      const changed = !before || before.status !== item.status || (before.note ?? null) !== note;
      const rec = await this.prisma.attendance.upsert({
        where: { studentId_date: { studentId: item.studentId, date } },
        update: { status: item.status, note, groupId, markedById: actorId },
        create: { studentId: item.studentId, groupId, date, status: item.status, note, markedById: actorId },
      });
      if (!changed) continue;

      const s = byId.get(item.studentId)!;
      const parents = s.parents.filter((p) => p.status === "APPROVED");
      const correction = Boolean(before?.notifiedAt) && before?.status !== item.status;
      for (const p of parents) {
        await this.notify.send(p.parent.telegramId, attendanceMessage(fullName(s.user), g.name, d.date, item.status, note, correction), rec.id);
        notified++;
      }
    }
    await this.prisma.auditLog.create({
      data: { actorId, action: "attendance.save", entity: "Group", entityId: groupId, meta: { date: d.date, count: d.items.length } },
    });
    return { saved: d.items.length, notified };
  }

  async month(groupId: string, month: string): Promise<AttendanceMonth> {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException("Oy noto'g'ri (YYYY-MM)");
    const [y, m] = month.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));
    const [students, marks] = await Promise.all([
      this.groupStudents(groupId),
      this.prisma.attendance.findMany({ where: { groupId, date: { gte: from, lt: to } }, orderBy: { date: "asc" } }),
    ]);
    const days = [...new Set(marks.map((a) => a.date.toISOString().slice(0, 10)))];
    return {
      month,
      days,
      rows: students.map((s) => ({
        student: s,
        marks: Object.fromEntries(marks.filter((a) => a.studentId === s.studentId).map((a) => [a.date.toISOString().slice(0, 10), a.status])),
      })),
    };
  }

  private async mustGroup(id: string) {
    const g = await this.prisma.group.findUnique({ where: { id } });
    if (!g) throw new NotFoundException("Guruh topilmadi");
    return g;
  }
}

