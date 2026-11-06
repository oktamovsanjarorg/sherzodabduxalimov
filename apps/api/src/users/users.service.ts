import { Injectable, NotFoundException } from "@nestjs/common";
import { STAFF_ROLES, type Me } from "@onatili/shared";
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
      pendingParentInvite: !!invite && Date.now() - invite.createdAt.getTime() < PARENT_INVITE_TTL_MS,
    };
  }
}
