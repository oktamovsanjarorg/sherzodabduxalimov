/**
 * Video worker: navbatdan vazifa oladi va ffmpeg bilan shifrlangan HLS yasaydi.
 * Alohida jarayon (konteyner): API'ni og'ir ffmpeg ishi sekinlashtirmasligi uchun.
 */
import { PrismaClient } from "@onatili/db";
import { Queue, Worker } from "bullmq";
import { gradeEssayDeepSeek } from "./ai/deepseek";
import { transcribeHandwriting } from "./ai/gemini";
import { ESSAY_AI_QUEUE, type EssayAiJob } from "./ai/queue";
import { runSubscriptionReminders } from "./billing/reminders";
import { gradeEssayJob, markEssayFailed } from "./essays/ai-runner";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "./config/env";
import { MediaPaths } from "./media/paths";
import { VIDEO_QUEUE, redisConnection, type TranscodeJob } from "./media/queue";
import { transcode } from "./media/transcode";
import { NOTIFY_QUEUE, createNotifyQueue, type NotifyJob } from "./notify/notify.service";
import { sendTelegramMessage } from "./notify/telegram";

const env = loadEnv();
const prisma = new PrismaClient();
const paths = new MediaPaths(env.MEDIA_DIR);
const keepOriginal = process.env.KEEP_ORIGINAL === "true";

const worker = new Worker<TranscodeJob>(
  VIDEO_QUEUE,
  async (job) => {
    const { videoId } = job.data;
    const v = await prisma.video.findUnique({ where: { id: videoId } });
    if (!v) return; // o'chirilgan
    console.log(`[worker] ${videoId} boshlandi: ${v.originalName}`);
    await prisma.video.update({ where: { id: videoId }, data: { status: "PROCESSING", processingPct: 0, error: null } });

    let lastWrite = 0;
    const result = await transcode(paths, videoId, (pct) => {
      // DB'ni har soniyadan tez-tez yangilamaymiz
      if (Date.now() - lastWrite < 3000) return;
      lastWrite = Date.now();
      void prisma.video.update({ where: { id: videoId }, data: { processingPct: pct } }).catch(() => {});
      void job.updateProgress(pct);
    });

    await prisma.video.update({
      where: { id: videoId },
      data: { status: "READY", processingPct: 100, durationSec: result.durationSec, variants: result.variants },
    });
    // Agar darsning davomiyligi kiritilmagan bo'lsa, video davomiyligini qo'yamiz
    await prisma.lesson.updateMany({ where: { videoId, durationSec: null }, data: { durationSec: result.durationSec } });
    if (!keepOriginal) await rm(paths.original(videoId), { force: true });
    console.log(`[worker] ${videoId} tayyor: ${result.variants.join(",")}, ${result.durationSec}s`);
  },
  {
    connection: redisConnection(env.REDIS_URL),
    prefix: env.QUEUE_PREFIX,
    concurrency: 1, // 4 yadroli server: bir vaqtda bitta video
    lockDuration: 120_000,
  },
);

worker.on("failed", async (job, err) => {
  if (!job) return;
  const final = job.attemptsMade >= (job.opts.attempts ?? 1);
  console.error(`[worker] ${job.data.videoId} xato (${job.attemptsMade}-urinish):`, err.message);
  if (final) {
    await prisma.video
      .update({ where: { id: job.data.videoId }, data: { status: "FAILED", error: err.message.slice(0, 500), processingPct: null } })
      .catch(() => {});
  }
});

worker.on("ready", () => console.log(`[worker] tayyor, navbat: ${env.QUEUE_PREFIX}:${VIDEO_QUEUE}`));

