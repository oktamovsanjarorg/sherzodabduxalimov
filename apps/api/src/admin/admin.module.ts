import { Module } from "@nestjs/common";
import { AdminContentController } from "./admin-content.controller";
import { AdminContentService } from "./admin-content.service";
import { DashboardController } from "./dashboard.controller";
import { EssaysController } from "./essays.controller";
import { EssaysService } from "./essays.service";

@Module({ controllers: [AdminContentController, DashboardController, EssaysController], providers: [AdminContentService, EssaysService], exports: [AdminContentService] })
export class AdminModule {}
