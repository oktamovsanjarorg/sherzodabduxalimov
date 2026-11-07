import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { studentAccessInput, studentBlockInput, studentBulkInput, studentCreateInput, studentUpdateInput } from "@onatili/shared";
import { z } from "zod";
import { parse } from "../admin/zod";
import { CurrentUser, Public, Roles, type JwtUser } from "../auth/decorators";
import { InternalGuard } from "../staff/internal.guard";
import { StudentsService } from "./students.service";

/** Ustoz va yordamchi: o'quvchilar ro'yxati va kartasi. To'lov ma'lumotlari faqat egaga */
@Roles("TEACHER", "ASSISTANT")
@Controller("admin")
export class StudentsController {
  constructor(private readonly svc: StudentsService) {}

  @Get("roster") roster(@CurrentUser() u: JwtUser, @Query("groupId") groupId?: string, @Query("q") q?: string) {
    return this.svc.roster({ groupId, q }, u.role === "TEACHER");
  }

  /** O'quvchilar → Hammasi: botga kirgan hamma, umumiy holati bilan */
  @Get("users") users(@CurrentUser() u: JwtUser, @Query("q") q?: string) {
    return this.svc.allUsers(q, u.role === "TEACHER");
  }

  /** Botdan o'zi kirgan, hali ko'rib chiqilmagan o'quvchilar */
  @Get("students/new") newcomers() {
    return this.svc.newcomers();
  }

  /** "Mening o'quvchim": guruhga qo'shish (yoki online qoldirish) */
  @Post("students/:id/accept") @HttpCode(200) accept(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    const d = parse(z.object({ groupId: z.string().min(1).nullable().optional() }), b ?? {});
    return this.svc.accept(u.sub, id, d.groupId ?? null);
  }

  /** Qaytarib bo'lmaydi: faqat ega */
  @Roles("TEACHER")
  @Post("students/:id/link") @HttpCode(200) link(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.linkToPlaceholder(u.sub, id, parse(z.object({ placeholderStudentId: z.string().min(1) }), b).placeholderStudentId);
  }

  @Post("students") create(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    return this.svc.create(u.sub, parse(studentCreateInput, b));
  }

  @Post("students/bulk") @HttpCode(200) bulk(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    const d = parse(studentBulkInput, b);
    return this.svc.bulkCreate(u.sub, d.groupId, d.text);
  }

  @Get("students/:id") detail(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.detail(id, u.role === "TEACHER");
  }

  @Patch("students/:id") update(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.update(u.sub, id, parse(studentUpdateInput, b));
  }

  @Delete("students/:id") remove(@CurrentUser() u: JwtUser, @Param("id") id: string, @Query("force") force?: string) {
    return this.svc.remove(u.sub, id, { force: force === "1", isTeacher: u.role === "TEACHER" });
  }

  /** Kirish rejimi va bloklash: faqat ega */
  @Roles("TEACHER")
  @Patch("students/:id/access") access(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.setAccess(u.sub, id, parse(studentAccessInput, b).mode);
  }

  @Roles("TEACHER")
  @Post("students/:id/block") @HttpCode(200) block(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    const d = parse(studentBlockInput, b);
    return this.svc.setBlocked(u.sub, id, d.blocked, d.reason);
  }

  @Post("students/:id/invite") @HttpCode(200) invite(@Param("id") id: string) {
    return this.svc.resetInvite(id);
  }
}

/** Bot (ichki): o'quvchi shaxsiy havolani bosdi */
@Controller("internal")
export class StudentsInternalController {
  constructor(private readonly svc: StudentsService) {}

  @Public()
  @UseGuards(InternalGuard)
  @Post("claim-student")
  @HttpCode(200)
  claim(@Body() b: unknown) {
    const d = parse(
      z.object({
        code: z.string().regex(/^[A-Za-z0-9_-]{6,16}$/),
        from: z.object({ id: z.number().int().positive(), username: z.string().nullish(), first_name: z.string().min(1), last_name: z.string().nullish() }),
      }),
      b,
    );
    return this.svc.claimByInvite(d.code, d.from);
  }
}
