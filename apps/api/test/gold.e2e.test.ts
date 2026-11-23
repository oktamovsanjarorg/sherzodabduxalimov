import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { ESSAY_RUBRIC } from "@onatili/shared";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OWNER, createApp, login } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900004001, assistant: 900004002, student: 900004003 };
const TAG = "E2E-gold";
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]);
const TEXT = "Albatta bugun dust topish oson emas.";
const scores = (v: number) => Object.fromEntries(ESSAY_RUBRIC.map((c) => [c.key, v]));

async function cleanup() {
  await prisma.goldEssay.deleteMany({ where: { topic: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { telegramId: { in: Object.values(TG).map(BigInt) } } });
}

describe("Esse sinov to'plami (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let A: Record<string, string>;
  let S: Record<string, string>;
  let studentId: string;
  const req = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object, headers = H) =>
    app.inject({ method, url: `/api${url}`, headers, payload });

  beforeAll(async () => {
    await cleanup();
    app = await createApp();
    H = (await login(app, TG.owner, "Ustoz", OWNER)).headers;
    await login(app, TG.assistant, "Yordamchi");
    await prisma.user.update({ where: { telegramId: BigInt(TG.assistant) }, data: { role: "ASSISTANT" } });
    A = (await login(app, TG.assistant, "Yordamchi")).headers;
    const s = await login(app, TG.student, "Ali");
    S = s.headers;
    studentId = s.userId;
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app?.close();
  });

  it("o'quvchiga yopiq; rozilikisiz qo'shib bo'lmaydi", async () => {
    expect((await req("GET", "/admin/gold", undefined, S)).statusCode).toBe(403);
    expect((await req("POST", "/admin/gold", { topic: `${TAG} kitob`, consent: false })).statusCode).toBe(400);
  });

  it("botdagi yozma esse: matni aynan olinadi; qo'lyozma: rasm nusxalanadi, matn ustozga qoladi", async () => {
    const typed = await prisma.essay.create({ data: { userId: studentId, prompt: `${TAG} do'stlik`, text: TEXT, status: "AI_CHECKED" } });
    const g = (await req("POST", `/admin/gold/from-essay/${typed.id}`, { consent: true })).json();
    expect(g).toMatchObject({ topic: `${TAG} do'stlik`, transcript: TEXT, fromBot: true, pages: 0 });
    expect((await req("POST", `/admin/gold/from-essay/${typed.id}`, { consent: true })).statusCode).toBe(409);

    const paper = (await req("POST", "/admin/gold", { topic: `${TAG} qog'oz`, consent: true }, A)).json();
    const up = await app.inject({ method: "POST", url: `/api/admin/gold/${paper.id}/pages`, headers: { ...A, "content-type": "image/jpeg" }, payload: JPEG });
    expect(up.json()).toMatchObject({ pages: 1, transcript: null, fromBot: false });
    expect((await req("GET", `/admin/gold/${paper.id}/pages/0`)).rawPayload.equals(JPEG)).toBe(true);
  });

  it("baho mustaqil: boshqalarniki o'zi baholamaguncha ko'rinmaydi; zip faqat tayyor esselar, ismsiz", async () => {
    const g = (await req("GET", "/admin/gold")).json().rows.find((r: { topic: string }) => r.topic === `${TAG} do'stlik`);
    const marks = [
      { start: 14, end: 18, type: "spelling", note: "do'st" },
      { start: 0, end: 7, type: "punctuation", note: "Albatta," },
    ];
    expect((await req("PUT", `/admin/gold/${g.id}/transcript`, { transcript: TEXT, marks })).json().marks).toHaveLength(2);
    expect((await req("PUT", `/admin/gold/${g.id}/rating`, { scores: { style: 2 } })).statusCode).toBe(400);

    await req("PUT", `/admin/gold/${g.id}/rating`, { scores: scores(1.5) });
    const before = (await req("GET", `/admin/gold/${g.id}`, undefined, A)).json();
    expect(before).toMatchObject({ myRating: null, others: null, otherCount: 1 });
    expect((await req("GET", "/admin/gold/export.zip")).statusCode).toBe(400); // hali bitta baho

    const after = (await req("PUT", `/admin/gold/${g.id}/rating`, { scores: scores(1) }, A)).json();
    expect(after.myRating.total).toBe(12);
    expect(after.others).toHaveLength(1);
    expect(after.others[0].total).toBe(18);

    expect((await req("GET", "/admin/gold/export.zip", undefined, A)).statusCode).toBe(403);
    const zip = await req("GET", "/admin/gold/export.zip");
    expect(zip.headers["x-gold-essays"]).toBe("1");
    const files = unzipSync(new Uint8Array(zip.rawPayload));
    expect(strFromU8(files["gold/e001/transcript.txt"])).toBe("{Albatta|Albatta,|P} bugun {dust|do'st|I} topish oson emas.\n");
    const csv = strFromU8(files["gold/scores.csv"]);
    expect(csv).toContain("e001,U1,1.5,");
    expect(csv).toContain("e001,U2,1,");
    expect(csv).not.toMatch(/Ustoz|Yordamchi|Ali/);
  });

  it("o'chirish: yordamchi faqat o'zi qo'shganini", async () => {
    const rows = (await req("GET", "/admin/gold")).json().rows as { id: string; topic: string }[];
    const mine = rows.find((r) => r.topic === `${TAG} do'stlik`)!;
    const assistants = rows.find((r) => r.topic === `${TAG} qog'oz`)!;
    expect((await req("DELETE", `/admin/gold/${mine.id}`, undefined, A)).statusCode).toBe(403);
    expect((await req("DELETE", `/admin/gold/${assistants.id}`, undefined, A)).statusCode).toBe(200);
    expect((await req("DELETE", `/admin/gold/${mine.id}`)).statusCode).toBe(200);
  });
});
