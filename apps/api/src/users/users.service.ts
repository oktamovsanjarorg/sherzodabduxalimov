import { Injectable, NotFoundException } from "@nestjs/common";
import type { Me } from "@onatili/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        student: {
          select: {
            parents: { where: { status: { in: ["PENDING", "APPROVED"] } }, select: { status: true } },
            group: { select: { name: true, isActive: true } },
          },
        },
        subscriptions: {
          where: { status: "ACTIVE", endsAt: { gt: new Date() } },
          orderBy: { endsAt: "desc" },
          take: 1,
          include: { plan: true },
        },
      },
    });
    if (!user) throw new NotFoundException("Foydalanuvchi topilmadi");
    const sub = user.subscriptions[0];
    const links = user.student?.parents ?? [];
    const parentStatus = links.some((l) => l.status === "APPROVED") ? "APPROVED" : links.length ? "PENDING" : "NONE";
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
    };
  }
}
