import { Global, Module } from "@nestjs/common";
import { StudentsController, StudentsInternalController } from "./students.controller";
import { StudentsService } from "./students.service";

@Global()
@Module({ controllers: [StudentsController, StudentsInternalController], providers: [StudentsService], exports: [StudentsService] })
export class StudentsModule {}
