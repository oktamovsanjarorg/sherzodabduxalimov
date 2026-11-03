import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { parse } from "../admin/zod";
import { VideosService } from "./videos.service";

const createBody = z.object({ filename: z.string().min(1).max(255), size: z.number().int().positive() });

@Roles("TEACHER", "ASSISTANT")
@Controller("admin/videos")
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Post() create(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    const d = parse(createBody, b);
    return this.videos.create(u.sub, d.filename, d.size);
  }

  @Get(":id") get(@Param("id") id: string) {
    return this.videos.get(id);
  }

  /** Body: application/octet-stream (xom baytlar) */
  @Put(":id/chunk") chunk(@Param("id") id: string, @Query("offset") offset: string, @Req() req: FastifyRequest) {
    const off = Number(offset);
    if (!Number.isInteger(off) || off < 0) throw new BadRequestException("offset kerak");
    if (!Buffer.isBuffer(req.body)) throw new BadRequestException("Content-Type: application/octet-stream bo'lishi kerak");
    return this.videos.writeChunk(id, off, req.body);
  }

  @Post(":id/retry") @HttpCode(200) retry(@Param("id") id: string) {
    return this.videos.retry(id);
  }

  @Delete(":id") remove(@Param("id") id: string) {
    return this.videos.remove(id);
  }
}
