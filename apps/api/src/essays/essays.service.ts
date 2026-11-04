import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@onatili/db";
import {
  AI_ESSAY_DAILY_LIMIT,
  ESSAY_MAX_SCORE,
  ESSAY_SPECIAL,
  rubricScore,
  type EssaySpecialKey,
  MAX_ESSAY_PAGES,
  STAFF_ROLES,
  type AdminHwEssay,
  type CreateEssayInput,
  type EssayConfig,
  type EssayReviewView,
  type MyEssayDetail,
  type MyEssaySummary,
  type RoleName,
  type TeacherEssayReviewInput,
} from "@onatili/shared";
import { Queue } from "bullmq";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ESSAY_AI_QUEUE, type EssayAiJob } from "../ai/queue";
import { BillingService, sniffImage } from "../billing/billing.service";
import { ENV, type Env } from "../config/env";
import { redisConnection } from "../media/queue";
import { NotifyService } from "../notify/notify.service";
import { esc } from "../notify/telegram";
import { PrismaService } from "../prisma/prisma.service";

const ESSAY_KEY = "essay";
const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
const fullName = (u: { firstName: string; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ");
/** Toshkent vaqti bo'yicha bugun boshlangan payt (UTC) */
const tashkentDayStart = (now = new Date()) => new Date(new Date(now.getTime() + 5 * 3600_000).toISOString().slice(0, 10) + "T00:00:00+05:00");

const reviewInclude = { reviews: { orderBy: { createdAt: "asc" as const }, include: { reviewer: { select: { firstName: true, lastName: true } } } } };
type EssayWithReviews = Prisma.EssayGetPayload<{ include: typeof reviewInclude }>;

export function toReviewView(r: EssayWithReviews["reviews"][number]): EssayReviewView {
  return {
    source: r.source,
    reviewer: r.reviewer ? fullName(r.reviewer) : null,
    criteria: r.criteria as EssayReviewView["criteria"],
    totalScore: r.totalScore,
    maxScore: ESSAY_MAX_SCORE,
    feedback: r.feedback,
    mistakes: (r.mistakes ?? []) as EssayReviewView["mistakes"],
    special: r.special && r.special in ESSAY_SPECIAL ? { key: r.special, label: ESSAY_SPECIAL[r.special as EssaySpecialKey].label } : null,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Erkin esse: AI (bepul, matn, kuniga 2 ta) yoki ustoz (pullik, qo'lyozma rasmlari).
 * Ustoz tekshiruvi to'lovi mavjud chek oqimi orqali o'tadi (Payment.essayId).
 */
@Injectable()
export class EssaysService implements OnModuleDestroy {
  private readonly mediaRoot: string;
  private readonly queue: Queue<EssayAiJob>;
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly billing: BillingService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.mediaRoot = resolve(env.MEDIA_DIR);
    this.queue = new Queue<EssayAiJob>(ESSAY_AI_QUEUE, {
      prefix: env.QUEUE_PREFIX,
      connection: redisConnection(env.REDIS_URL),
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 10_000 }, removeOnComplete: 500, removeOnFail: 500 },
    });
  }
  async onModuleDestroy() {
    await this.queue.close();
  }

  private get aiEnabled() {
    return this.env.AI_PROVIDER === "deepseek" && !!this.env.DEEPSEEK_API_KEY;
  }
  private get aiPhotoEnabled() {
    return this.aiEnabled && !!this.env.GEMINI_API_KEY;
  }

  // ---------------- Sozlama: ustoz tekshiruvi narxi ----------------

  async teacherPrice(): Promise<number | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: ESSAY_KEY } });
    const p = (row?.value as { priceUzs?: number } | undefined)?.priceUzs;
    return p && p > 0 ? p : null;
  }

  async setTeacherPrice(actorId: string, priceUzs: number | null) {
    const value = { priceUzs };
    await this.prisma.appSetting.upsert({ where: { key: ESSAY_KEY }, create: { key: ESSAY_KEY, value }, update: { value } });
    await this.prisma.auditLog.create({ data: { actorId, action: "essay.price", entity: "AppSetting", entityId: ESSAY_KEY, meta: value } });
    return { priceUzs };
  }

  // ---------------- O'quvchi ----------------

  private aiUsedToday(userId: string) {
    // Qoralama va muvaffaqiyatsiz tekshiruvlar hisoblanmaydi
    return this.prisma.essay.count({ where: { userId, mode: "AI", status: { notIn: ["AI_FAILED", "DRAFT"] }, createdAt: { gte: tashkentDayStart() } } });
  }

  async config(userId: string): Promise<EssayConfig> {
    const [used, price, card, me] = await Promise.all([
      this.aiUsedToday(userId),
      this.teacherPrice(),
      this.billing.card(),
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    ]);
    const staff = !!me && STAFF_ROLES.includes(me.role);
    return {
      aiEnabled: this.aiEnabled,
      aiPhotoEnabled: this.aiPhotoEnabled,
      aiDailyLimit: AI_ESSAY_DAILY_LIMIT,
      aiUsedToday: used,
      teacherPriceUzs: price && card ? price : null,
      card,
      staffPreview: staff,
    };
  }

  async list(userId: string): Promise<MyEssaySummary[]> {
    const rows = await this.prisma.essay.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50, include: reviewInclude });
    return rows.map((e) => this.summary(e));
  }

  async create(userId: string, d: CreateEssayInput): Promise<MyEssayDetail> {
    if (d.mode === "AI") {
      if (!this.aiEnabled) throw new ConflictException("AI tekshiruvi hozircha o'chirilgan");
      await this.assertAiLimit(userId);
      if (!d.text) {
        // Qo'lyozma: avval varoq rasmlari yuklanadi, keyin "finish"
        if (!this.aiPhotoEnabled) throw new ConflictException("AI hozircha faqat yozilgan matnni tekshira oladi");
        await this.assertFewDrafts(userId);
        const e = await this.prisma.essay.create({ data: { userId, mode: "AI", prompt: d.prompt, status: "DRAFT" } });
        return this.detail(userId, e.id);
      }
      const e = await this.prisma.essay.create({ data: { userId, mode: "AI", prompt: d.prompt, text: d.text, status: "AI_CHECKING" } });
      await this.enqueue(e.id);
      return this.detail(userId, e.id);
    }
    const price = await this.teacherPrice();
    const author = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    const staff = !!author && STAFF_ROLES.includes(author.role);
    if (!staff && (!price || !(await this.billing.card()))) throw new ConflictException("Ustoz tekshiruvi hali yoqilmagan");
    await this.assertFewDrafts(userId);
    const e = await this.prisma.essay.create({ data: { userId, mode: "TEACHER", prompt: d.prompt, text: d.text, priceUzs: price, status: "DRAFT" } });
    return this.detail(userId, e.id);
  }

  async addPage(userId: string, id: string, body: unknown): Promise<MyEssayDetail> {
    if (!Buffer.isBuffer(body) || !body.length) throw new BadRequestException("Rasm yuboring");
    const ext = sniffImage(body);
    if (!ext) throw new BadRequestException("Faqat rasm (JPG, PNG, WEBP) qabul qilinadi");
    const e = await this.own(userId, id);
    if (e.status !== "DRAFT" || (e.mode === "AI" && e.text)) throw new ConflictException("Bu essega rasm qo'shib bo'lmaydi");
    if (e.imageUrls.length >= MAX_ESSAY_PAGES) throw new ConflictException(`Ko'pi bilan ${MAX_ESSAY_PAGES} ta varoq`);
    const rel = `essays/${id}/${Date.now()}.${ext}`;
    await mkdir(dirname(this.abs(rel)), { recursive: true });
    await writeFile(this.abs(rel), body);
    // Bir vaqtda ikki rasm kelsa ham ikkalasi saqlanadi (push)
    await this.prisma.essay.update({ where: { id }, data: { imageUrls: { push: rel } } });
    return this.detail(userId, id);
  }

  async removePage(userId: string, id: string, n: number): Promise<MyEssayDetail> {
    const e = await this.own(userId, id);
    if (e.status !== "DRAFT") throw new ConflictException("Yuborilgan essedan rasm o'chirib bo'lmaydi");
    const rel = e.imageUrls[n];
    if (!rel) throw new NotFoundException("Varoq topilmadi");
    // Shartli yangilash: shu orada boshqa rasm qo'shilgan bo'lsa, u yo'qolib ketmasin
    const { count } = await this.prisma.essay.updateMany({
      where: { id, status: "DRAFT", imageUrls: { equals: e.imageUrls } },
      data: { imageUrls: e.imageUrls.filter((_, i) => i !== n) },
    });
    if (!count) throw new ConflictException("Rasmlar o'zgardi, sahifani yangilab qayta urinib ko'ring");
    await rm(this.abs(rel), { force: true });
    return this.detail(userId, id);
  }

  /** Rasmlar yuklandi: AI bo'lsa tekshiruvga, ustoz bo'lsa to'lovga */
  async finish(userId: string, id: string): Promise<MyEssayDetail> {
    const e = await this.own(userId, id);
    if (e.status !== "DRAFT") throw new ConflictException("Esse allaqachon yuborilgan");
    if (!e.imageUrls.length) throw new BadRequestException("Kamida bitta varoq rasmini yuklang");
    if (e.mode === "AI") {
      if (!this.aiPhotoEnabled) throw new ConflictException("AI hozircha qo'lyozmani o'qiy olmaydi");
      await this.assertAiLimit(userId);
      // Limit bugun yuborilganlar bo'yicha: qoralama yaratilgan kun emas
      await this.prisma.essay.update({ where: { id }, data: { status: "AI_CHECKING", createdAt: new Date() } });
      await this.enqueue(id);
      return this.detail(userId, id);
    }
    // Xodim sinab ko'rayotgan bo'lsa: to'lovsiz, to'g'ridan-to'g'ri ustoz navbatiga
    const author = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    const staff = !!author && STAFF_ROLES.includes(author.role);
    await this.prisma.essay.update({ where: { id }, data: { status: staff ? "SUBMITTED" : "AWAITING_PAYMENT" } });
    return this.detail(userId, id);
  }

  private async assertAiLimit(userId: string) {
    if ((await this.aiUsedToday(userId)) >= AI_ESSAY_DAILY_LIMIT)
      throw new ConflictException(`Bugungi bepul AI tekshiruvlar tugadi (kuniga ${AI_ESSAY_DAILY_LIMIT} ta). Ertaga yana urinib ko'ring yoki ustozga yuboring.`);
  }

  /** Tugallanmagan qoralamalar to'planib qolmasin */
  private async assertFewDrafts(userId: string) {
    if ((await this.prisma.essay.count({ where: { userId, status: "DRAFT" } })) >= 3) throw new ConflictException("Avval tugallanmagan esselaringizni yuboring yoki o'chiring");
  }

  async retry(userId: string, id: string): Promise<MyEssayDetail> {
    const e = await this.own(userId, id);
    // AI_CHECKING'da 20 daqiqadan ko'p turib qolgan bo'lsa ham (vazifa yo'qolgan) qayta yuborish mumkin
    const stuck = e.status === "AI_CHECKING" && Date.now() - e.updatedAt.getTime() > 20 * 60_000;
    if (e.status !== "AI_FAILED" && !stuck) throw new ConflictException("Qayta tekshirish kerak emas");
    if (!this.aiEnabled || (!e.text && !this.aiPhotoEnabled)) throw new ConflictException("AI tekshiruvi hozircha o'chirilgan");
    // Qayta urinish ham kunlik limitga kiradi: aks holda eski muvaffaqiyatsiz esselar orqali limit chetlab o'tiladi
    if (e.status === "AI_FAILED") await this.assertAiLimit(userId);
    await this.prisma.essay.update({ where: { id }, data: { status: "AI_CHECKING", error: null, createdAt: new Date() } });
    await this.enqueue(id, `${id}-${Date.now()}`);
    return this.detail(userId, id);
  }

  /** Navbatga qo'yib bo'lmasa (Redis uzilgan), esse "AI tekshirmoqda"da qotib qolmasin: qayta urinish mumkin bo'lsin */
  private async enqueue(essayId: string, jobId = essayId) {
    try {
      await this.queue.add("grade", { essayId }, { jobId });
    } catch {
      await this.prisma.essay.updateMany({ where: { id: essayId, status: "AI_CHECKING" }, data: { status: "AI_FAILED", error: "Hozir tekshiruvga yuborib bo'lmadi. Birozdan keyin «Qayta urinish»ni bosing." } });
      throw new ServiceUnavailableException("Hozir AI tekshiruviga yuborib bo'lmadi, birozdan keyin qayta urinib ko'ring");
    }
  }

  async remove(userId: string, id: string) {
    const e = await this.own(userId, id);
    const pending = await this.prisma.payment.count({ where: { essayId: id, status: { in: ["PENDING", "APPROVED"] } } });
    if (!["DRAFT", "AWAITING_PAYMENT", "AI_FAILED"].includes(e.status) || pending) throw new ConflictException("Bu esseni o'chirib bo'lmaydi");
    await this.prisma.essay.delete({ where: { id } });
    await rm(join(this.mediaRoot, "essays", id), { recursive: true, force: true });
    return { ok: true };
  }

  async detail(userId: string, id: string): Promise<MyEssayDetail> {
    const e = await this.prisma.essay.findFirst({ where: { id, userId }, include: { ...reviewInclude, payment: true } });
    if (!e) throw new NotFoundException("Esse topilmadi");
    const p = e.payment;
    return {
      ...this.summary(e),
      text: e.text,
      pages: e.imageUrls.length,
      priceUzs: e.priceUzs,
      error: e.status === "AI_FAILED" ? (e.error ?? "AI hozir javob bermadi. Birozdan keyin qayta urinib ko'ring.") : null,
      payment: p ? { id: p.id, planName: "Esse tekshiruvi", amountUzs: p.amountUzs, status: p.status, reviewNote: p.reviewNote, createdAt: p.createdAt.toISOString() } : null,
      reviews: e.reviews.map(toReviewView),
    };
  }

  /** Varoq rasmi: egasi yoki xodim */
  async page(user: { sub: string; role: RoleName }, id: string, n: number): Promise<{ mime: string; data: Buffer }> {
    const e = await this.prisma.essay.findUnique({ where: { id }, select: { userId: true, imageUrls: true } });
    if (!e) throw new NotFoundException("Esse topilmadi");
    if (e.userId !== user.sub && !STAFF_ROLES.includes(user.role)) throw new ForbiddenException("Ruxsat yo'q");
    const rel = e.imageUrls[n];
    const data = rel ? await readFile(this.abs(rel)).catch(() => null) : null;
    if (!data) throw new NotFoundException("Varoq topilmadi");
    return { mime: MIME[sniffImage(data) ?? "jpg"], data };
  }

  // ---------------- Ustoz / yordamchi ----------------

  async adminList(status: "pending" | "reviewed"): Promise<AdminHwEssay[]> {
    const rows = await this.prisma.essay.findMany({
      where: status === "pending" ? { mode: "TEACHER", status: "SUBMITTED" } : { mode: "TEACHER", status: "REVIEWED" },
      orderBy: status === "pending" ? { updatedAt: "asc" } : { updatedAt: "desc" },
      take: status === "pending" ? 200 : 100,
      include: { ...reviewInclude, user: { select: { id: true, firstName: true, lastName: true, username: true, phone: true } } },
    });
    return rows.map((e) => ({
      id: e.id,
      student: { id: e.user.id, name: fullName(e.user), username: e.user.username, phone: e.user.phone },
      mode: e.mode,
      prompt: e.prompt,
      text: e.text,
      pages: e.imageUrls.length,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
      reviews: e.reviews.map(toReviewView),
    }));
  }

  async review(actorId: string, id: string, d: TeacherEssayReviewInput) {
    const e = await this.prisma.essay.findUnique({ where: { id }, include: { user: { select: { telegramId: true } } } });
    if (!e || e.mode !== "TEACHER") throw new NotFoundException("Esse topilmadi");
    if (e.status !== "SUBMITTED" && e.status !== "REVIEWED") throw new ConflictException("Esse hali to'lanmagan");
    // Rasmiy mezon: 12 band (har biri 0..2) yoki maxsus holat (2 yoki 0 ball)
    if (!d.special && !d.criteria.length) throw new BadRequestException("Mezonning 12 bandi bo'yicha ball qo'ying");
    const r = rubricScore(d.special, d.criteria);
    const criteria = r.criteria.map((c) => ({ ...c, comment: d.criteria.find((x) => x.key === c.key)?.comment || null }));
    const total = r.total;
    const first = e.status === "SUBMITTED";
    await this.prisma.$transaction([
      // Qayta baholansa: eski ustoz bahosi almashtiriladi
      this.prisma.essayReview.deleteMany({ where: { essayId: id, source: "TEACHER" } }),
      this.prisma.essayReview.create({ data: { essayId: id, source: "TEACHER", reviewerId: actorId, criteria, special: d.special, totalScore: total, feedback: d.feedback } }),
      this.prisma.essay.update({ where: { id }, data: { status: "REVIEWED" } }),
    ]);
    await this.prisma.auditLog.create({ data: { actorId, action: "essay.review", entity: "Essay", entityId: id, meta: { total } } });
    await this.notify.sendWithButton(
      e.user.telegramId,
      `📝 <b>Essengiz ${first ? "tekshirildi" : "qayta baholandi"}</b>\n«${esc(e.prompt.slice(0, 80))}»\nBall: <b>${total} / ${ESSAY_MAX_SCORE}</b>`,
      this.env.MINIAPP_URL ? { text: "Natijani ko'rish", webAppUrl: `${this.env.MINIAPP_URL.replace(/\/$/, "")}/essays/${id}` } : undefined,
    );
    return { totalScore: total };
  }

  // ---------------- Yordamchilar ----------------

  private summary(e: EssayWithReviews): MyEssaySummary {
    // Ustoz bahosi bo'lsa u, aks holda AI bahosi
    const r = [...e.reviews].sort((a, b) => Number(a.source === "TEACHER") - Number(b.source === "TEACHER")).pop();
    return { id: e.id, mode: e.mode, prompt: e.prompt, status: e.status, score: r ? { total: r.totalScore, max: ESSAY_MAX_SCORE } : null, createdAt: e.createdAt.toISOString() };
  }

  private async own(userId: string, id: string) {
    const e = await this.prisma.essay.findFirst({ where: { id, userId } });
    if (!e) throw new NotFoundException("Esse topilmadi");
    return e;
  }

  private abs(rel: string) {
    const p = resolve(join(this.mediaRoot, rel));
    if (!p.startsWith(join(this.mediaRoot, "essays") + "/")) throw new Error("bad essay path");
    return p;
  }
}
