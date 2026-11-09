import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@onatili/db";
import { NAME_MATCH_THRESHOLD, nameMatchScore, type AdminParentLink, type ChildView } from "@onatili/shared";
import { ENV, type Env } from "../config/env";
import { esc } from "../notify/telegram";
import { NotifyService, type Keyboard } from "../notify/notify.service";
import { PrismaService } from "../prisma/prisma.service";
import { StudentsService } from "../students/students.service";
import { StaffService, type TelegramProfile } from "../staff/staff.service";
import { PARENT_INVITE_TTL_MS } from "../users/users.service";

/** Bitta o'quvchiga ulanishi mumkin bo'lgan faol (kutilayotgan yoki tasdiqlangan) ota-onalar soni */
export const MAX_PARENTS = 2;
const MANY_CHILDREN = 3;
/** Ustozga ko'rsatiladigan ogohlantirishlar. no_student_phone yo'q: raqamsiz o'quvchi ko'p, u shubha belgisi emas */
const FLAG_WARNINGS: Record<string, string> = {
  same_phone: "Raqami o'quvchi raqami bilan bir xil",
  student_activity: "Bu hisob ilovada dars yoki test ishlagan: o'quvchining o'zi bo'lishi mumkin",
  many_children: "Ko'p o'quvchiga ulanmoqda",
};

