import { Module } from "@nestjs/common";
import { AdminBillingController, BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({ controllers: [BillingController, AdminBillingController], providers: [BillingService] })
export class BillingModule {}