/** Telegram xabarlari (davomat, tasdiqlash). Telegram limiti: ~30 xabar/s, biz 20 dan oshirmaymiz. */
const notifier = new Worker<NotifyJob>(
  NOTIFY_QUEUE,
  async (job) => {
    const r = await sendTelegramMessage(env.BOT_TOKEN, job.data.chatId, job.data.text, job.data.button);
    if (r.ok) {
      if (job.data.attendanceId) {
        await prisma.attendance.update({ where: { id: job.data.attendanceId }, data: { notifiedAt: new Date() } }).catch(() => {});
      }
      return;
    }
    // 403: foydalanuvchi botni bloklagan yoki hech qachon /start bosmagan: qayta urinish befoyda
    if (r.status === 403 || r.status === 400) {
      console.warn(`[notify] ${job.data.chatId}: ${r.status} ${r.description}`);
      return;
    }
    throw new Error(`Telegram ${r.status}: ${r.description ?? ""}${r.retryAfter ? ` (retry ${r.retryAfter}s)` : ""}`);
  },
  { connection: redisConnection(env.REDIS_URL), prefix: env.QUEUE_PREFIX, concurrency: 5, limiter: { max: 20, duration: 1000 } },
);
notifier.on("failed", (job, err) => console.error(`[notify] ${job?.data.chatId} xato:`, err.message.replace(/bot\d+:[\w-]+/g, "bot***")));

/** Obuna eslatmalari: har soatda (to'lov jadvali) */
const CRON_QUEUE = "billing-cron";
const notifyQueue = createNotifyQueue(env.REDIS_URL, env.QUEUE_PREFIX);
const cronQueue = new Queue(CRON_QUEUE, { prefix: env.QUEUE_PREFIX, connection: redisConnection(env.REDIS_URL) });
void cronQueue
  .upsertJobScheduler("subscription-reminders", { every: 3600_000 }, { name: "reminders", opts: { removeOnComplete: 50, removeOnFail: 50 } })
  .catch((e) => console.error("[cron] rejalashtirib bo'lmadi:", e.message));
const cron = new Worker(
  CRON_QUEUE,
  async () => {
    const r = await runSubscriptionReminders(
      prisma,
      (chatId, text, button) => notifyQueue.add("send", { chatId: String(chatId), text, button }),
      env.MINIAPP_URL,
    );
    if (r.sent) console.log(`[cron] obuna eslatmalari: ${r.sent} ta yuborildi`);
  },
  { connection: redisConnection(env.REDIS_URL), prefix: env.QUEUE_PREFIX, concurrency: 1 },
);
cron.on("failed", (_job, err) => console.error("[cron] xato:", err.message));

/** AI esse tekshiruvi (DeepSeek). Bir vaqtda 3 ta: API limitlari va xarajat nazorati uchun */
const essayAi = new Worker<EssayAiJob>(
  ESSAY_AI_QUEUE,
  async (job) => {
    if (env.AI_PROVIDER !== "deepseek" || !env.DEEPSEEK_API_KEY) throw new Error("AI o'chirilgan");
    const key = env.DEEPSEEK_API_KEY;
    const total = await gradeEssayJob(
      prisma,
      job.data.essayId,
      (topic, text, handwritten) => gradeEssayDeepSeek({ apiKey: key, model: env.DEEPSEEK_MODEL, topic, text, handwritten }),
      (chatId, text, button) => notifyQueue.add("send", { chatId: String(chatId), text, button }),
      env.MINIAPP_URL,
      env.GEMINI_API_KEY
        ? async (paths) => {
            const root = resolve(env.MEDIA_DIR, "essays");
            const images = await Promise.all(
              paths.map(async (p) => {
                const abs = resolve(env.MEDIA_DIR, p);
                if (!abs.startsWith(root + "/")) throw new Error("bad essay path");
                const data = await readFile(abs);
                return { mime: data[0] === 0x89 ? "image/png" : data[0] === 0x52 ? "image/webp" : "image/jpeg", data };
              }),
            );
            return transcribeHandwriting({ apiKey: env.GEMINI_API_KEY!, model: env.GEMINI_MODEL, images });
          }
        : undefined,
    );
    if (total !== null) console.log(`[essay-ai] ${job.data.essayId}: ${total} ball`);
  },
  { connection: redisConnection(env.REDIS_URL), prefix: env.QUEUE_PREFIX, concurrency: 3, lockDuration: 180_000 },
);
essayAi.on("failed", async (job, err) => {
  if (!job) return;
  console.error(`[essay-ai] ${job.data.essayId} xato (${job.attemptsMade}-urinish):`, err.message);
  if (job.attemptsMade >= (job.opts.attempts ?? 1)) await markEssayFailed(prisma, job.data.essayId, err.message).catch(() => {});
});

const shutdown = async () => {
  await essayAi.close();
  await cron.close();
  await cronQueue.close();
  await notifyQueue.close();
  await notifier.close();
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
