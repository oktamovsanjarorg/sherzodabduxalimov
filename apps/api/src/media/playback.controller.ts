import { Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { readFile } from "node:fs/promises";
import { Public } from "../auth/decorators";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { verifyMediaToken } from "./media-token";
import { isSegment, isVariant, isVideoId } from "./paths";
import { VideosService } from "./videos.service";

/**
 * HLS uchun ochiq (JWT'siz) endpoint'lar: kirish faqat URL'dagi imzolangan token orqali.
 * Token /lessons/:id javobida, obuna tekshiruvidan keyin beriladi.
 */
@Public()
@Controller()
export class PlaybackController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly videos: VideosService,
  ) {}

  private async authorize(id: string, t: string | undefined) {
    if (!isVideoId(id)) throw new NotFoundException();
    const userId = verifyMediaToken(this.env.JWT_SECRET, id, t);
    if (!userId) throw new ForbiddenException("Video havolasi eskirgan. Darsni qayta oching.");
    const v = await this.prisma.video.findUnique({ where: { id }, select: { status: true, variants: true } });
    if (!v || v.status !== "READY") throw new NotFoundException();
    return v;
  }

  private noStore(res: FastifyReply, type: string) {
    res.header("content-type", type);
    res.header("cache-control", "private, no-store");
  }

  @Get("media/:id/master.m3u8")
  async master(@Param("id") id: string, @Query("t") t: string, @Res({ passthrough: true }) res: FastifyReply) {
    const v = await this.authorize(id, t);
    const q = `t=${encodeURIComponent(t)}`;
    const info: Record<string, string> = {
      "1080p": "BANDWIDTH=5000000,RESOLUTION=1920x1080",
      "720p": "BANDWIDTH=2800000,RESOLUTION=1280x720",
      "480p": "BANDWIDTH=1400000,RESOLUTION=854x480",
      "360p": "BANDWIDTH=800000,RESOLUTION=640x360",
    };
    const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
    for (const variant of v.variants) {
      lines.push(`#EXT-X-STREAM-INF:${info[variant] ?? "BANDWIDTH=1000000"}`, `/api/media/${id}/${variant}/index.m3u8?${q}`);
    }
    this.noStore(res, "application/vnd.apple.mpegurl");
    return lines.join("\n") + "\n";
  }

  /** Variant pleylisti: kalit URI'si va segment manzillari shu yerda qayta yoziladi */
  @Get("media/:id/:variant/index.m3u8")
  async variant(
    @Param("id") id: string,
    @Param("variant") variant: string,
    @Query("t") t: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const v = await this.authorize(id, t);
    if (!isVariant(variant) || !v.variants.includes(variant)) throw new NotFoundException();
    const raw = await readFile(this.videos.paths.playlist(id, variant), "utf8");
    const keyUrl = `/api/media/${id}/key?t=${encodeURIComponent(t)}`;
    const segBase = `${this.env.MEDIA_SEGMENT_BASE.replace(/\/$/, "")}/${id}/${variant}`;
    const out = raw
      .split("\n")
      .map((line) => {
        if (line.startsWith("#EXT-X-KEY:")) return line.replace(/URI="[^"]*"/, `URI="${keyUrl}"`);
        if (isSegment(line.trim())) return `${segBase}/${line.trim()}`;
        return line;
      })
      .join("\n");
    this.noStore(res, "application/vnd.apple.mpegurl");
    return out;
  }

  @Get("media/:id/key")
  async key(@Param("id") id: string, @Query("t") t: string, @Res({ passthrough: true }) res: FastifyReply) {
    await this.authorize(id, t);
    this.noStore(res, "application/octet-stream");
    return readFile(this.videos.paths.key(id));
  }

  /** Dev uchun segmentlar. Prod'da ularni nginx beradi. Segmentlar shifrlangan, kalitsiz foydasiz. */
  @Get("media-seg/:id/:variant/:seg")
  async segment(
    @Param("id") id: string,
    @Param("variant") variant: string,
    @Param("seg") seg: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    if (!isVideoId(id) || !isVariant(variant) || !isSegment(seg)) throw new NotFoundException();
    try {
      const buf = await readFile(this.videos.paths.segment(id, variant, seg));
      res.header("content-type", "video/mp2t");
      res.header("cache-control", "public, max-age=31536000, immutable");
      return buf;
    } catch {
      throw new NotFoundException();
    }
  }
}
