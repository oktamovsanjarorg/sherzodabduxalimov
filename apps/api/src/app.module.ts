import { DynamicModule, Global, Module } from "@nestjs/common";
import { AccessModule } from "./access/access.module";
import { AdminModule } from "./admin/admin.module";
import { BillingModule } from "./billing/billing.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { NotifyModule } from "./notify/notify.module";
import { ParentsModule } from "./parents/parents.module";
import { AuthModule } from "./auth/auth.module";
import { ContentModule } from "./content/content.module";
import { ENV, type Env } from "./config/env";
import { HealthController } from "./health/health.controller";
import { MediaModule } from "./media/media.module";
import { PrismaModule } from "./prisma/prisma.module";
import { StaffModule } from "./staff/staff.module";
import { TestsModule } from "./tests/tests.module";
import { UsersModule } from "./users/users.module";

@Global()
@Module({})
class EnvModule {
  static forRoot(env: Env): DynamicModule {
    return { module: EnvModule, providers: [{ provide: ENV, useValue: env }], exports: [ENV] };
  }
}

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [EnvModule.forRoot(env), PrismaModule, AccessModule, UsersModule, AuthModule, StaffModule, ContentModule, TestsModule, AdminModule, MediaModule, NotifyModule, ParentsModule, AttendanceModule, BillingModule],
      controllers: [HealthController],
    };
  }
}
