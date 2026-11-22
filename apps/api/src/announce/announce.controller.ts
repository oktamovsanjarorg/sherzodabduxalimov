import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { AnnounceService } from "./announce.service";

/** E'lonlar: ommaviy xabarlar (bot orqali). Faqat ustoz: hammaga yozish katta mas'uliyat */
@Roles("TEACHER")
@Controller("admin/announcements")
export class AnnounceController {
  constructor(private readonly svc: AnnounceService) {}

  @Get() list() {
    return this.svc.list();
  }
  @Post("preview") @HttpCode(200) preview(@Body() body: unknown) {
    return this.svc.preview(body);
  }
  @Post("test") @HttpCode(200) test(@CurrentUser() u: JwtUser, @Body() body: unknown) {
    return this.svc.test(u.sub, body);
  }
  /** Tana: xom rasm baytlari (image/jpeg, image/png, image/webp) */
  @Post("photo") @HttpCode(200) upload(@CurrentUser() u: JwtUser, @Body() body: unknown, @Headers("content-type") ct?: string) {
    return this.svc.uploadPhoto(u.sub, body, ct);
  }
  @Get("photo/:fileId") async photo(@Param("fileId") fileId: string, @Res() res: FastifyReply) {
    const buf = await this.svc.photo(fileId);
    return res.header("Content-Type", "image/jpeg").header("Cache-Control", "private, max-age=86400").send(buf);
  }
  @Get(":id") detail(@Param("id") id: string) {
    return this.svc.detail(id);
  }
  @Post() create(@CurrentUser() u: JwtUser, @Body() body: unknown) {
    return this.svc.create(u.sub, body);
  }
  @Patch(":id") update(@Param("id") id: string, @Body() body: unknown) {
    return this.svc.update(id, body);
  }
  @Delete(":id") remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }
  @Post(":id/send") @HttpCode(200) send(@Param("id") id: string, @Body() body: unknown) {
    return this.svc.send(id, body);
  }
  @Post(":id/cancel") @HttpCode(200) cancel(@Param("id") id: string) {
    return this.svc.cancel(id);
  }
  @Post(":id/retry") @HttpCode(200) retry(@Param("id") id: string) {
    return this.svc.retry(id);
  }
  @Post(":id/recall") @HttpCode(200) recall(@Param("id") id: string) {
    return this.svc.recall(id);
  }
  @Post(":id/duplicate") duplicate(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.duplicate(u.sub, id);
  }
}
