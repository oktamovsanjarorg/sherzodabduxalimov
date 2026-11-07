import { Controller, Get } from "@nestjs/common";
import { CurrentUser, type JwtUser } from "../auth/decorators";
import { UsersService } from "./users.service";

@Controller("me")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: JwtUser) {
    return this.users.me(user.sub);
  }
}