export const normPhone = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d ? `+${d}` : "";
};
const fullName = (u: { firstName: string; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ");

export type ParentLinkResult =
  | { status: "created" | "exists"; studentName: string; linkStatus?: string }
  | { status: "invalid_code" | "not_own_contact" | "self" | "limit" | "rejected_before" | "is_student" };

const linkInclude = {
  parent: { select: { id: true, firstName: true, lastName: true, username: true, telegramId: true } },
  reviewedBy: { select: { firstName: true, lastName: true } },
  student: {
    select: {
      group: { select: { name: true } },
      user: { select: { id: true, firstName: true, lastName: true, username: true, phone: true, telegramId: true } },
    },
  },
} satisfies Prisma.ParentLinkInclude;

@Injectable()
export class ParentsService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly staff: StaffService,
    private readonly notify: NotifyService,
    private readonly students: StudentsService,
  ) {}

  // ---------------- Bot (ichki) ----------------

  /** O'quvchi (yoki istalgan foydalanuvchi) bot orqali o'z raqamini ulashdi */
  async saveOwnPhone(from: TelegramProfile, contact: { phone_number: string; user_id?: number }) {
    // Faqat o'z kontakti: boshqaning kontaktini forward qilib bo'lmaydi
    if (!contact.user_id || BigInt(contact.user_id) !== BigInt(from.id)) return { status: "not_own_contact" as const };
    const user = await this.staff.upsertTelegramUser(from);
    const phone = normPhone(contact.phone_number);
    // Ustoz shu raqam bilan qo'lda kiritgan o'quvchi bo'lsa: guruh, davomat, to'lovlar shu hisobga o'tadi.
    // Ota-ona (ulanish so'rovi bor) bo'lsa birlashtirilmaydi: ustoz farzandni ota-onasi raqami bilan kiritgan bo'lishi mumkin
    const isParent = (await this.prisma.parentLink.count({ where: { parentId: user.id } })) > 0;
    const merged = isParent ? false : await this.students.claimByPhone(user.id, phone).catch(() => false);
    await this.prisma.user.update({ where: { id: user.id }, data: { phone } });
    return { status: merged ? ("merged" as const) : ("saved" as const) };
  }

  /**
   * Ota-ona havolani ochdi: kod tekshiriladi va raqam kelguncha saqlanadi.
   * Havola orqali birinchi marta kelgan odam darhol ota-ona bo'ladi: o'quvchi sifatida ko'rinmaydi.
   */
  async setPending(from: TelegramProfile, code: string): Promise<{ status: "ok" | "invalid" | "self" }> {
    const student = await this.prisma.studentProfile.findUnique({ where: { parentLinkCode: code.toUpperCase() }, select: { user: { select: { telegramId: true } } } });
    if (!student) return { status: "invalid" };
    const id = BigInt(from.id);
    if (student.user.telegramId === id) return { status: "self" };
    const { user, created } = await this.staff.upsertTelegramUserEx(from);
    if (created && user.role === "STUDENT") await this.prisma.user.update({ where: { id: user.id }, data: { role: "PARENT" } });
    await this.prisma.pendingParent.upsert({ where: { telegramId: id }, update: { code, createdAt: new Date() }, create: { telegramId: id, code } });
    return { status: "ok" };
  }

  /** Kod 24 soat amal qiladi; olingach o'chiriladi. Muddati o'tgan bo'lsa expired: raqam oddiy saqlanmaydi, ota-onaga aytiladi */
  async takePending(telegramId: number) {
    const id = BigInt(telegramId);
    const p = await this.prisma.pendingParent.findUnique({ where: { telegramId: id } });
    if (!p) return { code: null };
    await this.prisma.pendingParent.delete({ where: { telegramId: id } }).catch(() => {});
    return Date.now() - p.createdAt.getTime() < PARENT_INVITE_TTL_MS ? { code: p.code } : { code: null, expired: true };
  }

  /**
   * Ota-ona havola orqali botga kirib, o'z raqamini ulashdi.
   * Firibgarlikka qarshi: o'z akkaunti bo'lmasa rad etiladi; shubhali holatlar belgilanadi va ustoz ko'radi.
   */
  async linkParent(code: string, from: TelegramProfile, contact: { phone_number: string; user_id?: number }, relation?: string | null): Promise<ParentLinkResult> {
    const student = await this.prisma.studentProfile.findUnique({
      where: { parentLinkCode: code.toUpperCase() },
      include: { user: true, parents: { where: { status: { in: ["PENDING", "APPROVED"] } } } },
    });
    if (!student) return { status: "invalid_code" };
    if (!contact.user_id || BigInt(contact.user_id) !== BigInt(from.id)) return { status: "not_own_contact" };
    if (student.user.telegramId === BigInt(from.id)) return { status: "self" };

    const parent = await this.staff.upsertTelegramUser(from);
    // Ustoz tasdiqlagan yoki guruhdagi o'quvchi boshqa o'quvchining ota-onasi bo'la olmaydi: aks holda hisobi ota-onaga aylanib, guruhdan chiqib qoladi
    if (parent.role === "STUDENT") {
      const own = await this.prisma.studentProfile.findUnique({ where: { userId: parent.id }, select: { acceptedAt: true, groupId: true } });
      if (own && (own.acceptedAt || own.groupId)) return { status: "is_student" };
    }
    const phone = normPhone(contact.phone_number);
    const existing = await this.prisma.parentLink.findUnique({ where: { parentId_studentId: { parentId: parent.id, studentId: student.id } } });
    if (existing?.status === "REJECTED") return { status: "rejected_before" };
    if (existing) return { status: "exists", studentName: fullName(student.user), linkStatus: existing.status };
    if (student.parents.length >= MAX_PARENTS) return { status: "limit" };

    // Shubhali belgilar (ustoz tekshirishi uchun)
    const [activity, children] = await Promise.all([
      this.prisma.attempt.count({ where: { userId: parent.id } }).then(async (a) => a + (await this.prisma.lessonProgress.count({ where: { userId: parent.id } }))),
      this.prisma.parentLink.count({ where: { parentId: parent.id, status: { in: ["PENDING", "APPROVED"] } } }),
    ]);
    const flags: string[] = [];
    if (!student.user.phone) flags.push("no_student_phone");
    else if (normPhone(student.user.phone) === phone) flags.push("same_phone");
    if (activity > 0) flags.push("student_activity");
    if (children + 1 > MANY_CHILDREN) flags.push("many_children");

    const [link, parentNow] = await this.prisma.$transaction([
      this.prisma.parentLink.create({
        data: { parentId: parent.id, studentId: student.id, phone, relation: relation?.slice(0, 30) ?? null, flags },
      }),
      this.prisma.user.update({
        where: { id: parent.id },
        // Ilovada o'quvchi sifatida ishlamagan oddiy akkaunt ota-ona roliga o'tadi (xodimlarga tegilmaydi)
        // O'quvchi deb o'ylab farzandining ismini yozgan bo'lsa, ism Telegram'dagisiga qaytadi. O'z ismini yozgan bo'lsa, qoladi
        data: {
          phone,
          ...(parent.role === "STUDENT" && activity === 0
            ? {
                role: "PARENT",
                ...(parent.nameLocked && nameMatchScore(fullName(parent), fullName(student.user)) >= NAME_MATCH_THRESHOLD
                  ? { firstName: from.first_name, lastName: from.last_name ?? null, nameLocked: false }
                  : {}),
              }
            : {}),
        },
      }),
    ]);
    await this.notify.send(
      student.user.telegramId,
      `👨‍👩‍👦 <b>${esc(fullName(parentNow))}</b> sizning ota-onangiz sifatida ulanish so'rovini yubordi. Ustoz tasdiqlagach, davomat xabarlari unga boradi.`,
    );
    const group = (await this.prisma.studentProfile.findUnique({ where: { id: student.id }, select: { group: { select: { name: true } } } }))?.group?.name;
    const warnings = flags.flatMap((f) => (FLAG_WARNINGS[f] ? [`⚠️ ${FLAG_WARNINGS[f]}`] : []));
    await this.staff.alertOwners(
      [
        // Birinchi qator yolg'iz qolsa ham tushunarli: hal qilingach xabar shu qator + natijaga qisqaradi
        `👨‍👩‍👦 Ota-ona so'rovi: <b>${esc(fullName(parentNow))}</b> → <b>${esc(fullName(student.user))}</b>`,
        ...(link.relation ? [`Kim: ${esc(link.relation)}`] : []),
        `Telefon: ${esc(phone)}`,
        ...(student.user.nameLocked ? [] : ["O'quvchi ismini hali yozmagan (Telegram'dagi nomi)"]),
        `Guruh: ${group ? esc(group) : "yo'q"}`,
        ...warnings,
        "\nRaqamga qo'ng'iroq qilib tekshiring.",
      ].join("\n"),
      this.reviewKeyboard(link.id),
    );
    return { status: "created", studentName: fullName(student.user) };
  }

  // ---------------- O'quvchi ----------------

  async myParents(userId: string) {
    const sp = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: { parents: { include: { parent: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "asc" } } },
    });
    if (!sp) throw new NotFoundException();
    const start = `p_${sp.parentLinkCode}`;
    const botUrl = `https://t.me/${this.env.BOT_USERNAME}?start=${start}`;
    const text = "Assalomu alaykum! Ona tili darslarimdagi davomatim haqida xabar olib turishingiz uchun shu havolani bosing:";
    return {
      inviteUrl: botUrl,
      shareUrl: `https://t.me/share/url?url=${encodeURIComponent(botUrl)}&text=${encodeURIComponent(text)}`,
      maxParents: MAX_PARENTS,
      parents: sp.parents.map((l) => ({ id: l.id, name: fullName(l.parent), status: l.status, relation: l.relation, rejectReason: l.rejectReason })),
    };
  }

  // ---------------- Ota-ona ----------------

  async myChildren(userId: string): Promise<ChildView[]> {
    const links = await this.prisma.parentLink.findMany({
      where: { parentId: userId, status: { in: ["PENDING", "APPROVED"] } },
      include: {
        student: {
          include: {
            user: { select: { firstName: true, lastName: true } },
            group: { select: { name: true } },
            attendance: { orderBy: { date: "desc" }, take: 14, select: { date: true, status: true } },
          },
        },
      },
    });
    return links.map((l) => ({
      name: fullName(l.student.user),
      status: l.status,
      groupName: l.student.group?.name ?? null,
      // Tasdiqlanmagan ota-onaga davomat ko'rsatilmaydi
      recent: l.status === "APPROVED" ? l.student.attendance.map((a) => ({ date: a.date.toISOString().slice(0, 10), status: a.status })) : [],
    }));
  }

  // ---------------- Admin ----------------

  async list(status?: "PENDING" | "APPROVED" | "REJECTED"): Promise<AdminParentLink[]> {
    const rows = await this.prisma.parentLink.findMany({
      where: status ? { status } : {},
      include: linkInclude,
      orderBy: [{ createdAt: status === "PENDING" ? "asc" : "desc" }],
      take: 300,
    });
    return rows.map((l) => this.toAdmin(l));
  }

  async isAwaitingReview(id: string) {
    return (await this.prisma.parentLink.count({ where: { id, status: "PENDING" } })) > 0;
  }

  reviewKeyboard(id: string): Keyboard {
    return [
      [
        { text: "✅ Tasdiqlash", data: `pl:a:${id}` },
        { text: "❌ Rad etish", data: `c|pl:r:${id}` },
      ],
    ];
  }

  async approve(actorId: string, id: string) {
    const l = await this.prisma.parentLink.findUnique({ where: { id }, include: linkInclude });
    if (!l) throw new NotFoundException("So'rov topilmadi");
    if (l.status === "APPROVED") throw new ConflictException("Allaqachon tasdiqlangan");
    // Rad etilganni qayta tasdiqlash: o'quvchining faol ota-onalari chegarasi tekshiriladi
    if (l.status === "REJECTED") {
      const active = await this.prisma.parentLink.count({ where: { studentId: l.studentId, status: { in: ["PENDING", "APPROVED"] }, id: { not: id } } });
      if (active >= MAX_PARENTS) throw new ConflictException(`O'quvchida allaqachon ${MAX_PARENTS} ta ota-ona ulangan`);
    }
    await this.prisma.parentLink.update({ where: { id }, data: { status: "APPROVED", reviewedById: actorId, reviewedAt: new Date(), rejectReason: null } });
    await this.prisma.auditLog.create({ data: { actorId, action: "parent.approve", entity: "ParentLink", entityId: id } });
    await this.notify.send(
      l.parent.telegramId,
      `✅ Siz <b>${esc(fullName(l.student.user))}</b>ning ota-onasi sifatida tasdiqlandingiz.\n\nEndi farzandingizning davomati haqidagi xabarlar shu yerga keladi.`,
    );
    await this.notify.send(l.student.user.telegramId, `✅ Ota-onangiz <b>${esc(fullName(l.parent))}</b> tasdiqlandi.`);
    return { ok: true };
  }

  async reject(actorId: string, id: string, reason: string) {
    const r = reason.trim();
    if (!r) throw new BadRequestException("Rad etish sababini yozing");
    const l = await this.prisma.parentLink.findUnique({ where: { id }, include: linkInclude });
    if (!l) throw new NotFoundException("So'rov topilmadi");
    if (l.status === "REJECTED") throw new ConflictException("Allaqachon rad etilgan");
    await this.prisma.parentLink.update({
      where: { id },
      data: { status: "REJECTED", reviewedById: actorId, reviewedAt: new Date(), rejectReason: r.slice(0, 300) },
    });
    await this.prisma.auditLog.create({ data: { actorId, action: "parent.reject", entity: "ParentLink", entityId: id, meta: { reason: r } } });
    await this.notify.send(
      l.student.user.telegramId,
      `❌ Ota-ona ulanish so'rovi rad etildi.\nSabab: ${esc(r)}\n\nIlovani ochib, haqiqiy ota-onangizni qayta ulang.`,
    );
    await this.notify.send(l.parent.telegramId, `❌ <b>${esc(fullName(l.student.user))}</b>ning ota-onasi sifatida ulanish so'rovingiz rad etildi.\nSabab: ${esc(r)}\n\nSavollar bo'lsa, ustozga murojaat qiling.`);
    return { ok: true };
  }

  /** Ulanishni butunlay o'chirish (masalan, xato yoki begona odam). Ota-ona havolani qayta bosib so'rov yuborishi mumkin */
  async remove(actorId: string, id: string) {
    const l = await this.prisma.parentLink.findUnique({ where: { id }, include: linkInclude });
    if (!l) throw new NotFoundException("Ulanish topilmadi");
    await this.prisma.parentLink.delete({ where: { id } });
    await this.prisma.auditLog.create({ data: { actorId, action: "parent.delete", entity: "ParentLink", entityId: id, meta: { parent: fullName(l.parent), student: fullName(l.student.user) } } });
    return { ok: true };
  }

  private toAdmin(l: Prisma.ParentLinkGetPayload<{ include: typeof linkInclude }>): AdminParentLink {
    return {
      id: l.id,
      status: l.status,
      relation: l.relation,
      phone: l.phone,
      flags: l.flags,
      createdAt: l.createdAt.toISOString(),
      reviewedAt: l.reviewedAt?.toISOString() ?? null,
      reviewedBy: l.reviewedBy ? fullName(l.reviewedBy) : null,
      rejectReason: l.rejectReason,
      parent: { id: l.parent.id, name: fullName(l.parent), username: l.parent.username, telegramId: String(l.parent.telegramId) },
      student: {
        userId: l.student.user.id,
        name: fullName(l.student.user),
        username: l.student.user.username,
        phone: l.student.user.phone,
        // Ustoz qo'lda kiritgan, hali botga kirmagan o'quvchida null
        telegramId: l.student.user.telegramId === null ? null : String(l.student.user.telegramId),
        groupName: l.student.group?.name ?? null,
      },
    };
  }
}
