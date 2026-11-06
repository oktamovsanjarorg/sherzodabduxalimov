import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@onatili/db";
import {
  ATTENDANCE_STATUSES,
  ESSAY_MAX_SCORE,
  currentMonth,
  normUzPhone,
  parseStudentLine,
  type AttendanceStatusName,
  type RosterRow,
  type StudentCreateInput,
  type StudentDetail,
  type NewcomerRow,
} from "@onatili/shared";
import { randomBytes } from "node:crypto";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { defaultMonthlyFee, effectiveFee } from "../billing/fee";
import { esc } from "../notify/telegram";
import { StaffService, type TelegramProfile } from "../staff/staff.service";

const DAY = 86_400_000;
const fullName = (u: { firstName: string; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ");
const code = () => randomBytes(6).toString("base64url");
/** Telefonlarni solishtirish: oxirgi 9 raqam (998 prefiksi bilan va prefikssiz yozilganlar mos keladi) */
const phoneKey = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-9);
const pct = (score: number | null, max: number | null) => (score !== null && max ? Math.round((score / max) * 100) : 0);

const rosterInclude = (month: string, since: Date) =>
  ({
    user: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        phone: true,
        telegramId: true,
        updatedAt: true,
        isBlocked: true,
        blockedReason: true,
        subscriptions: { where: { status: "ACTIVE", endsAt: { gt: new Date() } }, orderBy: { endsAt: "desc" }, take: 1, select: { endsAt: true } },
      },
    },
    group: { select: { id: true, name: true, isActive: true, monthlyFeeUzs: true } },
    parents: { where: { status: { in: ["PENDING", "APPROVED"] } }, select: { status: true } },
    offlinePayments: { where: { month }, select: { id: true } },
    attendance: { where: { date: { gte: since } }, select: { status: true } },
  }) satisfies Prisma.StudentProfileInclude;

type RosterProfile = Prisma.StudentProfileGetPayload<{ include: ReturnType<typeof rosterInclude> }>;

