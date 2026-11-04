import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { essayReviewInput } from "@onatili/shared";
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
