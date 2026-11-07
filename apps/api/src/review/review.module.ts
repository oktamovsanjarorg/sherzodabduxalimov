import { Body, Controller, HttpCode, Module, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { parse } from "../admin/zod";
import { Public } from "../auth/decorators";
import { InternalGuard } from "../staff/internal.guard";
import { ReviewService } from "./review.service";

/** Bot (ichki): ustoz xabardagi tugmani bosdi */
@Controller("internal")
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  @Public()
  @UseGuards(InternalGuard)
  @Post("review")
  @HttpCode(200)
  handle(@Body() b: unknown) {
    const d = parse(z.object({ telegramId: z.number().int().positive(), data: z.string().min(1).max(64) }), b);
    return this.review.handle(d.telegramId, d.data);
  }
}

@Module({ controllers: [ReviewController], providers: [ReviewService] })
export class ReviewModule {}
