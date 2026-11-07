import { Global, Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { StudentNameController, StudentsController, StudentsInternalController } from "./students.controller";
import { StudentsService } from "./students.service";

@Global()
@Module({ imports: [UsersModule], controllers: [StudentsController, StudentNameController, StudentsInternalController], providers: [StudentsService], exports: [StudentsService] })
export class StudentsModule {}
