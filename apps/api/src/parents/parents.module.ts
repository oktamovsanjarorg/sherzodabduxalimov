import { Global, Module } from "@nestjs/common";
import { ParentsController } from "./parents.controller";
import { ParentsService } from "./parents.service";

@Global()
@Module({ controllers: [ParentsController], providers: [ParentsService], exports: [ParentsService] })
export class ParentsModule {}
