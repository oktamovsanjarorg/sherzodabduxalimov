import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { UPLOAD_CHUNK_BYTES } from "@onatili/shared";
import { Queue } from "bullmq";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signMediaToken } from "../src/media/media-token";
import { MediaPaths } from "../src/media/paths";
import { VIDEO_QUEUE, redisConnection } from "../src/media/queue";
import { OWNER, createApp, login } from "./helpers";

const prisma = new PrismaClient();
const MEDIA = "/tmp/onatili-e2e-media";
const paths = new MediaPaths(MEDIA);
const TG_OWNER = 900000401;
const TG_STUDENT = 900000402;
const P = "e2e-video";

async function cleanup() {
  await prisma.trashItem.deleteMany({ where: { entityId: { startsWith: P } } });
  await prisma.course.deleteMany({ where: { id: `${P}-course` } });
  await prisma.video.deleteMany({ where: { originalName: { startsWith: "e2e-" } } });
  await prisma.user.deleteMany({ where: { telegramId: { in: [BigInt(TG_OWNER), BigInt(TG_STUDENT)] } } });
  await prisma.plan.deleteMany({ where: { id: `${P}-plan` } });
}

describe("Video: yuklash va himoyalangan ko'rish (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let S: Awaited<ReturnType<typeof login>>;
  const req = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, opts: { payload?: unknown; headers?: Record<string, string> } = {}) =>
    app.inject({ method, url: `/api${url}`, headers: opts.headers ?? H, payload: opts.payload as never });
  const chunk = (id: string, offset: number, body: Buffer) =>
    req("PUT", `/admin/videos/${id}/chunk?offset=${offset}`, { payload: body, headers: { ...H, "content-type": "application/octet-stream" } });

  beforeAll(async () => {
    await cleanup();
    await rm(MEDIA, { recursive: true, force: true });
    app = await createApp();
    H = (await login(app, TG_OWNER, "Ega", OWNER)).headers;
    S = await login(app, TG_STUDENT, "Aziz");
    await prisma.user.update({ where: { id: S.userId }, data: { phone: "+998901234567" } });
    await prisma.course.create({
      data: {
        id: `${P}-course`,
        title: "E2E video kurs",
        isPublished: true,
        order: 998,
        topics: { create: { id: `${P}-topic`, title: "Mavzu", lessons: { create: { id: `${P}-lesson`, title: "Video dars", content: "x", isPublished: true } } } },
      },
    });
    await prisma.plan.create({ data: { id: `${P}-plan`, name: "E2E", priceUzs: 1 } });
  });

  afterAll(async () => {
    await cleanup();
    const q = new Queue(VIDEO_QUEUE, { prefix: "onatili-e2e", connection: redisConnection(process.env.REDIS_URL ?? "redis://localhost:6381") });
    await q.obliterate({ force: true });
    await q.close();
    await prisma.$disconnect();
    await app?.close();
  });

  it("o'quvchi video yuklay olmaydi; noto'g'ri fayl turi rad etiladi", async () => {
    expect((await req("POST", "/admin/videos", { payload: { filename: "a.mp4", size: 10 }, headers: S.headers })).statusCode).toBe(403);
    expect((await req("POST", "/admin/videos", { payload: { filename: "virus.exe", size: 10 } })).statusCode).toBe(400);
  });

  it("bo'laklab yuklash: noto'g'ri offset 409 va receivedBytes bilan, oxirgi bo'lakdan keyin PROCESSING", async () => {
    const size = UPLOAD_CHUNK_BYTES + 100;
    const created = (await req("POST", "/admin/videos", { payload: { filename: "e2e-dars.mp4", size } })).json();
    expect(created).toMatchObject({ status: "UPLOADING", receivedBytes: 0, chunkSize: UPLOAD_CHUNK_BYTES });

    const a = Buffer.alloc(UPLOAD_CHUNK_BYTES, 1);
    const b = Buffer.alloc(100, 2);

    const wrong = await chunk(created.id, 500, b);
    expect(wrong.statusCode).toBe(409);
    expect(wrong.json().receivedBytes).toBe(0);

    expect((await chunk(created.id, 0, a)).json().receivedBytes).toBe(UPLOAD_CHUNK_BYTES);
    // Bir xil bo'lak qayta yuborilsa (masalan, tarmoq uzilganda), 409 bilan to'g'ri offset qaytadi
    const dup = await chunk(created.id, 0, a);
    expect(dup.statusCode).toBe(409);
    expect(dup.json().receivedBytes).toBe(UPLOAD_CHUNK_BYTES);

    const done = (await chunk(created.id, UPLOAD_CHUNK_BYTES, b)).json();
    expect(done).toMatchObject({ status: "PROCESSING", receivedBytes: size });

    const file = await readFile(paths.original(created.id));
    expect(file.length).toBe(size);
    expect(file[UPLOAD_CHUNK_BYTES]).toBe(2);
  });

  it("himoyalangan ko'rish: obunasiz yopiq, token bilan pleylist, kalit va segment; soxta token ishlamaydi", async () => {
    // Transcode natijasini qo'lda yasaymiz (ffmpeg bu testda kerak emas)
    const v = await prisma.video.create({
      data: { originalName: "e2e-ready.mp4", sizeBytes: 1n, receivedBytes: 1n, status: "READY", variants: ["720p"], durationSec: 12 },
    });
    await mkdir(paths.variantDir(v.id, "720p"), { recursive: true });
    const key = Buffer.from("0123456789abcdef");
    await writeFile(paths.key(v.id), key);
    await writeFile(
      paths.playlist(v.id, "720p"),
      '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-KEY:METHOD=AES-128,URI="key",IV=0x00\n#EXTINF:6.0,\nseg_0000.ts\n#EXT-X-ENDLIST\n',
    );
    await writeFile(paths.segment(v.id, "720p", "seg_0000.ts"), Buffer.from("ENCRYPTED"));

    // Darsga biriktirib, pullik qilamiz
    const patched = await req("PATCH", `/admin/lessons/${P}-lesson`, { payload: { videoId: v.id, isFree: false } });
    expect(patched.json().video.status).toBe("READY");

    expect((await req("GET", `/lessons/${P}-lesson`, { headers: S.headers })).statusCode).toBe(403);
    await prisma.subscription.create({
      data: { userId: S.userId, planId: `${P}-plan`, startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 86_400_000) },
    });

    const lesson = (await req("GET", `/lessons/${P}-lesson`, { headers: S.headers })).json();
    expect(lesson.video.status).toBe("READY");
    expect(lesson.video.watermark).toContain("Aziz");
    expect(lesson.video.watermark).toContain("+998901234567");
    const hlsUrl: string = lesson.video.hlsUrl;
    expect(hlsUrl).toMatch(/^\/api\/media\/[a-z0-9]+\/master\.m3u8\?t=/);

    // Master pleylist
    const master = await app.inject({ method: "GET", url: hlsUrl });
    expect(master.statusCode).toBe(200);
    expect(master.headers["cache-control"]).toContain("no-store");
    const variantUrl = master.body.split("\n").find((l) => l.includes("720p/index.m3u8"))!;
    expect(variantUrl).toBeTruthy();

    // Variant: kalit URI va segment manzili qayta yozilgan
    const variant = await app.inject({ method: "GET", url: variantUrl });
    expect(variant.statusCode).toBe(200);
    const keyLine = variant.body.split("\n").find((l) => l.startsWith("#EXT-X-KEY"))!;
    const keyUrl = /URI="([^"]+)"/.exec(keyLine)![1];
    expect(keyUrl).toMatch(new RegExp(`^/api/media/${v.id}/key\\?t=`));
    expect(variant.body).toContain(`/api/media-seg/${v.id}/720p/seg_0000.ts`);

    const keyRes = await app.inject({ method: "GET", url: keyUrl });
    expect(keyRes.statusCode).toBe(200);
    expect(keyRes.rawPayload.equals(key)).toBe(true);

    const seg = await app.inject({ method: "GET", url: `/api/media-seg/${v.id}/720p/seg_0000.ts` });
    expect(seg.body).toBe("ENCRYPTED");

    // Tokensiz, soxta, boshqa videoga tegishli va eskirgan tokenlar
    expect((await app.inject({ method: "GET", url: `/api/media/${v.id}/key` })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: `/api/media/${v.id}/key?t=1.2.3` })).statusCode).toBe(403);
    const other = signMediaToken("e2e-secret-e2e-secret", "boshqavideoidboshqavideo", S.userId);
    expect((await app.inject({ method: "GET", url: `/api/media/${v.id}/key?t=${encodeURIComponent(other)}` })).statusCode).toBe(403);
    const old = signMediaToken("e2e-secret-e2e-secret", v.id, S.userId, Date.now() - 4 * 3600_000);
    expect((await app.inject({ method: "GET", url: `/api/media/${v.id}/key?t=${encodeURIComponent(old)}` })).statusCode).toBe(403);

    // Path traversal: kalit faylini segment sifatida o'qib bo'lmaydi
    for (const bad of [`/api/media-seg/${v.id}/720p/..%2F..%2Fenc.key`, `/api/media-seg/${v.id}/..%2F/enc.key`, `/api/media-seg/..%2F..%2Fetc/720p/seg_0000.ts`]) {
      expect((await app.inject({ method: "GET", url: bad })).statusCode).toBe(404);
    }

    // Darsga biriktirilgan videoni o'chirib bo'lmaydi
    expect((await req("DELETE", `/admin/videos/${v.id}`)).statusCode).toBe(409);

    // Dars o'chirilsa korzinkaga tushadi: video tiklash uchun saqlanadi
    expect((await req("DELETE", `/admin/lessons/${P}-lesson`)).statusCode).toBe(200);
    expect(await prisma.video.findUnique({ where: { id: v.id } })).not.toBeNull();
    // Korzinkadan butunlay o'chirilganda video ham bazadan, ham diskdan o'chadi
    const item = await prisma.trashItem.findFirstOrThrow({ where: { entityId: `${P}-lesson` }, orderBy: { createdAt: "desc" } });
    expect(item.videoIds).toEqual([v.id]);
    expect((await req("DELETE", `/admin/trash/${item.id}`)).statusCode).toBe(200);
    expect(await prisma.video.findUnique({ where: { id: v.id } })).toBeNull();
    await expect(readFile(paths.key(v.id))).rejects.toThrow();
  });
});
