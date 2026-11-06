import { Controller, Delete, Get, HttpCode, Param, Post } from "@nestjs/common";
import { Roles } from "../auth/decorators";
import { TrashService } from "./trash.service";

/** Korzinka: ko'rish, tiklash va butunlay o'chirish — faqat ega */
@Roles("TEACHER")
@Controller("admin/trash")
export class TrashController {
  constructor(private readonly trash: TrashService) {}

  @Get() list() {
    return this.trash.list();
  }

  @Post(":id/restore") @HttpCode(200) restore(@Param("id") id: string) {
    return this.trash.restore(id);
  }

  @Delete(":id") purge(@Param("id") id: string) {
    return this.trash.purge(id);
  }
}
