import { Module } from "@nestjs/common";
import { GoldController } from "./gold.controller";
import { GoldService } from "./gold.service";

@Module({ controllers: [GoldController], providers: [GoldService] })
export class GoldModule {}
