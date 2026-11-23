import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import type { Announcement } from "@onatili/db";
import {
  ANNOUNCE_RECALL_MS,
  announceAudience,
  announceInput,
  announceSendInput,
  type AnnounceDetail,
  type AnnounceInput,
  type AnnounceRow,
  type AnnounceStats,
} from "@onatili/shared";
import { Queue } from "bullmq";
import { parse } from "../admin/zod";
import { ENV, type Env } from "../config/env";
import { redisConnection } from "../media/queue";
import { NotifyService } from "../notify/notify.service";
import { downloadTelegramFile, uploadTelegramPhoto } from "../notify/telegram";
import { PrismaService } from "../prisma/prisma.service";
import { ANNOUNCE_QUEUE, buildJob, enqueuePending, type AnnounceJob } from "./announce-runner";
import { audienceLabel, previewOf, readAudience, resolveAudience } from "./audience";

const EMPTY: AnnounceStats = { total: 0, pending: 0, sent: 0, failed: 0, blocked: 0, deleted: 0 };
const iso = (d: Date | null) => d?.toISOString() ?? null;
const PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"];

@Injectable()
export class AnnounceService implements OnModuleDestroy {
  private readonly queue: Queue<AnnounceJob>;
  private readonly appUrl: string | undefined;
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.queue = new Queue<AnnounceJob>(ANNOUNCE_QUEUE, {
      prefix: env.QUEUE_PREFIX,
      connection: redisConnection(env.REDIS_URL),
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 10_000 }, removeOnComplete: 200, removeOnFail: 200 },
    });
    this.appUrl = env.MINIAPP_URL?.replace(/\/$/, "");
  }
  async onModuleDestroy() {
    await this.queue.close();
  }

  private async stats(ids: string[]) {
    const rows = await this.prisma.announcementRecipient.groupBy({ by: ["announcementId", "status"], where: { announcementId: { in: ids } }, _count: true });
    const del = await this.prisma.announcementRecipient.groupBy({
      by: ["announcementId"],
      where: { announcementId: { in: ids }, deletedAt: { not: null } },
      _count: true,
    });
    const m = new Map<string, AnnounceStats>();
    for (const r of rows) {
      const s = m.get(r.announcementId) ?? { ...EMPTY };
      s[r.status.toLowerCase() as "pending"] += r._count;
      s.total += r._count;
      m.set(r.announcementId, s);
    }
    for (const r of del) (m.get(r.announcementId) ?? EMPTY).deleted = r._count;
    return m;
  }

  private async rows(list: (Announcement & { author: { firstName: string } | null })[]): Promise<AnnounceRow[]> {
    const stats = await this.stats(list.map((a) => a.id));
    const groups = new Map((await this.prisma.group.findMany({ select: { id: true, name: true } })).map((g) => [g.id, g.name]));
    return list.map((a) => {
      const audience = readAudience(a.audience);
      return {
        id: a.id,
        title: a.title,
        text: a.text,
        hasPhoto: !!a.photoFileId,
        buttonText: a.buttonText,
        status: a.status,
        audience,
        audienceLabel: audienceLabel(audience, groups),
        scheduledAt: iso(a.scheduledAt),
        sentAt: iso(a.sentAt),
        recalledAt: iso(a.recalledAt),
        createdAt: a.createdAt.toISOString(),
        author: a.author?.firstName ?? null,
        stats: stats.get(a.id) ?? { ...EMPTY },
      };
    });
  }

  async list() {
    const list = await this.prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { author: { select: { firstName: true } } } });
    return this.rows(list);
  }

  private async load(id: string) {
    const a = await this.prisma.announcement.findUnique({ where: { id }, include: { author: { select: { firstName: true } } } });
    if (!a) throw new NotFoundException("E'lon topilmadi");
    return a;
  }

  async detail(id: string): Promise<AnnounceDetail> {
    const a = await this.load(id);
    const [row] = await this.rows([a]);
    const recipients = await this.prisma.announcementRecipient.findMany({
      where: { announcementId: id },
      include: { user: { select: { firstName: true, lastName: true, username: true } } },
      orderBy: [{ status: "asc" }, { user: { firstName: "asc" } }],
    });
    const canRecall =
      a.status === "SENT" && !a.recalledAt && !!a.sentAt && Date.now() - a.sentAt.getTime() < ANNOUNCE_RECALL_MS && row.stats.sent > row.stats.deleted;
    return {
      ...row,
      photoFileId: a.photoFileId,
      buttonUrl: a.buttonUrl,
      silent: a.silent,
      canRecall,
      recipients: recipients.map((r) => ({
        id: r.id,
        userId: r.userId,
        name: [r.user.firstName, r.user.lastName].filter(Boolean).join(" "),
        username: r.user.username,
        role: r.role,
        status: r.status,
        error: r.error,
        sentAt: iso(r.sentAt),
        deleted: !!r.deletedAt,
      })),
    };
  }

  async preview(body: unknown) {
    const audience = parse(announceAudience, (body as { audience?: unknown })?.audience ?? body);
    return previewOf(await resolveAudience(this.prisma, audience));
  }

  private data(d: AnnounceInput) {
    return {
      title: d.title || null,
      text: d.text,
      photoFileId: d.photoFileId || null,
      buttonText: d.buttonText || null,
      buttonUrl: d.buttonUrl || null,
      silent: d.silent,
      audience: d.audience,
    };
  }

  async create(authorId: string, body: unknown) {
    const a = await this.prisma.announcement.create({ data: { ...this.data(parse(announceInput, body)), authorId } });
    return this.detail(a.id);
  }

  async update(id: string, body: unknown) {
    const a = await this.load(id);
    if (a.status === "SENT") throw new ConflictException("Yuborilgan e'lonni o'zgartirib bo'lmaydi. Nusxa oling.");
    await this.prisma.announcement.update({ where: { id }, data: this.data(parse(announceInput, body)) });
    return this.detail(id);
  }

  async duplicate(authorId: string, id: string) {
    const a = await this.load(id);
    const copy = await this.prisma.announcement.create({
      data: {
        authorId,
        title: a.title,
        text: a.text,
        photoFileId: a.photoFileId,
        buttonText: a.buttonText,
        buttonUrl: a.buttonUrl,
        silent: a.silent,
        audience: a.audience ?? {},
      },
    });
    return this.detail(copy.id);
  }

  async remove(id: string) {
    const a = await this.load(id);
    if (a.status === "SCHEDULED") await this.queue.remove(id);
    await this.prisma.announcement.delete({ where: { id } });
    return { ok: true };
  }

  /** Hozir yoki belgilangan vaqtda yuborish. Rejalashtirilgan vaqtni o'zgartirish ham shu */
  async send(id: string, body: unknown) {
    const { scheduledAt } = parse(announceSendInput, body);
    const a = await this.load(id);
    if (a.status === "SENT") throw new ConflictException("Bu e'lon allaqachon yuborilgan");
    const at = scheduledAt ? new Date(scheduledAt) : new Date();
    if (at.getTime() > Date.now() + 90 * 86_400_000) throw new BadRequestException("Ko'pi bilan 90 kun oldinga rejalashtirish mumkin");
    const targets = previewOf(await resolveAudience(this.prisma, readAudience(a.audience)));
    if (!targets.reachable) throw new BadRequestException("Tanlangan auditoriyada botga ulangan hech kim yo'q");
    await this.queue.remove(id);
    await this.prisma.announcement.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: at } });
    await this.queue.add("run", { announcementId: id }, { jobId: id, delay: Math.max(0, at.getTime() - Date.now()) });
    return this.detail(id);
  }

  /** Rejalashtirilganni bekor qilish: qoralamaga qaytadi */
  async cancel(id: string) {
    const r = await this.prisma.announcement.updateMany({ where: { id, status: "SCHEDULED" }, data: { status: "DRAFT", scheduledAt: null } });
    if (!r.count) throw new ConflictException("Faqat hali yuborilmagan (rejalashtirilgan) e'lonni bekor qilish mumkin");
    await this.queue.remove(id);
    return this.detail(id);
  }

  /** Yuborilmay qolganlarga (xato) qayta urinish */
  async retry(id: string) {
    const a = await this.load(id);
    if (a.status !== "SENT") throw new ConflictException("E'lon hali yuborilmagan");
    await this.prisma.announcementRecipient.updateMany({ where: { announcementId: id, status: "FAILED" }, data: { status: "PENDING", error: null } });
    return { queued: await enqueuePending(this.prisma, this.notify, this.appUrl, a) };
  }

  /** Yuborilgan xabarlarni hammaning Telegram'idan o'chirish (48 soat ichida) */
  async recall(id: string) {
    const d = await this.detail(id);
    if (!d.canRecall) throw new ConflictException("Qaytarib olib bo'lmaydi: Telegram faqat 48 soat ichida o'chirishga ruxsat beradi");
    const rows = await this.prisma.announcementRecipient.findMany({ where: { announcementId: id, status: "SENT", deletedAt: null, messageId: { not: null } } });
    await this.notify.addBulk(
      rows.map((r) => ({ name: "delete", data: { chatId: String(r.chatId), text: "", deleteMessageId: r.messageId!, recipientId: r.id } })),
    );
    await this.prisma.announcement.update({ where: { id }, data: { recalledAt: new Date() } });
    return { queued: rows.length };
  }

  private async me(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { telegramId: true, firstName: true } });
    if (u.telegramId === null) throw new BadRequestException("Telegram hisobingiz ulanmagan");
    return { chatId: u.telegramId, firstName: u.firstName };
  }

  /** Sinov: xabar faqat ustozning o'ziga boradi (saqlamasdan) */
  async test(userId: string, body: unknown) {
    const d = this.data(parse(announceInput, body));
    const me = await this.me(userId);
    await this.notify.addBulk([{ name: "send", data: buildJob(d, me.chatId, me.firstName, this.appUrl, "🧪 <i>Sinov — faqat sizga</i>\n\n") }]);
    return { ok: true };
  }

  /** Rasm: bir marta ustozning o'ziga yuklanadi (namuna), qaytgan file_id bilan keyin hammaga yuboriladi */
  async uploadPhoto(userId: string, body: unknown, contentType?: string) {
    const mime = (contentType ?? "").split(";")[0].trim();
    if (!Buffer.isBuffer(body) || !PHOTO_MIME.includes(mime)) throw new BadRequestException("Rasm JPG, PNG yoki WEBP bo'lsin");
    const me = await this.me(userId);
    const r = await uploadTelegramPhoto(this.env.BOT_TOKEN, String(me.chatId), body, mime, "🖼 E'lon uchun rasm yuklandi");
    if (!r.ok || !r.fileId) throw new BadGatewayException(`Telegram rasmni qabul qilmadi: ${r.description ?? r.status}`);
    return { fileId: r.fileId };
  }

  async photo(fileId: string) {
    const known = await this.prisma.announcement.count({ where: { photoFileId: fileId } });
    if (!known) throw new NotFoundException();
    const buf = await downloadTelegramFile(this.env.BOT_TOKEN, fileId);
    if (!buf) throw new NotFoundException();
    return buf;
  }
}
