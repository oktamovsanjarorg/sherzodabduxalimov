import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, login } from "./helpers";

const prisma = new PrismaClient();
const P = "e2e-content"; // barcha fixture id'lari shu prefiks bilan
const TG_A = 900000101;
const TG_B = 900000102;

async function cleanup() {
  await prisma.user.deleteMany({ where: { telegramId: { in: [BigInt(TG_A), BigInt(TG_B)] } } });
  await prisma.course.deleteMany({ where: { id: `${P}-course` } });
  await prisma.question.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.test.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.plan.deleteMany({ where: { id: `${P}-plan` } });
}

describe("Kontent va testlar (e2e)", () => {
  let app: NestFastifyApplication;
  let A: Awaited<ReturnType<typeof login>>;
  let B: Awaited<ReturnType<typeof login>>;
  const inject = (o: Parameters<NestFastifyApplication["inject"]>[0]) => app.inject(o);

  beforeAll(async () => {
    await cleanup();
    await prisma.course.create({
      data: {
        id: `${P}-course`,
        title: "E2E kurs",
        isPublished: true,
        order: 999,
        topics: {
          create: {
            id: `${P}-topic`,
            title: "E2E mavzu",
            lessons: {
              create: [
                { id: `${P}-free`, title: "Bepul dars", isFree: true, isPublished: true, order: 1 },
                { id: `${P}-paid`, title: "Pullik dars", isFree: false, isPublished: true, order: 2 },
                { id: `${P}-draft`, title: "Qoralama", isFree: true, isPublished: false, order: 3 },
              ],
            },
          },
        },
      },
    });
    await prisma.question.create({
      data: {
        id: `${P}-q1`,
        text: "1-savol",
        options: { create: [{ id: `${P}-q1a`, text: "A" }, { id: `${P}-q1b`, text: "B", isCorrect: true }] },
      },
    });
    await prisma.question.create({
      data: { id: `${P}-q2`, type: "TEXT", text: "2-savol", correctText: "gʻisht" },
    });
    await prisma.test.create({
      data: {
        id: `${P}-test`,
        type: "TOPIC",
        title: "Bepul test",
        topicId: `${P}-topic`,
        isFree: true,
        isPublished: true,
        questions: { create: [{ questionId: `${P}-q1`, order: 1, points: 2 }, { questionId: `${P}-q2`, order: 2 }] },
      },
    });
    await prisma.test.create({
      data: {
        id: `${P}-paidtest`,
        type: "MOCK",
        title: "Pullik mock",
        isFree: false,
        isPublished: true,
        timeLimitSec: 60,
        questions: { create: [{ questionId: `${P}-q1`, order: 1 }] },
      },
    });
    await prisma.plan.create({ data: { id: `${P}-plan`, name: "E2E tarif", priceUzs: 1000 } });

    app = await createApp();
    A = await login(app, TG_A, "Ali");
    B = await login(app, TG_B, "Bobur");
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app?.close();
  });

  it("kurslar: qoralama ko'rinmaydi, pullik dars yopiq", async () => {
    const res = await inject({ method: "GET", url: "/api/courses", headers: A.headers });
    expect(res.statusCode).toBe(200);
    const course = res.json().find((c: { id: string }) => c.id === `${P}-course`);
    const lessons = course.topics[0].lessons;
    expect(lessons.map((l: { id: string }) => l.id)).toEqual([`${P}-free`, `${P}-paid`]);
    expect(lessons.find((l: { id: string }) => l.id === `${P}-paid`).locked).toBe(true);
    expect(course.topics[0].tests[0]).toMatchObject({ id: `${P}-test`, questionCount: 2, locked: false });
  });

  it("pullik dars obunasiz ochilmaydi: 403 SUBSCRIPTION_REQUIRED", async () => {
    const res = await inject({ method: "GET", url: `/api/lessons/${P}-paid`, headers: A.headers });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("SUBSCRIPTION_REQUIRED");
  });

  it("qoralama dars topilmaydi", async () => {
    const res = await inject({ method: "GET", url: `/api/lessons/${P}-draft`, headers: A.headers });
    expect(res.statusCode).toBe(404);
  });

  it("bepul dars ochiladi, tugatilgan deb belgilanadi va statistikada chiqadi", async () => {
    const res = await inject({ method: "GET", url: `/api/lessons/${P}-free`, headers: A.headers });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ nextLessonId: `${P}-paid`, completed: false });

    const done = await inject({ method: "POST", url: `/api/lessons/${P}-free/complete`, headers: A.headers });
    expect(done.statusCode).toBe(200);

    const stats = (await inject({ method: "GET", url: "/api/me/stats", headers: A.headers })).json();
    expect(stats.lessonsCompleted).toBe(1);
    expect(stats.lastLesson.id).toBe(`${P}-free`);
  });

  it("test oqimi: javoblar sizib chiqmaydi, baholash to'g'ri, davom ettirish ishlaydi", async () => {
    const start = await inject({ method: "POST", url: `/api/tests/${P}-test/attempts`, headers: A.headers });
    expect(start.statusCode).toBe(200);
    const state = start.json();
    expect(JSON.stringify(state)).not.toMatch(/isCorrect|correctText|explanation/);
    expect(state.questions).toHaveLength(2);

    // Qayta boshlash: o'sha urinish qaytadi
    const again = await inject({ method: "POST", url: `/api/tests/${P}-test/attempts`, headers: A.headers });
    expect(again.json().id).toBe(state.id);

    // Boshqa savolning varianti: 400
    const bad = await inject({
      method: "PUT",
      url: `/api/attempts/${state.id}/answers/${P}-q1`,
      headers: A.headers,
      payload: { optionIds: ["boshqa-id"] },
    });
    expect(bad.statusCode).toBe(400);

    await inject({
      method: "PUT",
      url: `/api/attempts/${state.id}/answers/${P}-q1`,
      headers: A.headers,
      payload: { optionIds: [`${P}-q1b`] },
    });
    await inject({
      method: "PUT",
      url: `/api/attempts/${state.id}/answers/${P}-q2`,
      headers: A.headers,
      payload: { textAnswer: "G'isht" }, // boshqa tutuq belgisi bilan
    });

    // Boshqa foydalanuvchi bu urinishni ko'rmaydi
    const spy = await inject({ method: "GET", url: `/api/attempts/${state.id}`, headers: B.headers });
    expect(spy.statusCode).toBe(404);

    const result = (await inject({ method: "POST", url: `/api/attempts/${state.id}/submit`, headers: A.headers })).json();
    expect(result).toMatchObject({ status: "SUBMITTED", score: 3, maxScore: 3, percent: 100, correctCount: 2 });
    expect(result.questions.find((q: { id: string }) => q.id === `${P}-q1`).correctOptionIds).toEqual([`${P}-q1b`]);

    // Yakunlangan urinishga javob yozib bo'lmaydi
    const late = await inject({
      method: "PUT",
      url: `/api/attempts/${state.id}/answers/${P}-q1`,
      headers: A.headers,
      payload: { optionIds: [`${P}-q1a`] },
    });
    expect(late.statusCode).toBe(409);

    // Ikkinchi submit natijani o'zgartirmaydi
    const twice = (await inject({ method: "POST", url: `/api/attempts/${state.id}/submit`, headers: A.headers })).json();
    expect(twice.score).toBe(3);
  });

  it("pullik mock obunasiz yopiq, obuna bilan ochiladi; muddat o'tsa EXPIRED", async () => {
    const locked = await inject({ method: "POST", url: `/api/tests/${P}-paidtest/attempts`, headers: B.headers });
    expect(locked.statusCode).toBe(403);

    const now = Date.now();
    await prisma.subscription.create({
      data: {
        userId: B.userId,
        planId: `${P}-plan`,
        startsAt: new Date(now - 1000),
        endsAt: new Date(now + 86_400_000),
      },
    });

    const lesson = await inject({ method: "GET", url: `/api/lessons/${P}-paid`, headers: B.headers });
    expect(lesson.statusCode).toBe(200);

    const mocks = (await inject({ method: "GET", url: "/api/mocks", headers: B.headers })).json();
    expect(mocks.find((m: { id: string }) => m.id === `${P}-paidtest`).locked).toBe(false);

    const start = (await inject({ method: "POST", url: `/api/tests/${P}-paidtest/attempts`, headers: B.headers })).json();
    expect(start.deadlineAt).not.toBeNull();

    // Muddatni o'tmishga suramiz (server vaqti bo'yicha tugagan)
    await prisma.attempt.update({ where: { id: start.id }, data: { deadlineAt: new Date(now - 60_000) } });
    const save = await inject({
      method: "PUT",
      url: `/api/attempts/${start.id}/answers/${P}-q1`,
      headers: B.headers,
      payload: { optionIds: [`${P}-q1b`] },
    });
    expect(save.statusCode).toBe(409);
    const res = (await inject({ method: "GET", url: `/api/attempts/${start.id}`, headers: B.headers })).json();
    expect(res.status).toBe("EXPIRED");
    expect(res.score).toBe(0);
  });
});
