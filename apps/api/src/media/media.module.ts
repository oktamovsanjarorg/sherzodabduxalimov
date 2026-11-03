import { Global, Module } from "@nestjs/common";
import { PlaybackController } from "./playback.controller";
import { VideosController } from "./videos.controller";
import { VideosService } from "./videos.service";

@Global()
@Module({ controllers: [VideosController, PlaybackController], providers: [VideosService], exports: [VideosService] })
export class MediaModule {}
