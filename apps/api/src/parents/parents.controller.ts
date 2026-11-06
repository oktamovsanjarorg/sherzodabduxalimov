import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { parse } from "../admin/zod";
import { CurrentUser, Public, Roles, type JwtUser } from "../auth/decorators";
import { InternalGuard } from "../staff/internal.guard";
import { ParentsService } from "./parents.service";

const from = z.object({ id: z.number().int().positive(), username: z.string().nullish(), first_name: z.string().min(1), last_name: z.string().nullish() });
const contact = z.object({ phone_number: z.string().min(5).max(20), user_id: z.number().int().optional() });

@Controller()
export class ParentsController {
  constructor(private readonly parents: ParentsService) {}

  // ---- bot (ichki) ----
  @Public()
  @UseGuards(InternalGuard)
  @Post("internal/user-phone")
  @HttpCode(200)
  userPhone(@Body() b: unknown) {
    const d = parse(z.object({ from, contact }), b);
    return this.parents.saveOwnPhone(d.from, d.contact);
  }

  @Public()
  @UseGuards(InternalGuard)
  @Post("internal/parent-link")
  @HttpCode(200)
  parentLink(@Body() b: unknown) {
    const d = parse(z.object({ code: z.string().regex(/^[0-9A-Fa-f]{8}$/), from, contact, relation: z.string().max(30).nullish() }), b);
    return this.parents.linkParent(d.code, d.from, d.contact, d.relation);
  }

  /** Ota-ona havolani ochdi: kod kontakt kelguncha bazada saqlanadi (bot qayta ishga tushsa ham) */
  @Public()
  @UseGuards(InternalGuard)
  @Post("internal/parent-pending")
  @HttpCode(200)
  parentPending(@Body() b: unknown) {
    const d = parse(z.object({ from, code: z.string().regex(/^[0-9A-Fa-f]{8}$/) }), b);
    return this.parents.setPending(d.from, d.code);
  }

  /** Kontakt keldi: kutilayotgan ota-ona kodi bo'lsa, qaytaradi va o'chiradi */
  @Public()
  @UseGuards(InternalGuard)
  @Post("internal/parent-pending/take")
  @HttpCode(200)
  takePending(@Body() b: unknown) {
    const d = parse(z.object({ telegramId: z.number().int().positive() }), b);
    return this.parents.takePending(d.telegramId);
  }

  // ---- o'quvchi va ota-ona ----
  @Get("me/parents")
  mine(@CurrentUser() u: JwtUser) {
    return this.parents.myParents(u.sub);
  }

  @Get("me/children")
  children(@CurrentUser() u: JwtUser) {
    return this.parents.myChildren(u.sub);
  }

  // ---- admin ----
  @Roles("TEACHER", "ASSISTANT")
  @Get("admin/parent-links")
  list(@Query("status") status?: string) {
    const s = status === "PENDING" || status === "APPROVED" || status === "REJECTED" ? status : undefined;
    return this.parents.list(s);
  }

  @Roles("TEACHER", "ASSISTANT")
  @Post("admin/parent-links/:id/approve")
  @HttpCode(200)
  approve(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.parents.approve(u.sub, id);
  }

  @Roles("TEACHER", "ASSISTANT")
  @Post("admin/parent-links/:id/reject")
  @HttpCode(200)
  reject(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: { reason?: unknown }) {
    if (typeof b?.reason !== "string") throw new BadRequestException("Sabab kerak");
    return this.parents.reject(u.sub, id, b.reason);
  }

  @Roles("TEACHER", "ASSISTANT")
  @Delete("admin/parent-links/:id")
  removeLink(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.parents.remove(u.sub, id);
  }
}
