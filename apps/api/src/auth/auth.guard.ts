import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { RoleName } from "@onatili/shared";
import { IS_PUBLIC, JwtUser, ROLES_KEY } from "./decorators";

/** Global guard: JWT tekshiradi, keyin @Roles() bo'yicha ruxsatni tekshiradi. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector) {}

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
    if (roles?.length && !roles.includes(payload.role)) {
      throw new ForbiddenException("Ruxsat yo'q");
    }
    return true;
  }
}
