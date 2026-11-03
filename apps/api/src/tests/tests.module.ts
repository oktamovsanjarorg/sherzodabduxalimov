import { Module } from "@nestjs/common";
import { ContentModule } from "../content/content.module";
import { AttemptsController } from "./attempts.controller";
import { AttemptsService } from "./attempts.service";

@Module({ imports: [ContentModule], controllers: [AttemptsController], providers: [AttemptsService] })
export class TestsModule {}
