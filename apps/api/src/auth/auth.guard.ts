import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { RoleName } from "@onatili/shared";
import { PrismaService } from "../prisma/prisma.service";
import { IS_PUBLIC, JwtUser, ROLES_KEY } from "./decorators";

/** Global guard: JWT tekshiradi, keyin @Roles() bo'yicha ruxsatni tekshiradi. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("Token yo'q");

    let payload: JwtUser;
    try {
      payload = await this.jwt.verifyAsync<JwtUser>(token);
    } catch {
      throw new UnauthorizedException("Token yaroqsiz");
    }
    req.user = payload;

    const roles = this.reflector.getAllAndOverride<RoleName[] | undefined>(ROLES_KEY, targets);
    if (roles?.length) {
      // Rol talab qilinadigan (admin) so'rovlarda rol bazadan qayta tekshiriladi: xodim olib tashlansa
      // yoki bloklansa, uning 12 soatlik tokeni darhol kuchini yo'qotadi.
      const db = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { role: true, isBlocked: true } });
      if (!db || db.isBlocked) throw new UnauthorizedException("Hisob faol emas");
      if (!roles.includes(db.role)) throw new ForbiddenException("Ruxsat yo'q");
      req.user = { ...payload, role: db.role };
    }
    return true;
  }
}
