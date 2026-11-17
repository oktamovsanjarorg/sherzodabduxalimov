import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { redisConnection } from "../src/media/queue";
import { NOTIFY_QUEUE, type NotifyJob } from "../src/notify/notify.service";
import { OWNER, createApp, login, parentTgId } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900001001, a: 900001002, b: 900001003, outsider: 900001004 };
const queue = new Queue<NotifyJob>(NOTIFY_QUEUE, { prefix: "onatili-e2e", connection: redisConnection(process.env.REDIS_URL ?? "redis://localhost:6381") });

async function cleanup() {
  await prisma.externalTest.deleteMany({ where: { code: { in: ["E2EUT1", "E2ECSV"] } } });
  const tg = Object.values(TG).map(BigInt);
  await prisma.user.deleteMany({ where: { telegramId: { in: [...tg, ...Object.values(TG).map(parentTgId)] } } });
}

const utestReply = (resultsVisible: boolean) => ({
  version: 1,
  test: { code: "E2EUT1", title: "Mock #3", questionCount: 4, subject: "Ona tili", resultsVisible, sections: [{ title: "Grammatika", fromQ: 1, toQ: 4 }] },
  attempts: [
    { telegramId: TG.a, name: "Aziza K", username: "aziza", submittedAt: "2026-11-10T08:00:00Z", durationSec: 900, correct: 3, wrong: 1, blank: 0, rawScore: 3, maxScore: 4, percent: 75, scaledScore: null, grade: null, sections: [{ title: "Grammatika", fromQ: 1, toQ: 4, correct: 3, wrong: 1, blank: 0, raw: 3, max: 4, percent: 75 }], answers: "ccwc" },
    { telegramId: TG.outsider, name: "Begona", username: null, submittedAt: "2026-11-10T08:05:00Z", durationSec: 800, correct: 1, wrong: 2, blank: 1, rawScore: 1, maxScore: 4, percent: 25, scaledScore: null, grade: null, sections: [], answers: "cwwb" },
  ],
});

describe("Tashqi testlar: utest import (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let A: Record<string, string>;
  let visible = false;
  const req = (method: "GET" | "POST" | "PATCH", url: string, payload?: object, headers = H) => app.inject({ method, url: `/api${url}`, headers, payload });

  beforeAll(async () => {
    process.env.UTEST_API_KEY = "k".repeat(40);
    process.env.UTEST_API_URL = "https://utest.test/api";
    await cleanup();
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (!u.startsWith("https://utest.test/")) return realFetch(url, init);
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${"k".repeat(40)}`);
      if (u.endsWith("/tests/E2EUT1/results")) return new Response(JSON.stringify(utestReply(visible)), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    app = await createApp();
    H = (await login(app, TG.owner, "Ega", OWNER)).headers;
    A = (await login(app, TG.a, "Aziza", "aziza")).headers;
    await login(app, TG.b, "Bobur", "bobur_b");
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await cleanup();
    await queue.close();
    await prisma.$disconnect();
    await app?.close();
  });

  it("kod bo'yicha: Telegram ID bilan aniq topadi, yopiq natija o'quvchiga ko'rinmaydi va xabar ketmaydi", async () => {
    const pv = (await req("POST", "/admin/external-tests/utest/preview", { code: "e2eut1" })).json();
    expect(pv.test).toMatchObject({ title: "Mock #3", participants: 2, resultsVisible: false, alreadyImported: false });
    expect(pv.rows.find((r: { name: string }) => r.name === "Aziza K").match).toMatchObject({ how: "telegram" });
    expect(pv.rows.find((r: { name: string }) => r.name === "Begona").match).toBeNull();

    const im = (await req("POST", "/admin/external-tests/utest/import", { code: "E2EUT1" })).json();
    expect(im).toMatchObject({ created: 2, matched: 1 });
    expect((await req("GET", "/me/external", undefined, A)).json()).toEqual([]);
    expect((await req("POST", `/admin/external-tests/${im.id}/notify`)).statusCode).toBe(400);

    expect((await req("POST", "/admin/external-tests/utest/preview", { code: "NOPE99" })).statusCode).toBe(404);
  });

  it("ochilgach: qayta import, tahlil, o'quvchi o'z natijasini ko'radi, xabarda natija yo'q", async () => {
    visible = true;
    const im = (await req("POST", "/admin/external-tests/utest/import", { code: "E2EUT1" })).json();
    expect(im).toMatchObject({ created: 0, updated: 2 });
    const d = (await req("GET", `/admin/external-tests/${im.id}`)).json();
    expect(d).toMatchObject({ participants: 2, matched: 1, avgPercent: 50, resultsVisible: true });
    expect(d.stats.questions[0]).toMatchObject({ q: 1, correctPct: 100 });
    expect(d.stats.questions[3]).toMatchObject({ q: 4, correctPct: 50, blankPct: 50 });
    expect(d.rows.map((r: { rank: number }) => r.rank)).toEqual([1, 2]);

    const mine = (await req("GET", "/me/external", undefined, A)).json();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: "Mock #3", percent: 75, rank: 1, participants: 2 });
    const one = (await req("GET", `/me/external/${mine[0].id}`, undefined, A)).json();
    expect(one).toMatchObject({ answers: "ccwc", avgPercent: 50, sections: [{ title: "Grammatika", percent: 75 }] });

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

  it("CSV: username, keyin ism bo'yicha topadi; qo'lda bog'lash qayta importda saqlanadi", async () => {
    const content = "﻿Ism;Username;Q1;Q2;Jami\r\nBobur;bobur_b;1;1;2\r\nNotanish Odam;;0;1;1\r\n";
    const pv = (await req("POST", "/admin/external-tests/csv/preview", { fileName: "utest-E2ECSV-matritsa.csv", content })).json();
    expect(pv.test).toMatchObject({ code: "E2ECSV", source: "CSV", questionCount: 2 });
    expect(pv.rows[0].match).toMatchObject({ how: "username" });
    expect(pv.rows[1].match).toBeNull();

    const im = (await req("POST", "/admin/external-tests/csv/import", { fileName: "utest-E2ECSV-matritsa.csv", title: "Diagnostika", content })).json();
    const d = (await req("GET", `/admin/external-tests/${im.id}`)).json();
    const stranger = d.rows.find((r: { name: string }) => r.name === "Notanish Odam");
    const bobur = d.rows.find((r: { name: string }) => r.name === "Bobur").student.id;
    expect((await req("PATCH", `/admin/external-tests/${im.id}/results/${stranger.id}`, { studentId: bobur })).statusCode).toBe(200);
    await req("POST", "/admin/external-tests/csv/import", { fileName: "utest-E2ECSV-matritsa.csv", title: "Diagnostika", content });
    const again = (await req("GET", `/admin/external-tests/${im.id}`)).json();
    expect(again.rows.find((r: { name: string }) => r.name === "Notanish Odam")).toMatchObject({ manualMatch: true, student: { id: bobur } });

    const rank = (await req("GET", "/admin/external-tests/ranking")).json();
    expect(rank.find((r: { studentId: string }) => r.studentId === bobur)).toMatchObject({ tests: 2 });
  });

  it("ruxsat: o'quvchi admin endpointini ocholmaydi, boshqaning natijasini ko'rmaydi", async () => {
    expect((await req("GET", "/admin/external-tests", undefined, A)).statusCode).toBe(403);
    const other = await prisma.externalResult.findFirst({ where: { name: "Bobur" } });
    expect((await req("GET", `/me/external/${other!.id}`, undefined, A)).statusCode).toBe(404);
  });
});
