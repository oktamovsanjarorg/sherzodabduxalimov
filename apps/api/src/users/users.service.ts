import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { STAFF_ROLES, type Me, type StudentNameInput } from "@onatili/shared";
import { AccessService } from "../access/access.service";
import { PrismaService } from "../prisma/prisma.service";

/** Ota-ona havolasi 24 soat amal qiladi */
export const PARENT_INVITE_TTL_MS = 24 * 3600 * 1000;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async me(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        student: {
          select: {
            parents: { where: { status: { in: ["PENDING", "APPROVED"] } }, select: { status: true } },
            group: { select: { name: true, isActive: true } },
            accessMode: true,
          },
        },
        subscriptions: {
          where: { status: "ACTIVE", endsAt: { gt: new Date() } },
          orderBy: { endsAt: "desc" },
          take: 1,
          include: { plan: true },
        },
        trialUses: { select: { kind: true } },
      },
    });
    if (!user) throw new NotFoundException("Foydalanuvchi topilmadi");
    const sub = user.subscriptions[0];
    const links = user.student?.parents ?? [];
    const parentStatus = links.some((l) => l.status === "APPROVED") ? "APPROVED" : links.length ? "PENDING" : "NONE";
    const staff = STAFF_ROLES.includes(user.role);
    const trial = await this.access.trialState(user.id);
    const invite = staff || user.telegramId === null ? null : await this.prisma.pendingParent.findUnique({ where: { telegramId: user.telegramId } });
    const pendingParentInvite = !!invite && Date.now() - invite.createdAt.getTime() < PARENT_INVITE_TTL_MS;
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      photoUrl: user.photoUrl,
      role: user.role,
      phone: user.phone,
      parentStatus,
      subscription: sub ? { planName: sub.plan.name, endsAt: sub.endsAt.toISOString() } : null,
      offlineGroup: user.student?.group?.isActive ? { name: user.student.group.name } : null,
      accessMode: user.student?.accessMode ?? "AUTO",
      trial: { ...trial, used: user.trialUses.map((t) => t.kind) },
      pendingParentInvite,
      // Ota-ona havolasi ochilgan bo'lsa ham: raqam sahifasini o'tkazib yuborgan o'quvchi ismsiz kirib ketmasin
      needsName: user.role === "STUDENT" && user.telegramId !== null && !user.nameLocked,
    };
  }

  byTelegramId(telegramId: number) {
    return this.prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true, role: true, isBlocked: true, nameLocked: true, firstName: true, lastName: true },
    });
  }

  /** O'quvchi haqiqiy ismini bir marta yozadi. Keyin faqat ustoz o'zgartiradi */
  async setOwnName(userId: string, name: StudentNameInput): Promise<Me> {
    const { count } = await this.prisma.user.updateMany({ where: { id: userId, role: "STUDENT", nameLocked: false }, data: { ...name, nameLocked: true } });
    if (!count) throw new ConflictException("Ismni faqat ustoz o'zgartira oladi");
    return this.me(userId);
  }
}
