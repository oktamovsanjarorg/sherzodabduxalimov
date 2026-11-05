import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import { STAFF_ROLES, type RoleName, type VoiceView } from "@onatili/shared";
import { Queue } from "bullmq";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ENV, type Env } from "../config/env";
import { redisConnection } from "../media/queue";
import { PrismaService } from "../prisma/prisma.service";
import { VOICE_QUEUE, type VoiceJob } from "./queue";

/** Brauzer yozadigan formatlar: Chrome/Android — webm/opus, iPhone — mp4/aac. Fayl yuklansa — mp3, m4a, ogg, wav */
const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};
const MIME: Record<string, string> = { m4a: "audio/mp4", ogg: "audio/ogg", webm: "audio/webm", mp3: "audio/mpeg", wav: "audio/wav", aac: "audio/aac" };

export const toVoiceView = (v: { id: string; status: VoiceView["status"]; durationSec: number | null } | null | undefined): VoiceView | null =>
  v ? { id: v.id, status: v.status, durationSec: v.durationSec } : null;

/**
 * Ustozning ovozli izohi: esse baholangandan keyin yoziladi. Asl yozuv saqlanadi, worker uni
 * OGG/Opus (Telegram ovozli xabari) va M4A (ilovada hamma telefonda ijro uchun) ga o'giradi va o'quvchiga yuboradi.
 */
@Injectable()
export class VoiceService implements OnModuleDestroy {
  private readonly root: string;
  private readonly queue: Queue<VoiceJob>;
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    this.root = resolve(env.MEDIA_DIR);
    this.queue = new Queue<VoiceJob>(VOICE_QUEUE, {
      prefix: env.QUEUE_PREFIX,
      connection: redisConnection(env.REDIS_URL),
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 10_000 }, removeOnComplete: 500, removeOnFail: 500 },
    });
  }
  async onModuleDestroy() {
    await this.queue.close();
  }

  /** Erkin (qo'lyozma) esse: ustoz baholagandan keyin */
  async forEssay(actorId: string, essayId: string, body: unknown, contentType: string | undefined): Promise<VoiceView> {
    const e = await this.prisma.essay.findUnique({ where: { id: essayId }, select: { status: true, voice: true } });
    if (!e) throw new NotFoundException("Esse topilmadi");
    if (e.status !== "REVIEWED") throw new ConflictException("Avval esseni baholang");
    return this.save(actorId, body, contentType, e.voice, { essayId });
  }

  /** Mock essesi: ustoz baholagandan keyin */
  async forAttempt(actorId: string, attemptId: string, questionId: string, body: unknown, contentType: string | undefined): Promise<VoiceView> {
    const a = await this.prisma.attemptAnswer.findUnique({ where: { attemptId_questionId: { attemptId, questionId } }, select: { points: true, question: { select: { type: true } } } });
    if (!a || a.question.type !== "ESSAY") throw new NotFoundException("Esse topilmadi");
    if (a.points === null) throw new ConflictException("Avval esseni baholang");
    const prev = await this.prisma.voiceNote.findUnique({ where: { attemptId_questionId: { attemptId, questionId } } });
    return this.save(actorId, body, contentType, prev, { attemptId, questionId });
  }

  private async save(
    actorId: string,
    body: unknown,
    contentType: string | undefined,
    prev: { id: string; originalPath: string; oggPath: string | null; m4aPath: string | null } | null,
    target: { essayId?: string; attemptId?: string; questionId?: string },
  ): Promise<VoiceView> {
    if (!Buffer.isBuffer(body) || body.length < 1000) throw new BadRequestException("Ovozli yozuv bo'sh yoki juda qisqa");
    const ext = EXT[(contentType ?? "").split(";")[0].trim().toLowerCase()];
    if (!ext) throw new BadRequestException("Faqat audio fayl (webm, ogg, m4a, mp3, wav)");
    // Qayta yozilsa: eskisi almashtiriladi
    if (prev) {
      await this.prisma.voiceNote.delete({ where: { id: prev.id } });
      for (const p of [prev.originalPath, prev.oggPath, prev.m4aPath]) if (p) await rm(this.abs(p), { force: true });
    }
    const v = await this.prisma.voiceNote.create({ data: { ...target, originalPath: "", createdById: actorId } });
    const rel = `voice/${v.id}.orig.${ext}`;
    await mkdir(dirname(this.abs(rel)), { recursive: true });
    await writeFile(this.abs(rel), body);
    await this.prisma.voiceNote.update({ where: { id: v.id }, data: { originalPath: rel } });
    await this.queue.add("process", { voiceId: v.id }, { jobId: v.id });
    await this.prisma.auditLog.create({ data: { actorId, action: "voice.create", entity: "VoiceNote", entityId: v.id, meta: target } });
    return { id: v.id, status: "PROCESSING", durationSec: null };
  }

  /** Tinglash: esse egasi (o'quvchi) yoki xodim. Tayyor bo'lsa M4A, aks holda asl yozuv */
  async file(user: { sub: string; role: RoleName }, id: string): Promise<{ mime: string; data: Buffer }> {
    const v = await this.prisma.voiceNote.findUnique({ where: { id }, include: { essay: { select: { userId: true } } } });
    if (!v) throw new NotFoundException("Ovozli izoh topilmadi");
    let owner = v.essay?.userId;
    if (!owner && v.attemptId) owner = (await this.prisma.attempt.findUnique({ where: { id: v.attemptId }, select: { userId: true } }))?.userId;
    if (owner !== user.sub && !STAFF_ROLES.includes(user.role)) throw new ForbiddenException("Ruxsat yo'q");
    const rel = v.m4aPath ?? v.originalPath;
    const data = await readFile(this.abs(rel)).catch(() => null);
    if (!data) throw new NotFoundException("Fayl topilmadi");
    return { mime: MIME[rel.split(".").pop() ?? ""] ?? "application/octet-stream", data };
  }

  private abs(rel: string) {
    const p = resolve(join(this.root, rel));
    if (!p.startsWith(join(this.root, "voice") + "/")) throw new Error("bad voice path");
    return p;
  }
}
