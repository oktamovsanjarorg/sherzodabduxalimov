import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { saveAnswerBody } from "@onatili/shared";
import { CurrentUser, type JwtUser } from "../auth/decorators";
import { AttemptsService } from "./attempts.service";

@Controller()
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Get("mocks")
  mocks(@CurrentUser() user: JwtUser) {
    return this.attempts.listMocks(user);
  }

  @Post("tests/:id/attempts")
  @HttpCode(200)
  start(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.attempts.start(user, id);
  }

  @Get("attempts/:id")
  get(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.attempts.get(user, id);
  }

  @Put("attempts/:id/answers/:questionId")
  save(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Param("questionId") questionId: string,
    @Body() body: unknown,
  ) {
    const parsed = saveAnswerBody.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("Javob formati noto'g'ri");
    return this.attempts.saveAnswer(user, id, questionId, parsed.data);
  }

  @Post("attempts/:id/submit")
  @HttpCode(200)
  submit(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.attempts.submit(user, id);
  }
}
