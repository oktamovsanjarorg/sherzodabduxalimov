import { Controller, Get, Param } from "@nestjs/common";
import type { PlatformAdvice, StudentAdvice } from "@onatili/shared";
import { CurrentUser, type JwtUser, Perm, can } from "../auth/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { platformAdvice } from "./platform-advice";
import { studentAdvice } from "./student-advice";

/** Ustoz yordamchisi: bazadagi faktlardan tavsiyalar (AI ishlatilmaydi: har tavsiya aniq raqam va amal) */
@Perm("STATS")
@Controller("admin")
export class AdvisorController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("advisor") async platform(@CurrentUser() u: JwtUser): Promise<PlatformAdvice> {
    const d = await platformAdvice(this.prisma);
    // Yordamchi (ASSISTANT) pulga oid ma'lumot ko'rmaydi
    return can(u, "PAYMENTS") ? d : { ...d, advice: d.advice.filter((a) => a.area !== "payments") };
  }

  @Perm("STATS", "STUDENTS")
  @Get("students/:id/advisor")
  student(@Param("id") id: string): Promise<StudentAdvice> {
    return studentAdvice(this.prisma, id);
  }
}
