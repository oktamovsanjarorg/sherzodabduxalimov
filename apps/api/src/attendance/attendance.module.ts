import { Module } from "@nestjs/common";
import { AttendanceController, AttendanceInternalController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";

@Module({ controllers: [AttendanceController, AttendanceInternalController], providers: [AttendanceService] })
export class AttendanceModule {}
