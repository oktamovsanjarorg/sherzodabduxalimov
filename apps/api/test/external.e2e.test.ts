import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redisConnection } from "../src/media/queue";
import { NOTIFY_QUEUE, type NotifyJob } from "../src/notify/notify.service";
import { OWNER, createApp, login, parentTgId } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900001001, a: 900001002, b: 900001003 };
const queue = new Queue<NotifyJob>(NOTIFY_QUEUE, { prefix: "onatili-e2e", connection: redisConnection(process.env.REDIS_URL ?? "redis://localhost:6381") });

async function cleanup() {
  await prisma.externalTest.deleteMany({ where: { code: { in: ["E2ECSV1", "E2ECSV2"] } } });
  const tg = Object.values(TG).map(BigInt);
  await prisma.user.deleteMany({ where: { telegramId: { in: [...tg, ...Object.values(TG).map(parentTgId)] } } });
}

describe("Offline test natijalari: CSV import (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let A: Record<string, string>;
  const req = (method: "GET" | "POST" | "PATCH", url: string, payload?: object, headers = H) => app.inject({ method, url: `/api${url}`, headers, payload });

  beforeAll(async () => {
    await cleanup();
    app = await createApp();
    H = (await login(app, TG.owner, "Ega", OWNER)).headers;
    A = (await login(app, TG.a, "Aziza", "aziza")).headers;
    await login(app, TG.b, "Bobur", "bobur_b");
  });
  afterAll(async () => {
    await cleanup();
    await queue.close();
    await prisma.$disconnect();
    await app?.close();
  });

  it("CSV: username, keyin ism bo'yicha topadi; qo'lda bog'lash qayta importda saqlanadi", async () => {
    const content = "Ism;Username;Q1;Q2;Q3;Jami\r\nBobur;bobur_b;1;1;0;2\r\nNotanish Odam;;0;1;1;2\r\n";
    const pv = (await req("POST", "/admin/external-tests/csv/preview", { fileName: "test-E2ECSV1-matritsa.csv", content })).json();
    expect(pv.test).toMatchObject({ code: "E2ECSV1", source: "CSV", questionCount: 3 });
    expect(pv.rows[0].match).toMatchObject({ how: "username" });
    expect(pv.rows[1].match).toBeNull();

    const im = (await req("POST", "/admin/external-tests/csv/import", { fileName: "test-E2ECSV1-matritsa.csv", title: "Diagnostika", content })).json();
    const d = (await req("GET", `/admin/external-tests/${im.id}`)).json();
    const stranger = d.rows.find((r: { name: string }) => r.name === "Notanish Odam");
    const bobur = d.rows.find((r: { name: string }) => r.name === "Bobur").student.id;
    expect((await req("PATCH", `/admin/external-tests/${im.id}/results/${stranger.id}`, { studentId: bobur })).statusCode).toBe(200);
    await req("POST", "/admin/external-tests/csv/import", { fileName: "test-E2ECSV1-matritsa.csv", title: "Diagnostika", content });
    const again = (await req("GET", `/admin/external-tests/${im.id}`)).json();
    expect(again.rows.find((r: { name: string }) => r.name === "Notanish Odam")).toMatchObject({ manualMatch: true, student: { id: bobur } });

    const rank = (await req("GET", "/admin/external-tests/ranking")).json();
    expect(rank.find((r: { studentId: string }) => r.studentId === bobur)).toMatchObject({ tests: 2 });
  });

  it("tahlil, o'quvchi o'z natijasini ko'radi, xabarda natija yo'q", async () => {
    const content = "Ism;Username;Q1;Q2;Q3;Q4;Jami\nAziza;aziza;1;1;0;1;3\n";
    const im = (await req("POST", "/admin/external-tests/csv/import", { fileName: "E2ECSV2.csv", title: "Mock #3", content })).json();
    expect(im).toMatchObject({ created: 1, matched: 1 });
    const d = (await req("GET", `/admin/external-tests/${im.id}`)).json();
    expect(d).toMatchObject({ participants: 1, matched: 1, avgPercent: 75 });
    expect(d.stats.questions[0]).toMatchObject({ q: 1, correctPct: 100 });
    expect(d.stats.questions[2]).toMatchObject({ q: 3, correctPct: 0, blankPct: 0 });
    expect(d.rows.map((r: { rank: number }) => r.rank)).toEqual([1]);

    const mine = (await req("GET", "/me/external", undefined, A)).json();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: "Mock #3", percent: 75, rank: 1, participants: 1 });
    const one = (await req("GET", `/me/external/${mine[0].id}`, undefined, A)).json();
    expect(one).toMatchObject({ answers: "ccwc", avgPercent: 75 });

    await queue.obliterate({ force: true });
    expect((await req("POST", `/admin/external-tests/${im.id}/notify`)).json()).toEqual({ students: 1, parents: 1 });
    const texts = (await queue.getJobs(["waiting", "delayed"])).map((j) => j.data.text);
    expect(texts).toHaveLength(2);
    for (const t of texts) {
      expect(t).not.toMatch(/75|%|ball/);
      expect(t).toMatch(/ilovada/i);
    }
    // Ikkinchi marta: hech kimga qayta yuborilmaydi
    expect((await req("POST", `/admin/external-tests/${im.id}/notify`)).json()).toEqual({ students: 0, parents: 0 });
  });

  it("ruxsat: o'quvchi admin endpointini ocholmaydi, boshqaning natijasini ko'rmaydi", async () => {
    expect((await req("GET", "/admin/external-tests", undefined, A)).statusCode).toBe(403);
    const other = await prisma.externalResult.findFirst({ where: { name: "Bobur" } });
    expect((await req("GET", `/me/external/${other!.id}`, undefined, A)).statusCode).toBe(404);
  });
});
