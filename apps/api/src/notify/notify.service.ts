import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { ENV, type Env } from "../config/env";
import { redisConnection } from "../media/queue";

export const NOTIFY_QUEUE = "telegram-notify";
export interface NotifyJob {
  chatId: string; // Telegram user id
  text: string; // HTML
  /** Xabar yuborilgach DB'da belgilash uchun (masalan, davomat yozuvi) */
  attendanceId?: string;
  /** Xabar ostidagi Mini App tugmasi */
  button?: { text: string; webAppUrl: string };
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
  constructor(@Inject(ENV) env: Env) {
    this.queue = createNotifyQueue(env.REDIS_URL, env.QUEUE_PREFIX);
  }
  async onModuleDestroy() {
    await this.queue.close();
  }
  /** chatId null: o'quvchi hali botga kirmagan (ustoz qo'lda kiritgan), xabar yuborilmaydi */
  async send(chatId: bigint | string | null, text: string, attendanceId?: string) {
    if (chatId === null) return null;
    return this.queue.add("send", { chatId: String(chatId), text, attendanceId });
  }
  async sendWithButton(chatId: bigint | string | null, text: string, button?: NotifyJob["button"]) {
    if (chatId === null) return null;
    return this.queue.add("send", { chatId: String(chatId), text, button });
  }
}
