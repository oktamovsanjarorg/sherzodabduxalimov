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
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      photoUrl: user.photoUrl,
      role: user.role,
      subscription: sub ? { planName: sub.plan.name, endsAt: sub.endsAt.toISOString() } : null,
    };
  }
}
