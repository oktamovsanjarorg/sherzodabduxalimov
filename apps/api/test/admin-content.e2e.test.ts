import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OWNER, createApp, login } from "./helpers";

const prisma = new PrismaClient();
const TG_OWNER = 900000301;
const TG_STUDENT = 900000302;
const TITLE = "E2E-admin kurs";

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { title: TITLE }, select: { id: true } });
  const topics = await prisma.topic.findMany({ where: { courseId: { in: courses.map((c) => c.id) } }, select: { id: true } });
  const topicIds = topics.map((t) => t.id);
  await prisma.test.deleteMany({ where: { topicId: { in: topicIds } } });
  await prisma.question.deleteMany({ where: { topicId: { in: topicIds } } });
  await prisma.course.deleteMany({ where: { title: TITLE } });
  await prisma.user.deleteMany({ where: { telegramId: { in: [BigInt(TG_OWNER), BigInt(TG_STUDENT)] } } });
}

describe("Admin: kontent (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let S: Record<string, string>;
  const req = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object, headers = H) =>
    app.inject({ method, url: `/api${url}`, headers, payload });

  beforeAll(async () => {
    await cleanup();
    app = await createApp();
    H = (await login(app, TG_OWNER, "Ega", OWNER)).headers;
    S = (await login(app, TG_STUDENT, "O'quvchi")).headers;
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app?.close();
  });

  it("o'quvchi admin API'ga kira olmaydi", async () => {
    expect((await req("GET", "/admin/courses", undefined, S)).statusCode).toBe(403);
    expect((await req("POST", "/admin/courses", { title: "x" }, S)).statusCode).toBe(403);
  });

  it("to'liq oqim: kurs → mavzu → dars → savollar → test → o'quvchi ko'radi", async () => {
    const course = (await req("POST", "/admin/courses", { title: TITLE, isPublished: true })).json();
    const topic = (await req("POST", `/admin/courses/${course.id}/topics`, { title: "Morfologiya" })).json();

    // Bo'sh darsni nashr qilib bo'lmaydi
    const l1 = (await req("POST", `/admin/topics/${topic.id}/lessons`, { title: "Ot so'z turkumi" })).json();
    expect(l1.isPublished).toBe(false);
    const bad = await req("PATCH", `/admin/lessons/${l1.id}`, { isPublished: true });
    expect(bad.statusCode).toBe(400);
    const ok = await req("PATCH", `/admin/lessons/${l1.id}`, { content: "Ot: narsa va shaxs nomini bildiradi.", isPublished: true, isFree: true });
    expect(ok.json()).toMatchObject({ isPublished: true, isFree: true });

    const l2 = (await req("POST", `/admin/topics/${topic.id}/lessons`, { title: "Sifat", content: "...", isPublished: true })).json();
    // Tartibni almashtirish
    await req("POST", "/admin/reorder", { kind: "lesson", ids: [l2.id, l1.id] });
    const tree = (await req("GET", "/admin/courses")).json();
    const t = tree.find((c: { id: string }) => c.id === course.id).topics[0];
    expect(t.lessons.map((l: { id: string }) => l.id)).toEqual([l2.id, l1.id]);

    // Savol validatsiyasi
    const noCorrect = await req("POST", "/admin/questions", {
      topicId: topic.id,
      type: "SINGLE",
      text: "Ot qaysi so'roqqa javob beradi?",
      options: [{ text: "kim? nima?", isCorrect: false }, { text: "qanday?", isCorrect: false }],
    });
    expect(noCorrect.statusCode).toBe(400);
    expect(noCorrect.json().message).toMatch(/to'g'ri javob/);

    const q1 = (
      await req("POST", "/admin/questions", {
        topicId: topic.id,
        type: "SINGLE",
        text: "Ot qaysi so'roqqa javob beradi?",
        options: [{ text: "kim? nima?", isCorrect: true }, { text: "qanday?", isCorrect: false }],
      })
    ).json();
    const q2 = (await req("POST", "/admin/questions", { topicId: topic.id, type: "TEXT", text: "«Kitob» qaysi so'z turkumi?", correctText: "ot" })).json();

    // Bo'sh testni nashr qilib bo'lmaydi
    expect((await req("POST", "/admin/tests", { type: "TOPIC", title: "Bo'sh", topicId: topic.id, isPublished: true })).statusCode).toBe(400);
    // Mavzu testi mavzusiz bo'lmaydi
    expect((await req("POST", "/admin/tests", { type: "TOPIC", title: "Mavzusiz" })).statusCode).toBe(400);

    const test = (
      await req("POST", "/admin/tests", {
        type: "TOPIC",
        title: "Morfologiya: 1-test",
        topicId: topic.id,
        isFree: true,
        isPublished: true,
        questions: [{ questionId: q1.id, points: 2 }, { questionId: q2.id }],
      })
    ).json();
    expect(test.questionCount).toBe(2);
    expect(test.questions[0]).toMatchObject({ questionId: q1.id, points: 2 });

    // O'quvchi yangi kontentni ko'radi
    const courses = (await req("GET", "/courses", undefined, S)).json();
    const sc = courses.find((c: { id: string }) => c.id === course.id);
    expect(sc.topics[0].lessons).toHaveLength(2);
    expect(sc.topics[0].tests[0]).toMatchObject({ id: test.id, questionCount: 2 });

    // Savolni tahrirlash: mavjud variant id'si saqlanadi
    const keepId = q1.options[0].id;
    const edited = (
      await req("PATCH", `/admin/questions/${q1.id}`, {
        topicId: topic.id,
        type: "SINGLE",
        text: "Ot qaysi so'roqlarga javob beradi?",
        options: [{ id: keepId, text: "kim? nima? qayer?", isCorrect: true }, { text: "nima qildi?", isCorrect: false }],
      })
    ).json();
    expect(edited.options[0].id).toBe(keepId);
    expect(edited.options).toHaveLength(2);

    // O'quvchi javob bergandan keyin savol va testni o'chirib bo'lmaydi
    const attempt = (await req("POST", `/tests/${test.id}/attempts`, undefined, S)).json();
    await app.inject({ method: "PUT", url: `/api/attempts/${attempt.id}/answers/${q1.id}`, headers: S, payload: { optionIds: [keepId] } });
    expect((await req("DELETE", `/admin/questions/${q1.id}`)).statusCode).toBe(409);
    expect((await req("DELETE", `/admin/tests/${test.id}`)).statusCode).toBe(409);

    // Darsi bor mavzuni o'chirib bo'lmaydi
    expect((await req("DELETE", `/admin/topics/${topic.id}`)).statusCode).toBe(409);

    // Audit yozilgan
    expect(await prisma.auditLog.count({ where: { entity: "Question", entityId: q1.id } })).toBeGreaterThanOrEqual(2);
  });
});
