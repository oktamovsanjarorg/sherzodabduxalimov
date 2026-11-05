import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redisConnection } from "../src/media/queue";
import { NOTIFY_QUEUE, type NotifyJob } from "../src/notify/notify.service";
import { RaschService } from "../src/tests/rasch.service";
import { OWNER, createApp, login } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900000601, student: 900000602 };
const TAG = "E2E-mock";
const queue = new Queue<NotifyJob>(NOTIFY_QUEUE, { prefix: "onatili-e2e", connection: redisConnection(process.env.REDIS_URL ?? "redis://localhost:6381") });

async function cleanup() {
  await prisma.test.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.question.deleteMany({ where: { text: { startsWith: TAG } } });
  await prisma.passage.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { telegramId: { in: Object.values(TG).map(BigInt) } } });
}

describe("Milliy sertifikat formatidagi mock (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let S: Record<string, string>;
  const req = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object, headers = H) =>
    app.inject({ method, url: `/api${url}`, headers, payload });

  beforeAll(async () => {
    await cleanup();
    await queue.obliterate({ force: true });
    app = await createApp();
    H = (await login(app, TG.owner, "Ega", OWNER)).headers;
    S = (await login(app, TG.student, "Nilufar")).headers;
  });
  afterAll(async () => {
    await cleanup();
    await queue.close();
    await prisma.$disconnect();
    await app?.close();
  });

  let testId = "";
  let qMcq = "";
  let qPunct = "";
  let qEssay = "";
  let optRight = "";

  it("admin: matn, matnga tayangan savol, tinish belgilari savoli va esse", async () => {
    const passage = (await req("POST", "/admin/passages", { title: `${TAG} Merkuriy`, body: "Quyosh tizimidagi eng kichik sayyora − **Merkuriy**." })).json();
    expect(passage.id).toBeTruthy();

    const mcq = (
      await req("POST", "/admin/questions", {
        passageId: passage.id,
        type: "SINGLE",
        text: `${TAG} Matnga mos **to'g'ri** javob?`,
        options: [{ text: "Eng katta sayyora", isCorrect: false }, { text: "Eng kichik sayyora", isCorrect: true }],
      })
    ).json();
    qMcq = mcq.id;
    optRight = mcq.options[1].id;
    expect(mcq.passageId).toBe(passage.id);

    qPunct = (await req("POST", "/admin/questions", { type: "TEXT", text: `${TAG} Tinish belgilari`, correctText: '"":",".' })).json().id;

    // Esse: variant ham, kalit ham talab qilinmaydi
    const essay = await req("POST", "/admin/questions", { type: "ESSAY", text: `${TAG} Reklama haqida esse yozing` });
    expect(essay.statusCode).toBe(201);
    qEssay = essay.json().id;

    // Savoli bor matnni o'chirib bo'lmaydi
    expect((await req("DELETE", `/admin/passages/${passage.id}`)).statusCode).toBe(409);

    const t = (
      await req("POST", "/admin/tests", {
        type: "MOCK",
        title: `${TAG} 1-variant`,
        timeLimitSec: 3 * 3600,
        shuffle: false,
        gradingScale: "MILLIY_SERTIFIKAT",
        isFree: true,
        isPublished: true,
        questions: [{ questionId: qMcq, points: 1.7 }, { questionId: qPunct, points: 2.5 }, { questionId: qEssay, points: 24 }],
      })
    ).json();
    testId = t.id;
    expect(t.gradingScale).toBe("MILLIY_SERTIFIKAT");
  });

  it("o'quvchi: matn va ball ko'rinadi; esse tekshiruvga ketadi, daraja taxminiy", async () => {
    const st = (await req("POST", `/tests/${testId}/attempts`, undefined, S)).json();
    expect(st.questions.map((q: { id: string }) => q.id)).toEqual([qMcq, qPunct, qEssay]); // aralashtirilmagan
    expect(st.questions[0].passage.body).toContain("Merkuriy");
    expect(st.questions[0].points).toBe(1.7);
    expect(st.questions[2].type).toBe("ESSAY");

    const essayText = "Reklama ".repeat(200).trim();
    await req("PUT", `/attempts/${st.id}/answers/${qMcq}`, { optionIds: [optRight] }, S);
    await req("PUT", `/attempts/${st.id}/answers/${qPunct}`, { textAnswer: "« » : „ , “ ." }, S);
    expect((await req("PUT", `/attempts/${st.id}/answers/${qEssay}`, { textAnswer: essayText }, S)).statusCode).toBe(200);

    const r = (await req("POST", `/attempts/${st.id}/submit`, undefined, S)).json();
    expect(r).toMatchObject({ score: 4.2, maxScore: 28.2, pendingPoints: 24, gradingScale: "MILLIY_SERTIFIKAT" });
    // Test qismi Rasch bilan. Natijalar 30 tadan kam: dastlabki baho (b = 0, μ = 0, σ = 1).
    // 2/2 to'g'ri: θ = ln(1,7/0,3) ≈ 1,73 -> T = 50 + 10·1,73 = 67,3. Esse tekshirilmaguncha umumiy ball yo'q
    expect(r.milliy).toMatchObject({ test: { correct: 2, total: 2, scaled: 67.3, calibrated: false }, essayPending: true, total: null, level: null });
    expect(r.level).toBeNull();
    const essay = r.questions.find((q: { id: string }) => q.id === qEssay);
    expect(essay).toMatchObject({ pending: true, points: null, maxPoints: 24 });
  });

  it("ustoz: esse navbatda; baholaydi, umumiy ball yangilanadi, o'quvchiga xabar boradi", async () => {
    const list = (await req("GET", "/admin/essays?status=pending")).json();
    const e = list.find((x: { questionId: string }) => x.questionId === qEssay);
    expect(e).toMatchObject({ maxPoints: 24, words: 200, student: { name: "Nilufar" } });

    // Milliy testda ball qo'lda emas: rasmiy mezonning 12 bandi bo'yicha (har biri 0..2)
    expect((await req("POST", `/admin/essays/${e.attemptId}/${qEssay}`, { points: 30, comment: "x" })).statusCode).toBe(400);
    const keys = ["style", "views", "evidence", "parts", "structure", "coherence", "spelling", "punctuation", "affixes", "wordUsage", "lexicon", "purity"];
    expect((await req("POST", `/admin/essays/${e.attemptId}/${qEssay}`, { criteria: [{ key: "style", score: 9 }] })).statusCode).toBe(400); // 2 dan ko'p emas
    const res = (await req("POST", `/admin/essays/${e.attemptId}/${qEssay}`, { criteria: keys.map((key) => ({ key, score: 2 })), comment: "Juda yaxshi" })).json();
    expect(res.points).toBe(24);

    const r = (await req("GET", `/attempts/${e.attemptId}`, undefined, S)).json();
    expect(r.pendingPoints).toBe(0);
    expect(r.questions.find((q: { id: string }) => q.id === qEssay)).toMatchObject({ pending: false, points: 24, reviewComment: "Juda yaxshi" });
    expect(r.questions.find((q: { id: string }) => q.id === qEssay).rubric).toHaveLength(12);
    // Esse 24/24 -> 75; umumiy = (67,3 + 75) / 2 = 71,2 -> A+, oliygohda maksimal ball
    expect(r.milliy).toMatchObject({ essay: { score24: 24, scaled: 75 }, total: 71.2, level: { code: "A+" }, university: { first: 93, second: 63 } });

    expect((await req("GET", "/admin/essays?status=pending")).json().some((x: { questionId: string }) => x.questionId === qEssay)).toBe(false);
    const jobs = (await queue.getJobs(["waiting", "delayed"])).map((j) => j.data.text);
    expect(jobs.some((t) => t.includes("esse tekshirildi") && t.includes("<b>71.2</b> / 75") && t.includes("A+"))).toBe(true);

    // Ovozli izoh mock essesiga ham (baholangandan keyin); natijada ko'rinadi
    const audio = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(4000, 3)]);
    const v = await app.inject({ method: "POST", url: `/api/admin/essays/${e.attemptId}/${qEssay}/voice`, headers: { ...H, "content-type": "audio/webm" }, payload: audio });
    expect(v.statusCode).toBe(201);
    const withVoice = (await req("GET", `/attempts/${e.attemptId}`, undefined, S)).json();
    expect(withVoice.questions.find((q: { id: string }) => q.id === qEssay).voice).toMatchObject({ id: v.json().id, status: "PROCESSING" });
    expect((await req("GET", "/admin/essays?status=reviewed")).json().find((x: { attemptId: string }) => x.attemptId === e.attemptId).voice.id).toBe(v.json().id);

    // O'quvchi esse baholay olmaydi
    expect((await req("POST", `/admin/essays/${e.attemptId}/${qEssay}`, { points: 1 }, S)).statusCode).toBe(403);
  });

  it("qoralama mock: o'quvchiga ko'rinmaydi va ochilmaydi, ustoz sinab ko'ra oladi", async () => {
    const draft = (await req("POST", "/admin/tests", { type: "MOCK", title: `${TAG} qoralama`, isFree: true, questions: [{ questionId: qMcq }] })).json();
    const studentList = (await req("GET", "/mocks", undefined, S)).json();
    expect(studentList.some((t: { id: string }) => t.id === draft.id)).toBe(false);
    expect((await req("POST", `/tests/${draft.id}/attempts`, undefined, S)).statusCode).toBe(404);
    const staffList = (await req("GET", "/mocks")).json();
    expect(staffList.find((t: { id: string }) => t.id === draft.id).isDraft).toBe(true);
    expect((await req("POST", `/tests/${draft.id}/attempts`)).statusCode).toBe(200);
  });

  it("bo'sh esse darhol 0 ball (kutilmaydi)", async () => {
    const st = (await req("POST", `/tests/${testId}/attempts`, undefined, S)).json();
    const r = (await req("POST", `/attempts/${st.id}/submit`, undefined, S)).json();
    expect(r.pendingPoints).toBe(0);
    expect(r.questions.find((q: { id: string }) => q.id === qEssay)).toMatchObject({ pending: false, points: 0 });
    // Hech narsa yozilmagan: θ = ln(0,3/1,7) -> T = 32,7; esse 0 -> 0; umumiy 16,4 -> sertifikat berilmaydi
    expect(r.milliy).toMatchObject({ test: { correct: 0, scaled: 32.7 }, total: 16.4, essay: { score24: 0, scaled: 0 }, university: null });
    expect(r.level.label).toMatch(/berilmaydi/);
  });

  it("100 so'zdan kam esse tekshirilmaydi: avtomatik 2 ball; to'liq kirillcha — 0", async () => {
    const st = (await req("POST", `/tests/${testId}/attempts`, undefined, S)).json();
    await req("PUT", `/attempts/${st.id}/answers/${qEssay}`, { textAnswer: "Reklama haqida qisqa fikr. ".repeat(10) }, S);
    const r = (await req("POST", `/attempts/${st.id}/submit`, undefined, S)).json();
    expect(r.questions.find((q: { id: string }) => q.id === qEssay)).toMatchObject({ pending: false, points: 2, special: { key: "TOO_SHORT" } });
    expect(r.milliy.essay).toEqual({ score24: 2, scaled: 31 });

    const st2 = (await req("POST", `/tests/${testId}/attempts`, undefined, S)).json();
    await req("PUT", `/attempts/${st2.id}/answers/${qEssay}`, { textAnswer: "Реклама ҳақида фикрим жуда узун ва батафсил. ".repeat(30) }, S);
    const r2 = (await req("POST", `/attempts/${st2.id}/submit`, undefined, S)).json();
    expect(r2.questions.find((q: { id: string }) => q.id === qEssay)).toMatchObject({ points: 0, special: { key: "CYRILLIC" } });
  });

  it("Rasch: 30+ natijadan savol qiyinliklari kalibrlanadi; qiyin savolni yechgan yuqori ball oladi", async () => {
    // 2 ta savol: qMcq oson (ko'pchilik yechgan), qPunct qiyin (kam yechgan). 40 ta sintetik o'quvchi
    const users = await Promise.all(
      Array.from({ length: 40 }, (_, i) => prisma.user.create({ data: { telegramId: BigInt(900000700 + i), firstName: `${TAG}-r${i}`, role: "STUDENT" } })),
    );
    for (const [i, u] of users.entries()) {
      const easy = i % 10 !== 0; // 90% yechgan
      const hard = i % 4 === 0; // 25% yechgan
      await prisma.attempt.create({
        data: {
          userId: u.id,
          testId,
          status: "SUBMITTED",
          finishedAt: new Date(),
          answers: { create: [{ questionId: qMcq, isCorrect: easy, optionIds: [] }, { questionId: qPunct, isCorrect: hard, optionIds: [] }] },
        },
      });
    }
    const out = await app.get(RaschService).calibrateTest(testId);
    expect(out).toMatchObject({ calibrated: true });
    const tqs = await prisma.testQuestion.findMany({ where: { testId, questionId: { in: [qMcq, qPunct] } } });
    const b = Object.fromEntries(tqs.map((q) => [q.questionId, q.raschB!]));
    expect(b[qPunct]).toBeGreaterThan(b[qMcq]); // qiyin savolning qiyinligi yuqori

    // Faqat qiyin savolni yechgan > faqat oson savolni yechgan
    const take = async (opt: { mcq: boolean; punct: boolean }) => {
      const st = (await req("POST", `/tests/${testId}/attempts`, undefined, S)).json();
      if (opt.mcq) await req("PUT", `/attempts/${st.id}/answers/${qMcq}`, { optionIds: [optRight] }, S);
      if (opt.punct) await req("PUT", `/attempts/${st.id}/answers/${qPunct}`, { textAnswer: "« » : „ , “ ." }, S);
      return (await req("POST", `/attempts/${st.id}/submit`, undefined, S)).json().milliy.test;
    };
    const onlyEasy = await take({ mcq: true, punct: false });
    const both = await take({ mcq: true, punct: true });
    expect(onlyEasy.calibrated).toBe(true);
    expect(onlyEasy.sampleSize).toBeGreaterThanOrEqual(40);
    expect(both.scaled).toBeGreaterThan(onlyEasy.scaled);
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  });
});
