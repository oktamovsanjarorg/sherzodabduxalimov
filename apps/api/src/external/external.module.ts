import { Body, Controller, Delete, Get, Global, HttpCode, Module, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { parse } from "../admin/zod";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { ExternalService } from "./external.service";

// CSV: 300 o'quvchi x 200 savol ham 200 KB dan oshmaydi
const csvBody = z.object({ fileName: z.string().max(200), title: z.string().max(200).nullish().default(null), content: z.string().min(1).max(2_000_000) });

/** Offline test natijalarini import qilish va tahlil: ustoz va yordamchi */
@Roles("TEACHER", "ASSISTANT")
@Controller("admin/external-tests")
export class AdminExternalController {
  constructor(private readonly svc: ExternalService) {}

  @Get() async list() {
    return { tests: await this.svc.list() };
  }

  @Get("ranking") ranking(@Query("days") days?: string) {
    const n = Number(days);
    return this.svc.ranking([30, 90, 365].includes(n) ? n : 0);
  }

  @Post("csv/preview") @HttpCode(200) csvPreview(@Body() b: unknown) {
    return this.svc.preview(this.svc.fromCsv(parse(csvBody, b)));
  }

  @Post("csv/import") @HttpCode(200) csvImport(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    return this.svc.save(u.sub, this.svc.fromCsv(parse(csvBody, b)));
  }

  @Get(":id") detail(@Param("id") id: string) {
    return this.svc.detail(id);
  }

  @Patch(":id/results/:rid") link(@CurrentUser() u: JwtUser, @Param("id") id: string, @Param("rid") rid: string, @Body() b: unknown) {
    return this.svc.link(u.sub, id, rid, parse(z.object({ studentId: z.string().max(40).nullable() }), b).studentId);
  }

  @Post(":id/notify") @HttpCode(200) notify(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.sendNotices(u.sub, id);
  }

  @Delete(":id") remove(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.remove(u.sub, id);
  }
}

/** O'quvchi: o'z offline test natijalari */
@Controller("me/external")
export class MyExternalController {
  constructor(private readonly svc: ExternalService) {}

  @Get() mine(@CurrentUser() u: JwtUser) {
    return this.svc.mine(u.sub);
  }

  @Get(":id") one(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.myDetail(u.sub, id);
  }
}

// Global: o'quvchi sahifasi va ota-ona ko'rinishi ham natijalarni oladi
@Global()
@Module({ controllers: [AdminExternalController, MyExternalController], providers: [ExternalService], exports: [ExternalService] })
export class ExternalModule {}
