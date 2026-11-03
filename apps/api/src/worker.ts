/**
 * Video worker: navbatdan vazifa oladi va ffmpeg bilan shifrlangan HLS yasaydi.
 * Alohida jarayon (konteyner): API'ni og'ir ffmpeg ishi sekinlashtirmasligi uchun.
 */
import { PrismaClient } from "@onatili/db";
import { Worker } from "bullmq";
import { rm } from "node:fs/promises";
import { loadEnv } from "./config/env";
import { MediaPaths } from "./media/paths";
import { VIDEO_QUEUE, redisConnection, type TranscodeJob } from "./media/queue";
import { transcode } from "./media/transcode";

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

const shutdown = async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
