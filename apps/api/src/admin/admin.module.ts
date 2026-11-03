import { Module } from "@nestjs/common";
import { AdminContentController } from "./admin-content.controller";
import { AdminContentService } from "./admin-content.service";
import { DashboardController } from "./dashboard.controller";

@Module({ controllers: [AdminContentController, DashboardController], providers: [AdminContentService], exports: [AdminContentService] })
export class AdminModule {}
