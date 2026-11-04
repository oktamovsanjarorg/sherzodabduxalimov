import { ForbiddenException, Injectable } from "@nestjs/common";
import { ERROR_CODES, STAFF_ROLES, type RoleName } from "@onatili/shared";
import type { JwtUser } from "../auth/decorators";
import { PrismaService } from "../prisma/prisma.service";

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

  assertAccess(isFree: boolean, paidOpen: boolean) {
    if (!isFree && !paidOpen) {
      throw new ForbiddenException({
        code: ERROR_CODES.SUBSCRIPTION_REQUIRED,
        message: "Bu kontent obunachilar uchun",
      });
    }
  }
}
