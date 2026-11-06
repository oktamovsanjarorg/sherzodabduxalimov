import { Global, Module } from "@nestjs/common";
import { TrashController } from "./trash.controller";
import { TrashService } from "./trash.service";

@Global()
@Module({ providers: [TrashService], controllers: [TrashController], exports: [TrashService] })
export class TrashModule {}
