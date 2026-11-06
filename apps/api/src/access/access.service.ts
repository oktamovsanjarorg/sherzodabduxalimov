import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@onatili/db";
import { ERROR_CODES, STAFF_ROLES, currentMonth, type RoleName } from "@onatili/shared";
import type { JwtUser } from "../auth/decorators";
import { PrismaService } from "../prisma/prisma.service";

export type TrialKind = "LESSON" | "TOPIC_TEST" | "MOCK" | "ESSAY";

/**
 * To'liq foydalanish: ustoz tasdiqlagan, ota-onasi tasdiqlangan va to'lovi bor o'quvchi.
 * Ustoz qo'lda "bepul ochiq" qilgan o'quvchi ham to'liq ishlaydi (masalan, ota-onasida Telegram yo'q).
 */
export const isFullAccess = (s: { accessMode?: string; acceptedAt?: Date | null; approvedParents: number; paid: boolean } | null) =>
  !!s && (s.accessMode === "FREE" || (!!s.acceptedAt && s.approvedParents > 0 && s.paid));

/** Pullik kontentga kirish huquqini hal qiladi. Qaror faqat backend'da qabul qilinadi. */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  isStaff(role: RoleName) {
    return STAFF_ROLES.includes(role);
  }

  /**
   * Obuna tugagach yana 1 kun ochiq turadi: chek yuborilib, tasdiqlanguncha o'quvchi darsdan uzilmasin.
   * (Ilovada sana haqiqiy tugash kuni bilan ko'rsatiladi.)
   */
  static readonly GRACE_MS = 86_400_000;

  async hasActiveSubscription(userId: string, now = new Date()): Promise<boolean> {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: new Date(now.getTime() - AccessService.GRACE_MS) } },
      select: { id: true },
    });
    return sub !== null;
  }

  /** Offline o'quvchi: faol guruhga a'zo ekan, hamma narsa ochiq (to'lov darsda olinadi) */
  async activeGroup(userId: string): Promise<{ id: string; name: string } | null> {
    const p = await this.prisma.studentProfile.findUnique({ where: { userId }, select: { group: { select: { id: true, name: true, isActive: true } } } });
    return p?.group?.isActive ? { id: p.group.id, name: p.group.name } : null;
  }

  /** Bitta so'rov ichida qayta-qayta ishlatish uchun: "pullik kontent ochiqmi?" */
  async canAccessPaid(user: JwtUser): Promise<boolean> {
    if (this.isStaff(user.role)) return true;
    // Ustoz qo'lda belgilagan rejim: bepul ochiq yoki yopiq (obuna/guruhdan qat'i nazar)
    const mode = (await this.prisma.studentProfile.findUnique({ where: { userId: user.sub }, select: { accessMode: true } }))?.accessMode;
    if (mode === "FREE") return true;
    if (mode === "CLOSED") return false;
    const [sub, group] = await Promise.all([this.hasActiveSubscription(user.sub), this.activeGroup(user.sub)]);
    return sub || group !== null;
  }

  /** To'lov: faol obuna yoki shu oy uchun belgilangan offline to'lov. Cheklangan rejim shu holatlarga qarab hisoblanadi */
  async trialState(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        student: {
          select: {
            accessMode: true,
            acceptedAt: true,
            offlinePayments: { where: { month: currentMonth() }, select: { id: true } },
            _count: { select: { parents: { where: { status: "APPROVED" } } } },
          },
        },
      },
    });
    if (!u || this.isStaff(u.role)) return { limited: false, accepted: true, paid: true };
    const paid = !!u.student?.offlinePayments.length || (await this.hasActiveSubscription(userId));
    const limited = !isFullAccess(u.student && { ...u.student, approvedParents: u.student._count.parents, paid });
    return { limited, accepted: !!u.student?.acceptedAt, paid };
  }

  /**
   * Cheklangan rejimda bo'limdan bir marta foydalanishni yozadi, ikkinchisida rad etadi.
   * refId berilsa (dars), o'sha narsani qayta ochish mumkin. Asosiy kalit (userId, kind) parallel so'rovlarni ham to'sadi.
   */
  async useTrial(userId: string, kind: TrialKind, refId?: string) {
    if (!(await this.trialState(userId)).limited) return;
    try {
      await this.prisma.trialUse.create({ data: { userId, kind, refId } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      const used = await this.prisma.trialUse.findUnique({ where: { userId_kind: { userId, kind } }, select: { refId: true } });
      if (refId && used?.refId === refId) return;
      throw new ForbiddenException({
        code: ERROR_CODES.TRIAL_LIMIT,
        message: "Cheklangan rejimda har bo'limdan bir marta foydalanish mumkin. To'liq ochilishi uchun ustoz tasdig'i, ota-ona tasdig'i va to'lov kerak.",
      });
    }
  }

  assertAccess(isFree: boolean, paidOpen: boolean) {
    if (!isFree && !paidOpen) {
      throw new ForbiddenException({
        code: ERROR_CODES.SUBSCRIPTION_REQUIRED,
        message: "Bu kontent obunachilar uchun",
      });
    }
  }
}
