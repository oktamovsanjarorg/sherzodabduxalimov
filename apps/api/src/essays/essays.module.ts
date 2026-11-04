import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { AdminEssaySettingsController, AdminHwEssaysController, EssaysController } from "./essays.controller";
import { EssaysService } from "./essays.service";

@Module({ imports: [BillingModule], controllers: [EssaysController, AdminHwEssaysController, AdminEssaySettingsController], providers: [EssaysService] })
export class EssaysModule {}
