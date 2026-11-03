import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
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
  add(@CurrentUser() user: JwtUser, @Body() body: { username?: unknown }) {
    if (typeof body?.username !== "string") throw new BadRequestException("username kerak");
    return this.staff.addAssistant(user.sub, body.username);
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
