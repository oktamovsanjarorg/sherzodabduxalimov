import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ERROR_CODES } from "@onatili/shared";
import { InitDataError, validateInitData, type AuthResponse } from "@onatili/shared/server";
import { ENV, type Env } from "../config/env";
import { StaffService } from "../staff/staff.service";
import { UsersService } from "../users/users.service";

@Injectable()
export class AuthService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly staff: StaffService,
  ) {}

  async loginWithTelegram(initData: string): Promise<AuthResponse> {
    let tg;
    try {
      tg = validateInitData(initData, this.env.BOT_TOKEN, this.env.INIT_DATA_MAX_AGE_SEC).user;
    } catch (e) {
      if (e instanceof InitDataError) throw new UnauthorizedException(e.message);
      throw e;
    }

    const { user, created } = await this.staff.upsertTelegramUserEx(tg);
    if (user.isBlocked)
      throw new UnauthorizedException({ code: ERROR_CODES.BLOCKED, message: user.blockedReason ? `Hisob bloklangan: ${user.blockedReason}` : "Hisob bloklangan" });
    if (created && user.role === "STUDENT") await this.staff.alertNewStudent(user);

    const token = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { token, expiresIn: this.env.JWT_TTL, user: await this.users.me(user.id) };
  }
}
