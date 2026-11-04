import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redisConnection } from "../src/media/queue";
import { NOTIFY_QUEUE, type NotifyJob } from "../src/notify/notify.service";
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
    // Baholash mezonlari: test qismi 75 ballik shkalaga (4,2/4,2 = 75), esse tekshirilmaguncha umumiy ball chiqmaydi
    expect(r.milliy).toMatchObject({ test: { score: 4.2, max: 4.2, scaled: 75 }, essayPending: true, total: null, level: null });
    expect(r.level).toBeNull();
    const essay = r.questions.find((q: { id: string }) => q.id === qEssay);
    expect(essay).toMatchObject({ pending: true, points: null, maxPoints: 24 });
  });

  it("ustoz: esse navbatda; baholaydi, umumiy ball yangilanadi, o'quvchiga xabar boradi", async () => {
    const list = (await req("GET", "/admin/essays?status=pending")).json();
    const e = list.find((x: { questionId: string }) => x.questionId === qEssay);
    expect(e).toMatchObject({ maxPoints: 24, words: 200, student: { name: "Nilufar" } });

    // Maksimumdan oshirib bo'lmaydi: 30 -> 24 ga qisqaradi
    const res = (await req("POST", `/admin/essays/${e.attemptId}/${qEssay}`, { points: 30, comment: "Juda yaxshi" })).json();
    expect(res).toEqual({ points: 24, score: 28.2 });

    const r = (await req("GET", `/attempts/${e.attemptId}`, undefined, S)).json();
    expect(r.pendingPoints).toBe(0);
    expect(r.questions.find((q: { id: string }) => q.id === qEssay)).toMatchObject({ pending: false, points: 24, reviewComment: "Juda yaxshi" });
    // Esse 24/24 -> 75; umumiy = (75 + 75) / 2 = 75 -> A+, oliygohda maksimal ball
    expect(r.milliy).toMatchObject({ essay: { score24: 24, scaled: 75 }, total: 75, level: { code: "A+" }, university: { first: 93, second: 63 } });

    expect((await req("GET", "/admin/essays?status=pending")).json().some((x: { questionId: string }) => x.questionId === qEssay)).toBe(false);
    const jobs = (await queue.getJobs(["waiting", "delayed"])).map((j) => j.data.text);
    expect(jobs.some((t) => t.includes("esse tekshirildi") && t.includes("75 / 75") && t.includes("A+"))).toBe(true);

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
    // Hech narsa yozilmagan: test 0, esse 0 -> umumiy 0, sertifikat berilmaydi
    expect(r.milliy).toMatchObject({ total: 0, essay: { score24: 0, scaled: 0 }, university: null });
    expect(r.level.label).toMatch(/berilmaydi/);
  });
});
