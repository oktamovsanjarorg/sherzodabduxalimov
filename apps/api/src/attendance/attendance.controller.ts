import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { attendanceNotifyInput, attendanceSaveInput, groupInput } from "@onatili/shared";
import { z } from "zod";
import { parse } from "../admin/zod";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { AttendanceService } from "./attendance.service";

@Roles("TEACHER", "ASSISTANT")
@Controller("admin")
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  @Get("groups") groups() {
    return this.svc.listGroups();
  }
  @Post("groups") create(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    return this.svc.createGroup(u.sub, parse(groupInput, b));
  }
  @Patch("groups/:id") update(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.updateGroup(u.sub, id, parse(groupInput.partial(), b));
  }
  @Delete("groups/:id") remove(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.deleteGroup(u.sub, id);
  }

  @Get("groups/:id/students") students(@Param("id") id: string) {
    return this.svc.groupStudents(id);
  }
  @Post("groups/:id/students") add(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.addStudents(u.sub, id, parse(z.object({ studentIds: z.array(z.string()).min(1).max(200) }), b).studentIds);
  }
  @Delete("groups/:id/students/:studentId") removeStudent(@CurrentUser() u: JwtUser, @Param("id") id: string, @Param("studentId") sid: string) {
    return this.svc.removeStudent(u.sub, id, sid);
  }

  @Get("students") search(@Query("search") q = "") {
    return this.svc.searchStudents(q);
  }

  @Get("groups/:id/attendance") day(@Param("id") id: string, @Query("date") date: string) {
    return this.svc.day(id, date);
  }
  @Put("groups/:id/attendance") save(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.save(u.sub, id, parse(attendanceSaveInput, b));
  }
  @Post("groups/:id/attendance/notify") @HttpCode(200) notify(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.notifyParents(u.sub, id, parse(attendanceNotifyInput, b).date);
  }
  @Get("groups/:id/attendance/month") month(@Param("id") id: string, @Query("month") month: string) {
    return this.svc.month(id, month);
  }
}
