import { Module } from "@nestjs/common";
import { ContentModule } from "../content/content.module";
import { AttemptsController } from "./attempts.controller";
import { RaschService } from "./rasch.service";
import { AttemptsService } from "./attempts.service";

@Module({ imports: [ContentModule], controllers: [AttemptsController], providers: [AttemptsService, RaschService], exports: [RaschService] })
export class TestsModule {}
