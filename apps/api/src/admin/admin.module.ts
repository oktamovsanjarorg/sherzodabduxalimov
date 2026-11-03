import { Module } from "@nestjs/common";
import { AdminContentController } from "./admin-content.controller";
import { AdminContentService } from "./admin-content.service";

@Module({ controllers: [AdminContentController], providers: [AdminContentService], exports: [AdminContentService] })
export class AdminModule {}
