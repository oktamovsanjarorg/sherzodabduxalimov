import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { RoleName } from "@onatili/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ERROR_CODES } from "@onatili/shared";
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

    // Har bir so'rovda hisob bazadan tekshiriladi: o'chirilgan yoki bloklangan foydalanuvchining tokeni
    // (o'quvchida 1 soat, xodimda 12 soat) darhol kuchini yo'qotadi; rol ham bazadagisi olinadi.
    const db = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { role: true, isBlocked: true, blockedReason: true } });
    if (!db) throw new UnauthorizedException("Hisob topilmadi");
    if (db.isBlocked) throw new UnauthorizedException({ code: ERROR_CODES.BLOCKED, message: db.blockedReason ? `Hisob bloklangan: ${db.blockedReason}` : "Hisob bloklangan" });
    req.user = { ...payload, role: db.role };

    const roles = this.reflector.getAllAndOverride<RoleName[] | undefined>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(db.role)) throw new ForbiddenException("Ruxsat yo'q");
    return true;
  }
}
