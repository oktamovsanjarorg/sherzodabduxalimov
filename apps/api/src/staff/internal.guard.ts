import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { internalKey } from "@onatili/shared/server";
import { timingSafeEqual } from "node:crypto";
import { ENV, type Env } from "../config/env";

/** Faqat bizning bot chaqira oladigan ichki endpoint'lar uchun (x-internal-key sarlavhasi) */
@Injectable()
export class InternalGuard implements CanActivate {
  private readonly key: Buffer;
  constructor(@Inject(ENV) env: Env) {
    this.key = Buffer.from(internalKey(env.BOT_TOKEN));
  }
  canActivate(ctx: ExecutionContext) {
    const given = Buffer.from(String(ctx.switchToHttp().getRequest().headers["x-internal-key"] ?? ""));
    if (given.length !== this.key.length || !timingSafeEqual(given, this.key)) throw new UnauthorizedException();
    return true;
  }
}
