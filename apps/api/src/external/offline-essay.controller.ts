import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Res } from "@nestjs/common";
import { offlineEssayCheckBody, offlineEssayConfirmBody, offlineEssayPromptBody } from "@onatili/shared";
import type { FastifyReply } from "fastify";
import { parse } from "../admin/zod";
import { CurrentUser, type JwtUser, Perm } from "../auth/decorators";
import { OfflineEssayService } from "./offline-essay.service";

/** Offline test essesi: varoq rasmi → AI taxminiy baho → ustoz tasdig'i. «Esselar» ruxsati */
@Perm("ESSAYS")
@Controller("admin/offline-essays")
export class OfflineEssayController {
  constructor(private readonly svc: OfflineEssayService) {}

  @Get("tests") tests() {
    return this.svc.tests();
  }

  @Get("tests/:testId") test(@Param("testId") testId: string) {
    return this.svc.testDetail(testId);
  }

  @Put("tests/:testId/prompt") prompt(@CurrentUser() u: JwtUser, @Param("testId") testId: string, @Body() b: unknown) {
    return this.svc.setPrompt(u.sub, testId, parse(offlineEssayPromptBody, b).prompt);
  }

  @Post("tests/:testId/check") @HttpCode(200) check(@CurrentUser() u: JwtUser, @Param("testId") testId: string, @Body() b: unknown) {
    return this.svc.check(u.sub, testId, parse(offlineEssayCheckBody, b ?? {}).resultIds);
  }

  @Get(":resultId") detail(@Param("resultId") resultId: string) {
    return this.svc.detail(resultId);
  }

  /** Tana: xom rasm baytlari */
  @Post(":resultId/pages") addPage(@Param("resultId") resultId: string, @Body() body: unknown) {
    return this.svc.addPage(resultId, body);
  }

  @Delete(":resultId/pages/:n") removePage(@Param("resultId") resultId: string, @Param("n", ParseIntPipe) n: number) {
    return this.svc.removePage(resultId, n);
  }

  @Get(":resultId/pages/:n") async page(@Param("resultId") resultId: string, @Param("n", ParseIntPipe) n: number, @Res() res: FastifyReply) {
    const r = await this.svc.page(resultId, n);
    return res.header("Content-Type", r.mime).header("Cache-Control", "private, no-store").send(r.data);
  }

  /** Ustoz tasdiqlagan yakuniy ball natijaga yoziladi */
  @Post(":resultId/confirm") @HttpCode(200) confirm(@CurrentUser() u: JwtUser, @Param("resultId") resultId: string, @Body() b: unknown) {
    return this.svc.confirm(u.sub, resultId, parse(offlineEssayConfirmBody, b).score);
  }
}
