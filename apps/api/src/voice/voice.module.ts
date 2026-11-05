import { Global, Module } from "@nestjs/common";
import { VoiceController } from "./voice.controller";
import { VoiceService } from "./voice.service";

@Global()
@Module({ controllers: [VoiceController], providers: [VoiceService], exports: [VoiceService] })
export class VoiceModule {}
