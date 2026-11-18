import { Module } from "@nestjs/common";
import { AdvisorController } from "./advisor.controller";

@Module({ controllers: [AdvisorController] })
export class AdvisorModule {}
