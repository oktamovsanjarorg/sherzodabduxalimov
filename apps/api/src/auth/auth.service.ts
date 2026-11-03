import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomBytes } from "node:crypto";
import { InitDataError, validateInitData, type AuthResponse } from "@onatili/shared/server";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";

@Injectable()
export class AuthService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async loginWithTelegram(initData: string): Promise<AuthResponse> {
    let tg;
    try {
      tg = validateInitData(initData, this.env.BOT_TOKEN, this.env.INIT_DATA_MAX_AGE_SEC).user;
    } catch (e) {
      if (e instanceof InitDataError) throw new UnauthorizedException(e.message);
      throw e;
    }

    const profile = {
      username: tg.username ?? null,
      firstName: tg.first_name,
      lastName: tg.last_name ?? null,
      photoUrl: tg.photo_url ?? null,
      languageCode: tg.language_code ?? null,
    };
    const user = await this.prisma.user.upsert({
      where: { telegramId: BigInt(tg.id) },
      update: profile,
      create: {
        telegramId: BigInt(tg.id),
        ...profile,
        student: { create: { parentLinkCode: randomBytes(4).toString("hex").toUpperCase() } },
      },
    });
    if (user.isBlocked) throw new UnauthorizedException("Hisob bloklangan");

    const token = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { token, expiresIn: this.env.JWT_TTL, user: await this.users.me(user.id) };
  }
}
