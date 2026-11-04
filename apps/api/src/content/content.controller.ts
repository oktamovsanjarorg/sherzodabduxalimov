import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { CurrentUser, type JwtUser } from "../auth/decorators";
import { ContentService } from "./content.service";

@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get("courses")
  courses(@CurrentUser() user: JwtUser) {
    return this.content.listCourses(user);
  }

  @Get("lessons/:id")
  lesson(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.content.getLesson(user, id);
  }

  @Post("lessons/:id/complete")
  @HttpCode(200)
  complete(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.content.completeLesson(user, id);
  }

  @Get("me/attempts")
  attempts(@CurrentUser() user: JwtUser) {
    return this.content.myAttempts(user);
  }

  @Get("me/attendance")
  attendance(@CurrentUser() user: JwtUser) {
    return this.content.myAttendance(user);
  }

  @Get("me/stats")
  stats(@CurrentUser() user: JwtUser) {
    return this.content.stats(user);
  }
}