/**
 * O'quvchilar: ustoz ularni botsiz, qo'lda kiritadi (ism, telefon, guruh). O'quvchi keyinroq botga kirib
 * telefonini ulashsa yoki shaxsiy havolasini bossa, Telegram hisobi shu yozuvga bog'lanadi.
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private inviteUrl(c: string | null) {
    return c ? `https://t.me/${this.env.BOT_USERNAME}?start=s_${c}` : null;
  }

  // ---------------- Ro'yxat ----------------

  async roster(opts: { groupId?: string; q?: string }, isTeacher: boolean): Promise<RosterRow[]> {
    const term = (opts.q ?? "").trim().replace(/^@/, "");
    const digits = term.replace(/\D/g, "");
    const where: Prisma.StudentProfileWhereInput = {
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
      ...(opts.groupId === "none" ? { groupId: null } : opts.groupId ? { groupId: opts.groupId } : {}),
    };
    const rows = await this.prisma.studentProfile.findMany({
      where,
      include: rosterInclude(currentMonth(), new Date(Date.now() - 30 * DAY)),
      orderBy: [{ user: { firstName: "asc" } }, { user: { lastName: "asc" } }],
      take: 1000,
    });
    return rows.map((r) => this.toRow(r, isTeacher));
  }

  private toRow(r: RosterProfile, isTeacher: boolean): RosterRow {
    const present = r.attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
    return {
      studentId: r.id,
      userId: r.user.id,
      name: fullName(r.user),
      username: r.user.username,
      phone: r.user.phone,
      group: r.group ? { id: r.group.id, name: r.group.name } : null,
      telegramLinked: r.user.telegramId !== null,
      parents: { approved: r.parents.filter((p) => p.status === "APPROVED").length, pending: r.parents.filter((p) => p.status === "PENDING").length },
      // Obuna (to'lov) ma'lumoti faqat egaga
      subscriptionEndsAt: isTeacher ? (r.user.subscriptions[0]?.endsAt.toISOString() ?? null) : null,
      paidThisMonth: isTeacher && r.group ? r.offlinePayments.length > 0 : null,
      attendance30: { present, absent: r.attendance.filter((a) => a.status === "ABSENT").length, total: r.attendance.length },
      lastActiveAt: r.user.telegramId !== null ? r.user.updatedAt.toISOString() : null,
      accessMode: r.accessMode,
      hasAccess: r.accessMode === "FREE" || (r.accessMode === "AUTO" && (r.user.subscriptions.length > 0 || !!r.group?.isActive)),
      blocked: r.user.isBlocked,
    };
  }

  // ---------------- Qo'lda kiritish ----------------

  private async mustGroup(groupId: string | null) {
    if (groupId && !(await this.prisma.group.findUnique({ where: { id: groupId }, select: { id: true } }))) throw new NotFoundException("Guruh topilmadi");
  }

  /** Bir xil telefon bilan ikki marta kiritilmasin */
  private async assertPhoneFree(phone: string | null, exceptUserId?: string) {
    const key = phoneKey(phone);
    // To'liq bo'lmagan raqam (9 raqamdan kam) boshqa o'quvchilarning raqami oxiriga tasodifan mos kelib qolmasin
    if (key.length < 9) return;
    const same = await this.prisma.user.findFirst({ where: { role: "STUDENT", phone: { endsWith: key }, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) }, select: { firstName: true, lastName: true } });
    if (same) throw new ConflictException(`Bu telefon raqami bilan o'quvchi bor: ${fullName(same)}`);
  }

  async create(actorId: string, d: StudentCreateInput) {
    await this.mustGroup(d.groupId);
    const phone = normUzPhone(d.phone);
    await this.assertPhoneFree(phone);
    const u = await this.prisma.user.create({
      data: {
        telegramId: null,
        firstName: d.firstName,
        lastName: d.lastName,
        nameLocked: true,
        phone,
        role: "STUDENT",
        student: {
          create: { parentLinkCode: randomBytes(4).toString("hex").toUpperCase(), inviteCode: code(), groupId: d.groupId, mode: d.groupId ? "OFFLINE" : "ONLINE", acceptedAt: new Date() },
        },
      },
      include: { student: true },
    });
    await this.prisma.auditLog.create({ data: { actorId, action: "student.create", entity: "StudentProfile", entityId: u.student!.id } });
    return { studentId: u.student!.id };
  }

  /** Har qatorda bitta o'quvchi. Telefoni bor-yo'qligi yoki takrorlanishi bo'yicha hisobot qaytaradi */
  async bulkCreate(actorId: string, groupId: string | null, text: string) {
    await this.mustGroup(groupId);
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new BadRequestException("Ro'yxat bo'sh");
    if (lines.length > 300) throw new BadRequestException("Bir martada ko'pi bilan 300 ta o'quvchi");
    const added: string[] = [];
    const skipped: { line: string; reason: string }[] = [];
    for (const line of lines) {
      const p = parseStudentLine(line);
      if (!p) {
        skipped.push({ line, reason: "Ism topilmadi" });
        continue;
      }
      try {
        await this.create(actorId, { ...p, groupId });
        added.push([p.firstName, p.lastName].filter(Boolean).join(" "));
      } catch (e) {
        skipped.push({ line, reason: e instanceof Error ? e.message : "Xato" });
      }
    }
    return { added: added.length, skipped };
  }

  async update(actorId: string, studentId: string, d: Partial<StudentCreateInput>) {
    const sp = await this.prisma.studentProfile.findUnique({ where: { id: studentId }, include: { user: true } });
    if (!sp) throw new NotFoundException("O'quvchi topilmadi");
    if (d.groupId !== undefined) await this.mustGroup(d.groupId);
    const phone = d.phone !== undefined ? normUzPhone(d.phone) : undefined;
    if (phone) await this.assertPhoneFree(phone, sp.userId);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: sp.userId },
        data: {
          ...(d.firstName ? { firstName: d.firstName, nameLocked: true } : {}),
          ...(d.lastName !== undefined ? { lastName: d.lastName, nameLocked: true } : {}),
          ...(phone !== undefined ? { phone } : {}),
        },
      }),
      ...(d.groupId !== undefined
        ? [this.prisma.studentProfile.update({ where: { id: studentId }, data: { groupId: d.groupId, mode: d.groupId ? "OFFLINE" : "ONLINE", acceptedAt: new Date() } })]
        : []),
    ]);
    await this.prisma.auditLog.create({ data: { actorId, action: "student.update", entity: "StudentProfile", entityId: studentId, meta: d as object } });
    return this.detail(studentId, true);
  }

  /**
   * O'quvchini butunlay o'chirish: barcha natijalari, davomati, to'lovlari bilan.
   * Botga kirgan o'quvchi uchun faqat ega (TEACHER) va aniq tasdiq bilan (force). U qayta kirsa, bo'sh hisob ochiladi.
   */
  async remove(actorId: string, studentId: string, opts: { force: boolean; isTeacher: boolean }) {
    const sp = await this.prisma.studentProfile.findUnique({ where: { id: studentId }, include: { user: { select: { id: true, telegramId: true, firstName: true, lastName: true } } } });
    if (!sp) throw new NotFoundException("O'quvchi topilmadi");
    // To'lov tarixi bor yoki botdan foydalanayotgan o'quvchini faqat ega, ismini yozib tasdiqlagach (force) o'chiradi.
    // To'lovlar yozuvi o'chadi, lekin jami summa audit jurnalida qoladi (kim, qachon, qancha)
    const [paid, offline] = await Promise.all([
      this.prisma.payment.aggregate({ where: { userId: sp.user.id, status: "APPROVED" }, _count: true, _sum: { amountUzs: true } }),
      this.prisma.offlinePayment.aggregate({ where: { studentId }, _count: true, _sum: { amountUzs: true } }),
    ]);
    const hasMoney = paid._count + offline._count > 0;
    if ((hasMoney || sp.user.telegramId !== null) && !(opts.force && opts.isTeacher))
      throw new ConflictException(opts.isTeacher ? "O'chirishni tasdiqlang: o'quvchining ismini yozing" : "Bu o'quvchini faqat ustoz o'chira oladi");
    await this.prisma.user.delete({ where: { id: sp.user.id } });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: "student.delete",
        entity: "StudentProfile",
        entityId: studentId,
        meta: {
          name: fullName(sp.user),
          payments: { online: paid._count, onlineUzs: paid._sum.amountUzs ?? 0, offline: offline._count, offlineUzs: offline._sum.amountUzs ?? 0 },
        },
      },
    });
    return { ok: true };
  }

  async newcomers(): Promise<NewcomerRow[]> {
    const rows = await this.prisma.studentProfile.findMany({
      where: { acceptedAt: null, user: { role: "STUDENT", telegramId: { not: null } } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        parents: { select: { status: true } },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            phone: true,
            photoUrl: true,
            isBlocked: true,
            _count: { select: { lessonProgress: { where: { completedAt: { not: null } } }, attempts: { where: { status: { not: "IN_PROGRESS" } } }, essays: true } },
          },
        },
      },
    });
    return rows
      .filter((r) => !r.user.isBlocked) // bloklangan: hal qilingan
      .map((r) => ({
        studentId: r.id,
        userId: r.user.id,
        name: fullName(r.user),
        username: r.user.username,
        phone: r.user.phone,
        photoUrl: r.user.photoUrl,
        createdAt: r.createdAt.toISOString(),
        parentStatus: r.parents.some((p) => p.status === "APPROVED") ? "APPROVED" : r.parents.some((p) => p.status === "PENDING") ? "PENDING" : "NONE",
        activity: { lessons: r.user._count.lessonProgress, tests: r.user._count.attempts, essays: r.user._count.essays },
      }));
  }

  /** Ustoz ko'rib chiqdi: guruhga qo'shadi (groupId) yoki online o'quvchi sifatida qoldiradi (null) */
  async accept(actorId: string, studentId: string, groupId: string | null) {
    if (groupId) {
      const g = await this.prisma.group.findUnique({ where: { id: groupId }, select: { isActive: true } });
      if (!g?.isActive) throw new NotFoundException("Guruh topilmadi");
    }
    const { count } = await this.prisma.studentProfile.updateMany({
      where: { id: studentId },
      data: { acceptedAt: new Date(), ...(groupId ? { groupId, mode: "OFFLINE" as const } : {}) },
    });
    if (!count) throw new NotFoundException("O'quvchi topilmadi");
    await this.prisma.auditLog.create({ data: { actorId, action: "student.accept", entity: "StudentProfile", entityId: studentId, meta: { groupId } } });
    return { ok: true };
  }

  /** Ilovaga kirish rejimi: AUTO (obuna/guruh), FREE (bepul ochiq), CLOSED (yopiq) */
  async setAccess(actorId: string, studentId: string, mode: "AUTO" | "FREE" | "CLOSED") {
    const { count } = await this.prisma.studentProfile.updateMany({ where: { id: studentId }, data: { accessMode: mode } });
    if (!count) throw new NotFoundException("O'quvchi topilmadi");
    await this.prisma.auditLog.create({ data: { actorId, action: "student.access", entity: "StudentProfile", entityId: studentId, meta: { mode } } });
    return this.detail(studentId, true);
  }

  /** Bloklangan o'quvchi ilovani ocha olmaydi (tokeni ham darhol ishlamay qoladi) */
  async setBlocked(actorId: string, studentId: string, blocked: boolean, reason: string | null) {
    const sp = await this.prisma.studentProfile.findUnique({ where: { id: studentId }, select: { userId: true } });
    if (!sp) throw new NotFoundException("O'quvchi topilmadi");
    await this.prisma.user.update({ where: { id: sp.userId }, data: { isBlocked: blocked, blockedReason: blocked ? reason : null } });
    await this.prisma.auditLog.create({ data: { actorId, action: blocked ? "student.block" : "student.unblock", entity: "StudentProfile", entityId: studentId, meta: { reason } } });
    return this.detail(studentId, true);
  }

  async resetInvite(studentId: string) {
    const sp = await this.prisma.studentProfile.findUnique({ where: { id: studentId }, include: { user: { select: { telegramId: true } } } });
    if (!sp) throw new NotFoundException("O'quvchi topilmadi");
    if (sp.user.telegramId !== null) throw new ConflictException("O'quvchi allaqachon botga ulangan");
    const c = code();
    await this.prisma.studentProfile.update({ where: { id: studentId }, data: { inviteCode: c } });
    return { inviteUrl: this.inviteUrl(c) };
  }

  // ---------------- Bitta o'quvchi: hammasi bitta joyda ----------------

  async detail(studentId: string, isTeacher: boolean): Promise<StudentDetail> {
    const month = currentMonth();
    const sp = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      include: {
        ...rosterInclude(month, new Date(Date.now() - 30 * DAY)),
        parents: { orderBy: { createdAt: "asc" }, include: { parent: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!sp || !sp.user) throw new NotFoundException("O'quvchi topilmadi");
    const userId = sp.user.id;
    const months = [0, 1, 2, 3, 4, 5].map((i) => {
      const d = new Date(`${month}-15T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - i);
      return d.toISOString().slice(0, 7);
    });
    const [attendance, counts, offline, payments, lessons, attempts, essays] = await Promise.all([
      this.prisma.attendance.findMany({ where: { studentId }, orderBy: { date: "desc" }, take: 30, include: { group: { select: { name: true } } } }),
      this.prisma.attendance.groupBy({ by: ["status"], where: { studentId }, _count: true }),
      isTeacher ? this.prisma.offlinePayment.findMany({ where: { studentId, month: { in: months } } }) : Promise.resolve([]),
      isTeacher
        ? this.prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10, include: { plan: { select: { name: true } } } })
        : Promise.resolve([]),
      this.prisma.lessonProgress.count({ where: { userId, completedAt: { not: null } } }),
      this.prisma.attempt.findMany({
        where: { userId, status: { in: ["SUBMITTED", "EXPIRED"] } },
        orderBy: { finishedAt: "desc" },
        take: 50,
        include: { test: { select: { title: true, type: true } } },
      }),
      this.prisma.essay.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10, include: { reviews: { select: { source: true, totalScore: true } } } }),
    ]);
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, status: "ACTIVE", endsAt: { gt: new Date() } },
      orderBy: { endsAt: "desc" },
      include: { plan: { select: { name: true } } },
    });
    const percents = attempts.map((a) => pct(a.score, a.maxScore));
    const row = this.toRow({ ...sp, parents: sp.parents.filter((p) => p.status !== "REJECTED") } as unknown as RosterProfile, isTeacher);
    return {
      ...row,
      createdAt: sp.createdAt.toISOString(),
      blockedReason: sp.user.blockedReason,
      inviteUrl: sp.user.telegramId === null ? this.inviteUrl(sp.inviteCode) : null,
      parentInviteUrl: `https://t.me/${this.env.BOT_USERNAME}?start=p_${sp.parentLinkCode}`,
      parentList: sp.parents.map((p) => ({ id: p.id, name: fullName(p.parent), phone: p.phone, relation: p.relation, status: p.status })),
      attendance: {
        counts: Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s, counts.find((c) => c.status === s)?._count ?? 0])) as Record<AttendanceStatusName, number>,
        recent: attendance.map((a) => ({ date: a.date.toISOString().slice(0, 10), status: a.status, note: a.note, groupName: a.group?.name ?? null })),
      },
      billing: isTeacher
        ? {
            // Qo'shilgan oydan oldingilari ko'rsatilmaydi (o'shanda hali o'quvchi bo'lmagan)
            offlineMonths: sp.group
              ? months
                  .filter((m) => m >= currentMonth(sp.createdAt) || offline.some((x) => x.month === m))
                  .map((m) => {
                  const p = offline.find((x) => x.month === m);
                  return { month: m, paid: !!p, amountUzs: p?.amountUzs ?? null, note: p?.note ?? null };
                })
              : [],
            groupFeeUzs: sp.group ? effectiveFee(sp.group.monthlyFeeUzs, await defaultMonthlyFee(this.prisma)) : null,
            subscription: sub ? { planName: sub.plan.name, endsAt: sub.endsAt.toISOString() } : null,
            payments: payments.map((p) => ({ id: p.id, title: p.plan?.name ?? "Esse tekshiruvi", amountUzs: p.amountUzs, status: p.status, createdAt: p.createdAt.toISOString() })),
          }
        : null,
      stats: {
        lessonsCompleted: lessons,
        testsTaken: attempts.length,
        averagePercent: percents.length ? Math.round(percents.reduce((s, x) => s + x, 0) / percents.length) : null,
        recentAttempts: attempts.slice(0, 10).map((a) => ({
          id: a.id,
          title: a.test.title,
          type: a.test.type,
          percent: pct(a.score, a.maxScore),
          score: a.score ?? 0,
          maxScore: a.maxScore ?? 0,
          finishedAt: (a.finishedAt ?? a.startedAt).toISOString(),
        })),
        essays: essays.map((e) => {
          const r = e.reviews.find((x) => x.source === "TEACHER") ?? e.reviews[0];
          return { id: e.id, prompt: e.prompt, mode: e.mode, status: e.status, score: r ? r.totalScore : null, createdAt: e.createdAt.toISOString() };
        }),
      },
    };
  }

  // ---------------- Telegram hisobini bog'lash ----------------

  /** Bot: o'quvchi shaxsiy havolani bosdi */
  async claimByInvite(c: string, from: TelegramProfile): Promise<{ status: "claimed" | "staff" | "used" | "invalid"; name?: string; groupName?: string }> {
    const sp = await this.prisma.studentProfile.findUnique({ where: { inviteCode: c }, include: { user: true, group: { select: { name: true } } } });
    if (!sp) return { status: "invalid" };
    if (sp.user.telegramId !== null) return { status: sp.user.telegramId === BigInt(from.id) ? "claimed" : "used", name: fullName(sp.user), groupName: sp.group?.name };
    const existing = await this.prisma.user.findUnique({ where: { telegramId: BigInt(from.id) } });
    if (existing && existing.role !== "STUDENT") return { status: "staff" };
    if (existing) await this.mergeInto(sp.userId, existing.id);
    else {
      await this.prisma.user.update({ where: { id: sp.userId }, data: { telegramId: BigInt(from.id), username: from.username ?? null } });
      await this.prisma.studentProfile.update({ where: { id: sp.id }, data: { inviteCode: null } });
    }
    await this.staff.alertOwners(`🔗 Siz kiritgan <b>${esc(fullName(sp.user))}</b> botga ulandi (shaxsiy havola orqali)${sp.group ? ` · ${esc(sp.group.name)}` : ""}`);
    return { status: "claimed", name: fullName(sp.user), groupName: sp.group?.name };
  }

  /** Botda telefon ulashildi: shu raqam bilan qo'lda kiritilgan o'quvchi bo'lsa, hisoblar birlashtiriladi */
  async claimByPhone(userId: string, phone: string) {
    const key = phoneKey(phone);
    if (key.length < 9) return false;
    const placeholder = await this.prisma.user.findFirst({ where: { telegramId: null, role: "STUDENT", phone: { endsWith: key }, id: { not: userId } } });
    if (!placeholder) return false;
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (me?.role !== "STUDENT") return false;
    await this.mergeInto(placeholder.id, userId);
    await this.staff.alertOwners(`🔗 Siz kiritgan <b>${esc(fullName(placeholder))}</b> botga ulandi (telefon raqami orqali)`);
    return true;
  }

  /**
   * Qo'lda kiritilgan yozuvni (placeholder) haqiqiy Telegram hisobiga ko'chiradi: guruh, davomat,
   * offline to'lovlar, ota-onalar, ism-familiya (ustoz yozgani) va telefon. So'ng placeholder o'chiriladi.
   */
  private async mergeInto(placeholderUserId: string, realUserId: string) {
    await this.prisma.$transaction(async (tx) => {
      const ph = await tx.user.findUniqueOrThrow({ where: { id: placeholderUserId }, include: { student: true } });
      const real = await tx.user.findUniqueOrThrow({ where: { id: realUserId }, include: { student: true } });
      const ps = ph.student!;
      let rs = real.student;
      if (!rs) rs = await tx.studentProfile.create({ data: { userId: real.id, parentLinkCode: randomBytes(4).toString("hex").toUpperCase() } });

      // Davomat va to'lovlar: bir kunga/oyga bitta yozuv. To'qnashsa, ustoz yozgani (placeholder) ustun
      const att = await tx.attendance.findMany({ where: { studentId: ps.id }, select: { id: true, date: true } });
      if (att.length) await tx.attendance.deleteMany({ where: { studentId: rs.id, date: { in: att.map((a) => a.date) } } });
      await tx.attendance.updateMany({ where: { studentId: ps.id }, data: { studentId: rs.id } });
      const pays = await tx.offlinePayment.findMany({ where: { studentId: ps.id }, select: { month: true } });
      if (pays.length) await tx.offlinePayment.deleteMany({ where: { studentId: rs.id, month: { in: pays.map((p) => p.month) } } });
      await tx.offlinePayment.updateMany({ where: { studentId: ps.id }, data: { studentId: rs.id } });
      const links = await tx.parentLink.findMany({ where: { studentId: ps.id } });
      for (const l of links) {
        const dup = await tx.parentLink.findUnique({ where: { parentId_studentId: { parentId: l.parentId, studentId: rs.id } } });
        if (dup) await tx.parentLink.delete({ where: { id: l.id } });
        else await tx.parentLink.update({ where: { id: l.id }, data: { studentId: rs.id } });
      }
      // Obuna/to'lovlar (ustoz qo'lda bergan bo'lishi mumkin)
      await tx.subscription.updateMany({ where: { userId: ph.id }, data: { userId: real.id } });
      await tx.payment.updateMany({ where: { userId: ph.id }, data: { userId: real.id } });

      // Ustoz qo'ygan kirish rejimi (ochiq/yopiq) va blok ham ko'chadi
      await tx.studentProfile.update({
        where: { id: rs.id },
        data: {
          groupId: ps.groupId ?? rs.groupId,
          mode: (ps.groupId ?? rs.groupId) ? "OFFLINE" : "ONLINE",
          acceptedAt: rs.acceptedAt ?? ps.acceptedAt ?? new Date(), // ustoz o'zi kiritgan yozuv: ko'rib chiqilgan
          ...(ps.accessMode !== "AUTO" ? { accessMode: ps.accessMode } : {}),
        },
      });
      await tx.user.delete({ where: { id: ph.id } });
      await tx.user.update({
        where: { id: real.id },
        data: {
          firstName: ph.firstName,
          lastName: ph.lastName,
          nameLocked: true,
          ...(ph.phone && !real.phone ? { phone: ph.phone } : {}),
          ...(ph.isBlocked ? { isBlocked: true, blockedReason: ph.blockedReason } : {}),
        },
      });
      await tx.auditLog.create({ data: { actorId: real.id, action: "student.claim", entity: "StudentProfile", entityId: rs.id, meta: { from: ps.id } } });
    });
  }
}
