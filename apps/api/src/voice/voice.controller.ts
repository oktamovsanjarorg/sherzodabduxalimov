import { Body, Controller, Get, Headers, Param, Post, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { VoiceService } from "./voice.service";

@Controller()
export class VoiceController {
  constructor(private readonly svc: VoiceService) {}

  /** Tana: xom audio baytlari (Content-Type: audio/webm, audio/mp4, audio/ogg, audio/mpeg ...) */
  @Roles("TEACHER", "ASSISTANT")
  @Post("admin/hw-essays/:id/voice")
  essay(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() body: unknown, @Headers("content-type") ct?: string) {
    return this.svc.forEssay(u.sub, id, body, ct);
  }

  @Roles("TEACHER", "ASSISTANT")
  @Post("admin/essays/:attemptId/:questionId/voice")
  attempt(@CurrentUser() u: JwtUser, @Param("attemptId") a: string, @Param("questionId") q: string, @Body() body: unknown, @Headers("content-type") ct?: string) {
    return this.svc.forAttempt(u.sub, a, q, body, ct);
  }

  @Get("voice/:id") async file(@CurrentUser() u: JwtUser, @Param("id") id: string, @Res() res: FastifyReply) {
    const f = await this.svc.file(u, id);
    return res.header("Content-Type", f.mime).header("Cache-Control", "private, max-age=3600").send(f.data);
  }
}
