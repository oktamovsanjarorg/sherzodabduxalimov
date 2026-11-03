import { Global, Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";

@Global()
@Module({ imports: [UsersModule], controllers: [StaffController], providers: [StaffService], exports: [StaffService] })
export class StaffModule {}
