import { Queue } from "bullmq";

export const VIDEO_QUEUE = "video-transcode";
export interface TranscodeJob {
  videoId: string;
}

export function redisConnection(url: string) {
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined, maxRetriesPerRequest: null };
}

/** prefix: testlar va production bitta Redis'da bo'lsa ham navbatlar aralashmasligi uchun */
export function createVideoQueue(redisUrl: string, prefix: string) {
  return new Queue<TranscodeJob>(VIDEO_QUEUE, {
    prefix,
    connection: redisConnection(redisUrl),
    defaultJobOptions: { attempts: 2, backoff: { type: "fixed", delay: 30_000 }, removeOnComplete: 100, removeOnFail: 100 },
  });
}
