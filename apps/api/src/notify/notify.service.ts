import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { ENV, type Env } from "../config/env";
import { redisConnection } from "../media/queue";

export const NOTIFY_QUEUE = "telegram-notify";
/** Xabar ostidagi tugmalar: bosilganda bot data'ni API'ga yuboradi (Telegram chegarasi: 64 bayt) */
export type Keyboard = { text: string; data: string }[][];

export interface NotifyJob {
  chatId: string; // Telegram user id
  text: string; // HTML
  /** Xabar yuborilgach DB'da belgilash uchun (masalan, davomat yozuvi) */
  attendanceId?: string;
  /** Xabar ostidagi Mini App tugmasi */
  button?: { text: string; webAppUrl: string };
  keyboard?: Keyboard;
}

export function createNotifyQueue(redisUrl: string, prefix: string) {
  return new Queue<NotifyJob>(NOTIFY_QUEUE, {
    prefix,
    connection: redisConnection(redisUrl),
    defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 },
  });
}

/** Telegram xabarlarini navbatga qo'yadi. Ularni worker yuboradi (rate limit bilan). */
@Injectable()
export class NotifyService implements OnModuleDestroy {
  private readonly queue;
  private readonly appUrl: string | undefined;
  constructor(@Inject(ENV) env: Env) {
    this.queue = createNotifyQueue(env.REDIS_URL, env.QUEUE_PREFIX);
    this.appUrl = env.MINIAPP_URL?.replace(/\/$/, "");
  }
  async onModuleDestroy() {
    await this.queue.close();
  }
  /** chatId null: o'quvchi hali botga kirmagan (ustoz qo'lda kiritgan), xabar yuborilmaydi */
  async send(chatId: bigint | string | null, text: string, attendanceId?: string) {
    if (chatId === null) return null;
    return this.queue.add("send", { chatId: String(chatId), text, attendanceId });
  }
  /** O'quvchiga xabar va ostida ilovaning kerakli sahifasini ochadigan tugma (MINIAPP_URL bo'lmasa tugmasiz) */
  async sendApp(chatId: bigint | string | null, text: string, path: string, label = "Ilovada ko'rish") {
    return this.sendWithButton(chatId, text, this.appUrl ? { text: label, webAppUrl: `${this.appUrl}${path}` } : undefined);
  }
  async sendKeyboard(chatId: bigint | string | null, text: string, keyboard?: Keyboard) {
    if (chatId === null) return null;
    return this.queue.add("send", { chatId: String(chatId), text, keyboard });
  }
  async sendWithButton(chatId: bigint | string | null, text: string, button?: NotifyJob["button"]) {
    if (chatId === null) return null;
    return this.queue.add("send", { chatId: String(chatId), text, button });
  }
}
