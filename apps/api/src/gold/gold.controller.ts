import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Res } from "@nestjs/common";
import { goldCreateInput, goldFromEssayInput, goldRatingInput, goldTranscriptInput } from "@onatili/shared";
import type { FastifyReply } from "fastify";
import { parse } from "../admin/zod";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { GoldService } from "./gold.service";

/** Esse AI o'lchovi uchun sinov to'plami: ustoz va yordamchi to'ldiradi, eksportni faqat ustoz oladi */
@Controller("admin/gold")
@Roles("TEACHER", "ASSISTANT")
export class GoldController {
  constructor(private readonly svc: GoldService) {}

  @Get() list(@CurrentUser() u: JwtUser) {
    return this.svc.list(u.sub);
  }

  @Roles("TEACHER")
  @Get("export.zip")
  async export(@Res() res: FastifyReply) {
    const r = await this.svc.exportZip();
    return res
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="gold-${new Date().toISOString().slice(0, 10)}.zip"`)
      .header("X-Gold-Essays", String(r.essays))
      .header("X-Gold-Skipped-Marks", String(r.skippedMarks))
      .header("Cache-Control", "no-store")
      .send(Buffer.from(r.zip));
  }

  @Post() create(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    return this.svc.create(u.sub, parse(goldCreateInput, b));
  }

  @Post("from-essay/:essayId") fromEssay(@CurrentUser() u: JwtUser, @Param("essayId") essayId: string, @Body() b: unknown) {
    parse(goldFromEssayInput, b);
    return this.svc.fromEssay(u.sub, essayId);
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

  @Get(":id/pages/:n") async page(@Param("id") id: string, @Param("n", ParseIntPipe) n: number, @Res() res: FastifyReply) {
    const r = await this.svc.page(id, n);
    return res.header("Content-Type", r.mime).header("Cache-Control", "private, no-store").send(r.data);
  }

  @Put(":id/transcript") transcript(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.saveTranscript(u.sub, id, parse(goldTranscriptInput, b));
  }

  @Put(":id/rating") rate(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.rate(u.sub, id, parse(goldRatingInput, b));
  }

  @Delete(":id") remove(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.remove(u, id);
  }
}
