import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import { MAX_VIDEO_BYTES, UPLOAD_CHUNK_BYTES, type AdminVideo } from "@onatili/shared";
import { mkdir, open, rm } from "node:fs/promises";
import { toAdminVideo } from "./video-dto";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { MediaPaths } from "./paths";
import { createVideoQueue } from "./queue";

const ALLOWED_EXT = /\.(mp4|mov|mkv|webm|avi|m4v)$/i;

@Injectable()
export class VideosService implements OnModuleDestroy {
  readonly paths: MediaPaths;
  private readonly queue;

  constructor(@Inject(ENV) env: Env, private readonly prisma: PrismaService) {
    this.paths = new MediaPaths(env.MEDIA_DIR);
    this.queue = createVideoQueue(env.REDIS_URL, env.QUEUE_PREFIX);
  }

  async onModuleDestroy() {
    await this.queue.close();
  }

  async create(actorId: string, filename: string, size: number): Promise<AdminVideo & { chunkSize: number }> {
    if (!ALLOWED_EXT.test(filename)) throw new BadRequestException("Faqat video fayl (mp4, mov, mkv, webm, avi)");
    if (!Number.isInteger(size) || size <= 0) throw new BadRequestException("Fayl hajmi noto'g'ri");
    if (size > MAX_VIDEO_BYTES) throw new BadRequestException("Fayl juda katta (8 GB gacha)");
    const v = await this.prisma.video.create({
      data: { originalName: filename.slice(0, 200), sizeBytes: BigInt(size), createdById: actorId },
    });
    await mkdir(this.paths.dir(v.id), { recursive: true });
    return { ...toAdminVideo(v)!, chunkSize: UPLOAD_CHUNK_BYTES };
  }

  async get(id: string): Promise<AdminVideo> {
    const v = await this.prisma.video.findUnique({ where: { id } });
    if (!v) throw new NotFoundException("Video topilmadi");
    return toAdminVideo(v)!;
  }

  /**
   * Bo'lakni yozadi. offset serverdagi receivedBytes'ga teng bo'lishi shart.
   * Aks holda 409 va kutilgan offset qaytadi: klient yuklashni shu joydan davom ettiradi.
   */
  async writeChunk(id: string, offset: number, chunk: Buffer): Promise<AdminVideo> {
    const v = await this.prisma.video.findUnique({ where: { id } });
    if (!v) throw new NotFoundException("Video topilmadi");
    if (v.status !== "UPLOADING") throw new ConflictException({ message: "Video allaqachon yuklangan", receivedBytes: Number(v.receivedBytes) });
    const received = Number(v.receivedBytes);
    const size = Number(v.sizeBytes);
    if (offset !== received) throw new ConflictException({ message: "Offset mos emas", receivedBytes: received });
    if (!chunk?.length || chunk.length > UPLOAD_CHUNK_BYTES) throw new BadRequestException("Bo'lak hajmi noto'g'ri");
    if (received + chunk.length > size) throw new BadRequestException("Fayl e'lon qilingan hajmdan katta");

    const fh = await open(this.paths.original(id), received === 0 ? "w" : "r+");
    try {
      await fh.write(chunk, 0, chunk.length, offset);
    } finally {
      await fh.close();
    }

    const next = received + chunk.length;
    const done = next === size;
    // Shartli yangilash: bir vaqtda kelgan ikki bir xil bo'lakdan faqat bittasi hisoblanadi
    const { count } = await this.prisma.video.updateMany({
      where: { id, status: "UPLOADING", receivedBytes: BigInt(received) },
      data: { receivedBytes: BigInt(next), ...(done ? { status: "PROCESSING" } : {}) },
    });
    if (count === 0) throw new ConflictException({ message: "Parallel yuklash", receivedBytes: received });
    if (done) await this.enqueue(id);
    return this.get(id);
  }

  async retry(id: string) {
    const v = await this.get(id);
    if (v.status !== "FAILED") throw new ConflictException("Faqat xato bo'lgan videoni qayta ishlash mumkin");
    await this.prisma.video.update({ where: { id }, data: { status: "PROCESSING", error: null } });
    await this.enqueue(id);
    return this.get(id);
  }

  async remove(id: string) {
    const v = await this.prisma.video.findUnique({ where: { id }, include: { lesson: true } });
    if (!v) throw new NotFoundException("Video topilmadi");
    if (v.lesson) throw new ConflictException("Video darsga biriktirilgan. Avval darsdan olib tashlang.");
    await this.prisma.video.delete({ where: { id } });
    await rm(this.paths.dir(id), { recursive: true, force: true });
    return { ok: true };
  }

  /** Videoni so'zsiz o'chiradi (dars o'chirilganda). Fayl xatolari dars o'chirilishiga to'sqinlik qilmaydi. */
  async purge(id: string) {
    await this.prisma.video.deleteMany({ where: { id } });
    await rm(this.paths.dir(id), { recursive: true, force: true }).catch(() => {});
  }

  private enqueue(videoId: string) {
    return this.queue.add("transcode", { videoId }, { jobId: `${videoId}-${Date.now()}` });
  }
}
