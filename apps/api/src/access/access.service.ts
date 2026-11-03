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

  async hasActiveSubscription(userId: string, now = new Date()): Promise<boolean> {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true },
    });
    return sub !== null;
  }

  /** Bitta so'rov ichida qayta-qayta ishlatish uchun: "pullik kontent ochiqmi?" */
  async canAccessPaid(user: JwtUser): Promise<boolean> {
    return this.isStaff(user.role) || (await this.hasActiveSubscription(user.sub));
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
