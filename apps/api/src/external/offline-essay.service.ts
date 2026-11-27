import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import {
  OFFLINE_ESSAY_MAX_PAGES,
  type OfflineEssayDetail,
  type OfflineEssayRow,
  type OfflineEssayStatus,
  type OfflineEssayTest,
  type OfflineEssayTestDetail,
} from "@onatili/shared";
import { Prisma } from "@onatili/db";
import { Queue } from "bullmq";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { essayAi } from "../ai/essay/setup";
import { ESSAY_AI_QUEUE, type AnyEssayAiJob } from "../ai/queue";
import { sniffImage } from "../billing/billing.service";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { redisConnection } from "../media/queue";
import { ExternalEssayService } from "./external-essay.service";
import { offlineAiView } from "./offline-essay-runner";

const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
/** AI tekshirmoqda holatida shundan ko'p turib qolsa (vazifa yo'qolgan), qayta yuborish mumkin */
const STUCK_MS = 20 * 60_000;
const fullName = (u: { firstName: string; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ");

/**
 * Offline testning qog'ozdagi essesi: ustoz suratga oladi, AI o'qib taxminiy baho beradi.
 * Yakuniy ball faqat ustoz tasdiqlaganda natijaga yoziladi (ExternalEssayService.set).
 */
@Injectable()
export class OfflineEssayService implements OnModuleDestroy {
  private readonly media: string;
  private readonly queue: Queue<AnyEssayAiJob>;
  constructor(
    private readonly prisma: PrismaService,
    private readonly scores: ExternalEssayService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.media = resolve(env.MEDIA_DIR);
    this.queue = new Queue<AnyEssayAiJob>(ESSAY_AI_QUEUE, {
      prefix: env.QUEUE_PREFIX,
      connection: redisConnection(env.REDIS_URL),
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 10_000 }, removeOnComplete: 500, removeOnFail: 500 },
    });
  }
  async onModuleDestroy() {
    await this.queue.close();
  }

  /** Qo'lyozmani o'qiy oladigan AI sozlanganmi */
  private get aiEnabled() {
    return !!essayAi(this.env)?.read;
  }

  /** Faqat MEDIA_DIR/essays/external ichidagi yo'l */
  private abs(rel: string) {
    const p = resolve(join(this.media, rel));
    if (!p.startsWith(join(this.media, "essays", "external") + "/")) throw new Error("bad offline essay path");
    return p;
  }

  /** Esse qo'shsa bo'ladigan testlar: Milliy shkaladagi (test qismi T-ball bilan) */
  async tests(): Promise<OfflineEssayTest[]> {
    const tests = await this.prisma.externalTest.findMany({
      where: { results: { some: { testScore: { not: null } } } },
      orderBy: [{ takenAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        takenAt: true,
        results: { where: { testScore: { not: null } }, select: { essayScore: true, essay: { select: { status: true, imageUrls: true } } } },
      },
    });
    return tests.map((t) => ({
      id: t.id,
      title: t.title,
      takenAt: t.takenAt?.toISOString() ?? null,
      total: t.results.length,
      withPages: t.results.filter((r) => r.essay?.imageUrls.length).length,
      aiChecked: t.results.filter((r) => r.essay?.status === "CHECKED").length,
      confirmed: t.results.filter((r) => r.essayScore != null).length,
    }));
  }

  async testDetail(testId: string): Promise<OfflineEssayTestDetail> {
    const t = await this.prisma.externalTest.findUnique({
      where: { id: testId },
      select: {
        id: true,
        title: true,
        essayPrompt: true,
        results: {
          where: { testScore: { not: null } },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            essayScore: true,
            student: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
            essay: { select: { status: true, imageUrls: true, ai: true, error: true, updatedAt: true } },
          },
        },
      },
    });
    if (!t) throw new NotFoundException("Test topilmadi");
    const rows: OfflineEssayRow[] = t.results.map((r) => ({
      resultId: r.id,
      name: r.name,
      student: r.student ? { id: r.student.id, name: fullName(r.student.user) } : null,
      status: (r.essay?.status ?? "NONE") as OfflineEssayStatus,
      pages: r.essay?.imageUrls.length ?? 0,
      aiTotal: r.essay?.status === "CHECKED" ? (offlineAiView(r.essay.ai)?.total ?? null) : null,
      essayScore: r.essayScore,
      error: r.essay?.error ?? null,
    }));
    return { id: t.id, title: t.title, essayPrompt: t.essayPrompt, aiEnabled: this.aiEnabled, rows };
  }

  async setPrompt(actorId: string, testId: string, prompt: string) {
    const { count } = await this.prisma.externalTest.updateMany({ where: { id: testId }, data: { essayPrompt: prompt } });
    if (!count) throw new NotFoundException("Test topilmadi");
    await this.audit(actorId, "external.essay.prompt", testId, {});
    return { ok: true };
  }

  private async result(resultId: string) {
    const r = await this.prisma.externalResult.findUnique({
      where: { id: resultId },
      select: { id: true, testId: true, name: true, testScore: true, essayScore: true, essay: true },
    });
    if (!r) throw new NotFoundException("Natija topilmadi");
    if (r.testScore == null) throw new BadRequestException("Bu test Milliy sertifikat shkalasida emas: esse qo'shib bo'lmaydi");
    return r;
  }

  /** Varoq qo'shish yoki olib tashlash avvalgi AI bahosini eskirtiradi: qayta tekshirish kerak bo'ladi */
  private static readonly RESET = { status: "DRAFT" as const, text: null, ai: Prisma.DbNull, error: null, aiError: null, prompt: null };

  async addPage(resultId: string, body: unknown): Promise<OfflineEssayDetail> {
    if (!Buffer.isBuffer(body) || !body.length) throw new BadRequestException("Rasm yuboring");
    const ext = sniffImage(body);
    if (!ext) throw new BadRequestException("Faqat rasm (JPG, PNG, WEBP) qabul qilinadi");
    const r = await this.result(resultId);
    if (r.essay?.status === "CHECKING") throw new ConflictException("AI tekshirayotganda varoq qo'shib bo'lmaydi");
    if ((r.essay?.imageUrls.length ?? 0) >= OFFLINE_ESSAY_MAX_PAGES) throw new ConflictException(`Ko'pi bilan ${OFFLINE_ESSAY_MAX_PAGES} ta varoq`);
    const rel = `essays/external/${r.testId}/${r.id}/${Date.now()}.${ext}`;
    await mkdir(dirname(this.abs(rel)), { recursive: true });
    await writeFile(this.abs(rel), body);
    await this.prisma.externalEssay.upsert({
      where: { resultId },
      create: { resultId, imageUrls: [rel] },
      update: { ...OfflineEssayService.RESET, imageUrls: { push: rel } },
    });
    return this.detail(resultId);
  }

  async removePage(resultId: string, n: number): Promise<OfflineEssayDetail> {
    const r = await this.result(resultId);
    const rel = r.essay?.imageUrls[n];
    if (!r.essay || !rel) throw new NotFoundException("Varoq topilmadi");
    if (r.essay.status === "CHECKING") throw new ConflictException("AI tekshirayotganda varoqni o'chirib bo'lmaydi");
    await this.prisma.externalEssay.update({
      where: { resultId },
      data: { ...OfflineEssayService.RESET, imageUrls: r.essay.imageUrls.filter((_, i) => i !== n) },
    });
    await rm(this.abs(rel), { force: true });
    return this.detail(resultId);
  }

  async page(resultId: string, n: number) {
    const e = await this.prisma.externalEssay.findUnique({ where: { resultId }, select: { imageUrls: true } });
    const rel = e?.imageUrls[n];
    const data = rel ? await readFile(this.abs(rel)).catch(() => null) : null;
    if (!data) throw new NotFoundException("Varoq topilmadi");
    return { mime: MIME[sniffImage(data) ?? "jpg"], data };
  }

  async detail(resultId: string): Promise<OfflineEssayDetail> {
    const r = await this.result(resultId);
    const e = r.essay;
    return {
      resultId: r.id,
      testId: r.testId,
      name: r.name,
      status: (e?.status ?? "NONE") as OfflineEssayStatus,
      pages: e?.imageUrls.length ?? 0,
      text: e?.text ?? null,
      prompt: e?.prompt ?? null,
      ai: e?.status === "CHECKED" ? offlineAiView(e.ai) : null,
      error: e?.error ?? null,
      essayScore: r.essayScore,
    };
  }

  /**
   * AI'ga yuborish. resultIds bo'sh: varog'i bor, hali tekshirilmagan (yoki xato bergan) hammasi.
   * Tanlanganlar berilsa, avval tekshirilgani ham qayta tekshiriladi.
   */
  async check(actorId: string, testId: string, resultIds: string[]) {
    if (!this.aiEnabled) throw new ConflictException("AI tekshiruvi hozircha o'chirilgan");
    const t = await this.prisma.externalTest.findUnique({ where: { id: testId }, select: { essayPrompt: true } });
    if (!t) throw new NotFoundException("Test topilmadi");
    if (!t.essayPrompt) throw new BadRequestException("Avval esse mavzusini (vaziyat matnini) yozing");
    const stuck = new Date(Date.now() - STUCK_MS);
    const essays = await this.prisma.externalEssay.findMany({
      where: {
        result: { testId, testScore: { not: null } },
        imageUrls: { isEmpty: false },
        ...(resultIds.length
          ? { resultId: { in: resultIds }, OR: [{ status: { not: "CHECKING" } }, { updatedAt: { lt: stuck } }] }
          : { OR: [{ status: { in: ["DRAFT", "FAILED"] } }, { status: "CHECKING", updatedAt: { lt: stuck } }] }),
      },
      select: { id: true },
    });
    if (!essays.length) return { queued: 0 };
    const ids = essays.map((e) => e.id);
    await this.prisma.externalEssay.updateMany({
      where: { id: { in: ids } },
      data: { status: "CHECKING", prompt: t.essayPrompt, ai: Prisma.DbNull, error: null, aiError: null },
    });
    try {
      await this.queue.addBulk(ids.map((id) => ({ name: "external", data: { externalEssayId: id }, opts: { jobId: `ext-${id}-${Date.now()}` } })));
    } catch {
      await this.prisma.externalEssay.updateMany({
        where: { id: { in: ids }, status: "CHECKING" },
        data: { status: "FAILED", error: "Hozir tekshiruvga yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring." },
      });
      throw new ServiceUnavailableException("Hozir AI tekshiruviga yuborib bo'lmadi, birozdan keyin qayta urinib ko'ring");
    }
    await this.audit(actorId, "external.essay.ai", testId, { count: ids.length });
    return { queued: ids.length };
  }

  /** Ustoz tasdiqlaydi: ball natijaga yoziladi. AI taxmini audit'da qoladi (AI va ustoz farqini keyin o'lchash uchun) */
  async confirm(actorId: string, resultId: string, score: number) {
    const r = await this.result(resultId);
    const ai = r.essay?.status === "CHECKED" ? (offlineAiView(r.essay.ai)?.total ?? null) : null;
    await this.scores.set(actorId, r.testId, [{ resultId, score }]);
    await this.audit(actorId, "external.essay.confirm", r.testId, { resultId, score, ai });
    return this.detail(resultId);
  }

  /** Test o'chirilganda varoq rasmlari ham o'chadi */
  removeFiles(testId: string) {
    return rm(dirname(this.abs(`essays/external/${testId}/x`)), { recursive: true, force: true });
  }

  private audit(actorId: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({ data: { actorId, action, entity: "ExternalTest", entityId, meta } });
  }
}
