import { BadRequestException, Body, ForbiddenException, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { staffAddBody, staffPermissionsBody } from "@onatili/shared";
import { z } from "zod";
import { CurrentUser, Public, Roles, type JwtUser } from "../auth/decorators";
import { InternalGuard } from "./internal.guard";
import { StaffService } from "./staff.service";

const loginLinkBody = z.object({
  id: z.number().int().positive(),
  username: z.string().nullish(),
  first_name: z.string().min(1),
  last_name: z.string().nullish(),
});

@Controller()
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  /** Bot chaqiradi: /admin buyrug'i */
  @Public()
  @UseGuards(InternalGuard)
  @Post("internal/admin-login-link")
  @HttpCode(200)
  async loginLink(@Body() body: unknown) {
    const p = loginLinkBody.safeParse(body);
    if (!p.success) throw new BadRequestException();
    return { url: await this.staff.createLoginLink(p.data) };
  }

  /** Bot chaqiradi: oddiy /start */
  @Public()
  @UseGuards(InternalGuard)
  @Post("internal/visit")
  @HttpCode(200)
  visit(@Body() body: unknown) {
    const p = loginLinkBody.safeParse(body);
    if (!p.success) throw new BadRequestException();
    return this.staff.recordVisit(p.data);
  }

  /** Mini App chaqiradi: xodim uchun bir martalik admin panel havolasi */
  @Roles("TEACHER", "ASSISTANT")
  @Post("me/admin-link")
  @HttpCode(200)
  async myLoginLink(@CurrentUser() user: JwtUser) {
    const url = await this.staff.loginLinkFor(user.sub);
    if (!url) throw new ForbiddenException("Admin panel faqat ustoz va yordamchilar uchun");
    return { url };
  }

  @Public()
  @Post("auth/admin-link")
  @HttpCode(200)
  consume(@Body() body: { token?: unknown }) {
    if (typeof body?.token !== "string" || body.token.length < 20) throw new BadRequestException("Token kerak");
    return this.staff.consumeLoginToken(body.token);
  }

  @Roles("TEACHER")
  @Get("admin/staff")
  list() {
    return this.staff.list();
  }

  @Roles("TEACHER")
  @Post("admin/staff")
  add(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const p = staffAddBody.safeParse(body);
    if (!p.success) throw new BadRequestException("username va ruxsatlar kerak");
    return this.staff.addAssistant(user.sub, p.data.username, p.data.permissions);
  }

  @Roles("TEACHER")
  @Patch("admin/staff/:id/permissions")
  setPermissions(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: unknown) {
    const p = staffPermissionsBody.safeParse(body);
    if (!p.success) throw new BadRequestException("Ruxsatlar noto'g'ri");
    return this.staff.setPermissions(user.sub, id, p.data.permissions);
  }

  @Roles("TEACHER")
  @Patch("admin/invites/:username/permissions")
  setInvitePermissions(@CurrentUser() user: JwtUser, @Param("username") username: string, @Body() body: unknown) {
    const p = staffPermissionsBody.safeParse(body);
    if (!p.success) throw new BadRequestException("Ruxsatlar noto'g'ri");
    return this.staff.setInvitePermissions(user.sub, username, p.data.permissions);
  }

  @Roles("TEACHER")
  @Delete("admin/staff/:id")
  remove(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.staff.removeStaff(user.sub, id);
  }

  @Roles("TEACHER")
  @Delete("admin/invites/:username")
  removeInvite(@CurrentUser() user: JwtUser, @Param("username") username: string) {
    return this.staff.removeInvite(user.sub, username);
  }
}
