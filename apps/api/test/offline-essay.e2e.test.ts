import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { ESSAY_RUBRIC, ESSAY_SPECIAL, NO_ESSAY_ERROR } from "@onatili/shared";
import { Queue } from "bullmq";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalize } from "../src/ai/deepseek";
import { ESSAY_AI_QUEUE } from "../src/ai/queue";
import { gradeOfflineEssayJob, markOfflineEssayFailed } from "../src/external/offline-essay-runner";
import { redisConnection } from "../src/media/queue";
import { OWNER, createApp, login } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900001301, helper: 900001302, student: 900001303 };
const CODE = "E2E-OFFLINE-ESSAY";
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]);
const MEDIA = process.env.E2E_MEDIA_DIR ?? "/tmp/onatili-e2e-media";
const aiQ = new Queue(ESSAY_AI_QUEUE, { prefix: "onatili-e2e", connection: redisConnection(process.env.REDIS_URL ?? "redis://localhost:6381") });
const ENV_KEYS = ["AI_PROVIDER", "DEEPSEEK_API_KEY", "GEMINI_API_KEY"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const ESSAY = "Ona tilim mening faxrim. Men uni sevaman va asrayman. ".repeat(12);
const bands = (v: number) => Object.fromEntries(ESSAY_RUBRIC.map((c) => [c.key, v]));
const read = async () => ESSAY;
const locate = async () => [];
const grade = async () =>
  normalize({
    special: null,
    criteria: [{ key: "views", score: 1.5, comment: null }],
    feedback: "",
    mistakes: [{ wrong: "asrayman", right: "asrayman.", type: "punctuation", note: null }],
  });

async function cleanup() {
  await prisma.externalTest.deleteMany({ where: { code: CODE } });
  await prisma.user.deleteMany({ where: { telegramId: { in: Object.values(TG).map(BigInt) } } });
}

const result = (testId: string, key: string, testScore: number | null) =>
  prisma.externalResult.create({
    data: { testId, key, name: key, correct: 30, wrong: 10, blank: 0, score: 30, maxScore: 40, percent: 75, answers: "c", testScore },
  });

describe("Offline test essesi: rasm → AI taxminiy baho → ustoz tasdig'i (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let testId = "";
  let r1 = "";
  let r2 = "";
  let r3 = "";
  const req = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object, headers = H) =>
    app.inject({ method, url: `/api${url}`, headers, payload });
  const img = (resultId: string, body = JPEG) =>
    app.inject({ method: "POST", url: `/api/admin/offline-essays/${resultId}/pages`, headers: { ...H, "content-type": "image/jpeg" }, payload: body });
  const essay = () => prisma.externalEssay.findUniqueOrThrow({ where: { resultId: r1 } });

  beforeAll(async () => {
    await cleanup();
    await aiQ.obliterate({ force: true });
    // AI yoqilgan deb turadi; haqiqiy chaqiruv yo'q: worker ishlamaydi, runner soxta funksiyalar bilan chaqiriladi
    Object.assign(process.env, { AI_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "test", GEMINI_API_KEY: "test" });
    app = await createApp();
    H = (await login(app, TG.owner, "Ega", OWNER)).headers;
    testId = (await prisma.externalTest.create({ data: { source: "CSV", code: CODE, title: "E2E Milliy", questionCount: 40 } })).id;
    r1 = (await result(testId, "name:ali", 60)).id;
    r2 = (await result(testId, "name:vali", 50)).id;
    r3 = (await result(testId, "name:oddiy", null)).id;
  });
  afterAll(async () => {
    await cleanup();
    for (const k of ENV_KEYS)
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    await aiQ.close();
    await prisma.$disconnect();
    await app?.close();
  });

  it("ro'yxatda faqat Milliy shkaladagi natijalar; «Esselar» ruxsatisiz yopiq", async () => {
    const t = (await req("GET", "/admin/offline-essays/tests")).json().find((x: { id: string }) => x.id === testId);
    expect(t).toMatchObject({ total: 2, withPages: 0, confirmed: 0 });
    const d = (await req("GET", `/admin/offline-essays/tests/${testId}`)).json();
    expect(d.rows.map((r: { name: string }) => r.name)).toEqual(["name:ali", "name:vali"]);
    expect(d.aiEnabled).toBe(true);

    await login(app, TG.helper, "Yordamchi");
    await prisma.user.update({ where: { telegramId: BigInt(TG.helper) }, data: { role: "ASSISTANT", permissions: ["CONTENT"] } });
    const A = (await login(app, TG.helper, "Yordamchi")).headers;
    expect((await req("GET", "/admin/offline-essays/tests", undefined, A)).statusCode).toBe(403);
  });

  it("varoq yuklash: faqat rasm, faqat Milliy natija; mavzusiz AI'ga yuborilmaydi", async () => {
    expect((await img(r1, Buffer.from("salom"))).statusCode).toBe(400);
    expect((await img(r3)).statusCode).toBe(400);
    const up = await img(r1);
    expect(up.statusCode).toBe(201);
    expect(up.json()).toMatchObject({ status: "DRAFT", pages: 1 });
    expect((await req("POST", `/admin/offline-essays/tests/${testId}/check`, {})).statusCode).toBe(400);
    expect((await req("PUT", `/admin/offline-essays/tests/${testId}/prompt`, { prompt: "Kitob o'qishning foydasi haqida fikringiz" })).statusCode).toBe(200);
  });

  it("AI'ga yuboriladi, taxminiy baho saqlanadi, lekin natijaga yozilmaydi", async () => {
    const res = await req("POST", `/admin/offline-essays/tests/${testId}/check`, {});
    expect(res.json()).toEqual({ queued: 1 });
    expect((await essay()).status).toBe("CHECKING");
    expect((await aiQ.getJobs(["waiting", "delayed"])).some((j) => j.name === "external")).toBe(true);
    // Tekshirilayotganda varoq o'zgarmaydi
    expect((await img(r1)).statusCode).toBe(409);

    const e = await essay();
    expect(await gradeOfflineEssayJob(prisma, e.id, { grade, read, locate })).toBe(1.5);
    const d = (await req("GET", `/admin/offline-essays/${r1}`)).json();
    expect(d).toMatchObject({ status: "CHECKED", text: ESSAY.trim(), prompt: "Kitob o'qishning foydasi haqida fikringiz", essayScore: null });
    expect(d.ai.total).toBe(1.5);
    expect(d.ai.mistakes[0].wrong).toBe("asrayman");
    // AI hech qachon yakuniy ball qo'ymaydi
    expect((await prisma.externalResult.findUniqueOrThrow({ where: { id: r1 } })).essayScore).toBeNull();
    // Qayta chaqirilsa (holat endi CHECKING emas) hech narsa yozilmaydi
    expect(await gradeOfflineEssayJob(prisma, e.id, { grade, read, locate })).toBeNull();
  });

  it("ustoz 12 band bo'yicha baholaydi: ball serverda hisoblanadi, bandlar va AI taxmini o'lchov uchun saqlanadi", async () => {
    const confirm = (resultId: string, body: object) => req("POST", `/admin/offline-essays/${resultId}/confirm`, body);
    const agreement = async () => (await req("GET", "/admin/offline-essays/agreement")).json();
    const before = await agreement();
    // To'liq bo'lmagan yoki noto'g'ri qadamli baho qabul qilinmaydi
    expect((await confirm(r1, { scores: { views: 1.5 } })).statusCode).toBe(400);
    expect((await confirm(r1, { scores: bands(1.3) })).statusCode).toBe(400);

    // Ustoz AI matnidagi bitta so'zni varoqdagidek tuzatgan
    const fixed = ESSAY.trim().replace("faxrim.", "faxirim.");
    const c = await confirm(r1, { scores: bands(1), transcript: fixed, score: 24 });
    expect(c.statusCode).toBe(200);
    expect(c.json()).toMatchObject({ essayScore: 12, transcript: fixed, review: { total: 12, aiTotal: 1.5, reviewer: "Ega", special: null } });
    const r = await prisma.externalResult.findUniqueOrThrow({ where: { id: r1 } });
    expect(r.essayScore).toBe(12);
    expect(r.scaledScore).not.toBeNull();
    expect((await essay()).review).toMatchObject({ total: 12, ai: { total: 1.5 } });
    const log = await prisma.auditLog.findFirst({ where: { action: "external.essay.confirm", entityId: testId }, orderBy: { createdAt: "desc" } });
    expect(log?.meta).toMatchObject({ resultId: r1, score: 12, ai: 1.5 });

    const after = await agreement();
    expect(after.count).toBe(before.count + 1);
    expect(after.transcripts.count).toBe(before.transcripts.count + 1);
    expect(after.transcripts.errors).toBe(before.transcripts.errors + 1);
    expect(after.bands.find((b: { key: string }) => b.key === "views")).toBeTruthy();

    // Ustoz izohi: umumiy va band ostida; o'quvchi natijasida ko'radi (begona band va bo'sh izoh saqlanmaydi)
    const S = (await login(app, TG.student, "O'quvchi")).headers;
    const sp0 = await prisma.studentProfile.findUniqueOrThrow({
      where: { userId: (await prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(TG.student) } })).id },
    });
    await prisma.externalResult.update({ where: { id: r1 }, data: { studentId: sp0.id } });
    const withComment = await confirm(r1, {
      scores: bands(1),
      transcript: fixed,
      comment: " Dalillarni ko'paytiring ",
      comments: { views: "Fikr aniq", bogus: "x", proofs: " " },
    });
    expect(withComment.json().review).toMatchObject({ comment: "Dalillarni ko'paytiring", comments: { views: "Fikr aniq" } });
    const mine = (await req("GET", `/me/external/${r1}`, undefined, S)).json();
    expect(mine).toMatchObject({
      essayScore: 12,
      essayComment: "Dalillarni ko'paytiring",
      essayBandComments: [{ label: "Qarashlar va shaxsiy fikr", comment: "Fikr aniq" }],
    });

    // Maxsus holat: bandlarsiz, ball qoidadan; matn belgilanmagan — saqlanmaydi
    const sp = (await confirm(r1, { special: "OFF_TOPIC", transcript: null })).json();
    expect(sp).toMatchObject({ essayScore: ESSAY_SPECIAL.OFF_TOPIC.score, transcript: null, review: { special: "OFF_TOPIC", scores: {} } });

    // Varog'i yo'q natija: ball yoziladi, solishtiruv yozuvi yaratilmaydi
    const none = (await confirm(r2, { scores: bands(2) })).json();
    expect(none).toMatchObject({ essayScore: 24, status: "NONE", review: null });
    expect(await prisma.externalEssay.count({ where: { resultId: r2 } })).toBe(0);
  });

  it("yordamchi ham baholay oladi («Esselar» ruxsati bilan)", async () => {
    await prisma.user.update({ where: { telegramId: BigInt(TG.helper) }, data: { permissions: ["ESSAYS"] } });
    const A = (await login(app, TG.helper, "Yordamchi")).headers;
    const c = await req("POST", `/admin/offline-essays/${r1}/confirm`, { scores: bands(1.5) }, A);
    expect(c.statusCode).toBe(200);
    expect(c.json().review).toMatchObject({ total: 18, reviewer: "Yordamchi" });
  });

  it("varoq qo'shilsa eski AI bahosi eskiradi; xato va «esse topilmadi» holatlari", async () => {
    // Ustoz bahosi eski varoqlarga tegishli: solishtiruvdan chiqadi, natijadagi ball qoladi
    expect((await img(r1)).json()).toMatchObject({ status: "DRAFT", pages: 2, ai: null, text: null, review: null, transcript: null, essayScore: 18 });

    await req("POST", `/admin/offline-essays/tests/${testId}/check`, { resultIds: [r1] });
    const e = await essay();
    await markOfflineEssayFailed(prisma, e.id, "timeout");
    expect(await essay()).toMatchObject({ status: "FAILED", aiError: "timeout" });

    // Bo'sh ro'yxat: xato bergani qayta yuboriladi
    expect((await req("POST", `/admin/offline-essays/tests/${testId}/check`, {})).json()).toEqual({ queued: 1 });
    expect(await gradeOfflineEssayJob(prisma, e.id, { grade, read: async () => "NO_ESSAY", locate })).toBeNull();
    expect(await essay()).toMatchObject({ status: "FAILED", error: NO_ESSAY_ERROR });

    // Varoqni o'chirish
    const del = await req("DELETE", `/admin/offline-essays/${r1}/pages/0`);
    expect(del.json()).toMatchObject({ pages: 1, status: "DRAFT" });
  });

  it("test o'chirilganda varoq rasmlari ham o'chadi", async () => {
    const dir = join(MEDIA, "essays", "external", testId);
    expect(existsSync(dir)).toBe(true);
    expect((await req("DELETE", `/admin/external-tests/${testId}`)).statusCode).toBe(200);
    expect(existsSync(dir)).toBe(false);
    expect(await prisma.externalEssay.count({ where: { resultId: r1 } })).toBe(0);
  });
});
