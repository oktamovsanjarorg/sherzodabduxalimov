import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { essayReviewInput, textMarkSchema } from "@onatili/shared";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { EssaysService } from "./essays.service";
import { parse } from "./zod";

@Roles("TEACHER", "ASSISTANT")
@Controller("admin/essays")
export class EssaysController {
  constructor(private readonly svc: EssaysService) {}

  @Get() list(@Query("status") status?: string) {
    return this.svc.list(status === "reviewed" ? "reviewed" : "pending");
  }

  @Put(":attemptId/:questionId/annotations") annotate(@CurrentUser() u: JwtUser, @Param("attemptId") a: string, @Param("questionId") q: string, @Body() b: unknown) {
    return this.svc.saveMarks(u.sub, a, q, parse(z.array(textMarkSchema).max(500), b));
  }

  @Post(":attemptId/:questionId") @HttpCode(200) review(
    @CurrentUser() u: JwtUser,
    @Param("attemptId") attemptId: string,
    @Param("questionId") questionId: string,
    @Body() b: unknown,
  ) {
    const d = parse(essayReviewInput, b);
    return this.svc.review(u.sub, attemptId, questionId, { points: d.points, special: d.special, criteria: d.criteria }, d.comment ?? null);
  }
}
