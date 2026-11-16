import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { AdminEssayLogController, AdminEssaySettingsController, AdminHwEssaysController, EssaysController } from "./essays.controller";
import { EssayStatsService } from "./essay-stats.service";
import { EssaysService } from "./essays.service";

@Module({ imports: [BillingModule], controllers: [EssaysController, AdminHwEssaysController, AdminEssaySettingsController, AdminEssayLogController], providers: [EssaysService, EssayStatsService] })
export class EssaysModule {}
