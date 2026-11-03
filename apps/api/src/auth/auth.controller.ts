import { BadRequestException, Body, Controller, HttpCode, Post } from "@nestjs/common";
import { authTelegramBody } from "@onatili/shared";
import { AuthService } from "./auth.service";
import { Public } from "./decorators";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("telegram")
  @HttpCode(200)
  telegram(@Body() body: unknown) {
    const parsed = authTelegramBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException("initData kerak");
    return this.auth.loginWithTelegram(parsed.data.initData);
  }
}
