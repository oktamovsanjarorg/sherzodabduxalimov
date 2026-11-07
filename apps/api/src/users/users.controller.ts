import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { studentNameInput } from "@onatili/shared";
import { parse } from "../admin/zod";
import { CurrentUser, type JwtUser } from "../auth/decorators";
import { UsersService } from "./users.service";

@Controller("me")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: JwtUser) {
    return this.users.me(user.sub);
  }

  @Post("name")
  @HttpCode(200)
  setName(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    return this.users.setOwnName(user.sub, parse(studentNameInput, body));
  }
}
