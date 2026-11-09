import { Controller, Get, Module, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { ExportService } from "./export.service";

/** Hamma asosiy ma'lumotni Excel faylga yuklab olish: faqat ega (telefonlar, to'lovlar bor) */
@Roles("TEACHER")
@Controller("admin/export")
export class ExportController {
  constructor(private readonly svc: ExportService) {}

  @Get("xlsx") async xlsx(@CurrentUser() u: JwtUser, @Res() res: FastifyReply) {
    const { file, name } = await this.svc.workbook(u.sub);
    return res
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="${name}"`)
      .header("Cache-Control", "private, no-store")
      .send(file);
  }
}

@Module({ controllers: [ExportController], providers: [ExportService] })
export class ExportModule {}
