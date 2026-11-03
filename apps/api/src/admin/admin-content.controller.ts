import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { courseInput, lessonInput, questionInput, reorderInput, testInput, topicInput } from "@onatili/shared";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { AdminContentService } from "./admin-content.service";
import { parse } from "./zod";

@Roles("TEACHER", "ASSISTANT")
@Controller("admin")
export class AdminContentController {
  constructor(private readonly svc: AdminContentService) {}

  // Kurslar
  @Get("courses") courses() {
    return this.svc.listCourses();
  }
  @Post("courses") createCourse(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    return this.svc.createCourse(u.sub, parse(courseInput, b));
  }
  @Patch("courses/:id") updateCourse(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.updateCourse(u.sub, id, parse(courseInput.partial(), b));
  }
  @Delete("courses/:id") deleteCourse(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.deleteCourse(u.sub, id);
  }

  // Mavzular
  @Post("courses/:id/topics") createTopic(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.createTopic(u.sub, id, parse(topicInput, b).title);
  }
  @Patch("topics/:id") updateTopic(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.updateTopic(u.sub, id, parse(topicInput, b).title);
  }
  @Delete("topics/:id") deleteTopic(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.deleteTopic(u.sub, id);
  }

  // Darslar
  @Post("topics/:id/lessons") createLesson(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.createLesson(u.sub, id, parse(lessonInput, b));
  }
  @Get("lessons/:id") lesson(@Param("id") id: string) {
    return this.svc.getLesson(id);
  }
  @Patch("lessons/:id") updateLesson(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.updateLesson(u.sub, id, parse(lessonInput.partial(), b));
  }
  @Delete("lessons/:id") deleteLesson(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.deleteLesson(u.sub, id);
  }

  @Post("reorder") @HttpCode(200) reorder(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    const d = parse(reorderInput, b);
    return this.svc.reorder(u.sub, d.kind, d.ids);
  }

  // Savollar banki
  @Get("questions") questions(
    @Query("topicId") topicId?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.svc.listQuestions({ topicId, search, page: Number(page) || 1, pageSize: Number(pageSize) || 30 });
  }
  @Get("questions/:id") question(@Param("id") id: string) {
    return this.svc.getQuestion(id);
  }
  @Post("questions") createQuestion(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    return this.svc.createQuestion(u.sub, parse(questionInput, b));
  }
  @Patch("questions/:id") updateQuestion(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.updateQuestion(u.sub, id, parse(questionInput, b));
  }
  @Delete("questions/:id") deleteQuestion(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.deleteQuestion(u.sub, id);
  }

  // Testlar
  @Get("tests") tests(@Query("type") type?: string) {
    return this.svc.listTests(type === "TOPIC" || type === "MOCK" ? type : undefined);
  }
  @Get("tests/:id") test(@Param("id") id: string) {
    return this.svc.getTest(id);
  }
  @Post("tests") createTest(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    return this.svc.createTest(u.sub, parse(testInput, b));
  }
  @Patch("tests/:id") updateTest(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.updateTest(u.sub, id, parse(testInput, b));
  }
  @Delete("tests/:id") deleteTest(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.deleteTest(u.sub, id);
  }
}
