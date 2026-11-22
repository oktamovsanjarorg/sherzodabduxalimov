import { Module } from "@nestjs/common";
import { AnnounceController } from "./announce.controller";
import { AnnounceService } from "./announce.service";

@Module({ controllers: [AnnounceController], providers: [AnnounceService] })
export class AnnounceModule {}
