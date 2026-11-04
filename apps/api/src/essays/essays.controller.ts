import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, Res } from "@nestjs/common";
import { createEssayInput, teacherEssayReviewInput } from "@onatili/shared";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { parse } from "../admin/zod";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { EssaysService } from "./essays.service";

/** O'quvchi: esse yozish, varoq rasmlari, natija */
@Controller("essays")
export class EssaysController {
  constructor(private readonly svc: EssaysService) {}

  @Get("config") config(@CurrentUser() u: JwtUser) {
    return this.svc.config(u.sub);
  }

  @Get() list(@CurrentUser() u: JwtUser) {
    return this.svc.list(u.sub);
  }

  /** Xodimlar ham sinab ko'ra oladi (ustoz tekshiruvida to'lovsiz) */
  @Post()
  create(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    return this.svc.create(u.sub, parse(createEssayInput, b));
  }

  @Get(":id") detail(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.detail(u.sub, id);
  }

  /** Tana: xom rasm baytlari */
  @Post(":id/pages") addPage(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() body: unknown) {
    return this.svc.addPage(u.sub, id, body);
  }

  @Delete(":id/pages/:n") removePage(@CurrentUser() u: JwtUser, @Param("id") id: string, @Param("n", ParseIntPipe) n: number) {
    return this.svc.removePage(u.sub, id, n);
  }

  @Get(":id/pages/:n") async page(@CurrentUser() u: JwtUser, @Param("id") id: string, @Param("n", ParseIntPipe) n: number, @Res() res: FastifyReply) {
    const r = await this.svc.page(u, id, n);
    return res.header("Content-Type", r.mime).header("Cache-Control", "private, no-store").send(r.data);
  }

  @Post(":id/finish") @HttpCode(200) finish(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.finish(u.sub, id);
  }

  @Post(":id/retry") @HttpCode(200) retry(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.retry(u.sub, id);
  }

  @Delete(":id") remove(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.remove(u.sub, id);
  }
}

/** Ustoz va yordamchi: qo'lyozma esselarni baholash */
@Roles("TEACHER", "ASSISTANT")
@Controller("admin/hw-essays")
export class AdminHwEssaysController {
  constructor(private readonly svc: EssaysService) {}

  @Get() list(@Query("status") status?: string) {
    return this.svc.adminList(status === "reviewed" ? "reviewed" : "pending");
  }

  @Post(":id/review") @HttpCode(200) review(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.review(u.sub, id, parse(teacherEssayReviewInput, b));
  }
}

/** Faqat ega: ustoz tekshiruvi narxi */
@Roles("TEACHER")
@Controller("admin/essay-settings")
export class AdminEssaySettingsController {
  constructor(private readonly svc: EssaysService) {}

  @Get() async get() {
    return { priceUzs: await this.svc.teacherPrice() };
  }

  @Put() set(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    const d = parse(z.object({ priceUzs: z.coerce.number().int().min(0).max(10_000_000).nullable() }), b);
    return this.svc.setTeacherPrice(u.sub, d.priceUzs || null);
  }
}
