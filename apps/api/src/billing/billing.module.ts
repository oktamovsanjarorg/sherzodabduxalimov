import { Module } from "@nestjs/common";
import { AdminBillingController, AdminOfflineBillingController, BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { OfflineBillingService } from "./offline.service";

@Module({ controllers: [BillingController, AdminBillingController, AdminOfflineBillingController], providers: [BillingService, OfflineBillingService] })
export class BillingModule {}
