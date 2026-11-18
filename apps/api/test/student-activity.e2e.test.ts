import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { tashkentToday } from "@onatili/shared";
import { internalKey } from "@onatili/shared/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BOT_TOKEN, OWNER, createApp, login, parentTgId } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900000901, student: 900000902 };
const TAG = "E2E-activity";

async function cleanup() {
  const tg = Object.values(TG).map(BigInt);
  await prisma.user.deleteMany({ where: { telegramId: { in: [...tg, ...Object.values(TG).map(parentTgId)] } } });
  await prisma.user.deleteMany({ where: { firstName: { startsWith: TAG } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.course.deleteMany({ where: { title: { startsWith: TAG } } });
}

describe("O'quvchi faolligi va o'qishni boshlagan sana (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let S: Record<string, string>;
  let studentUserId = "";
  let studentId = "";
  let lessonId = "";
  const req = (method: "GET" | "POST" | "PATCH", url: string, payload?: object, headers = H) => app.inject({ method, url: `/api${url}`, headers, payload });

  beforeAll(async () => {
    await cleanup();
    app = await createApp();
    H = (await login(app, TG.owner, "Ega", OWNER)).headers;
    const st = await login(app, TG.student, `${TAG} O'quvchi`, undefined, { paid: false });
    S = st.headers;
    studentUserId = st.userId;
    studentId = (await prisma.studentProfile.findUniqueOrThrow({ where: { userId: studentUserId } })).id;
    const course = await prisma.course.create({ data: { title: `${TAG} kurs`, isPublished: true } });
    const topic = await prisma.topic.create({ data: { courseId: course.id, title: "Mavzu" } });
    lessonId = (await prisma.lesson.create({ data: { topicId: topic.id, title: `${TAG} bepul dars`, isPublished: true, isFree: true } })).id;
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app?.close();
  });

  it("ilovaga kirish, botga kirish va ochilgan dars yoziladi", async () => {
    const u0 = await prisma.user.findUniqueOrThrow({ where: { id: studentUserId } });
    expect(u0.botJoinedAt).not.toBeNull();
    expect(u0.lastAppAt).not.toBeNull();
    expect(u0.lastBotAt).toBeNull();

    const visit = await app.inject({
      method: "POST",
      url: "/api/internal/visit",
      headers: { "x-internal-key": internalKey(BOT_TOKEN) },
      payload: { id: TG.student, first_name: `${TAG} O'quvchi` },
    });
    expect(visit.statusCode).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: studentUserId } })).lastBotAt).not.toBeNull();

    expect((await req("GET", `/lessons/${lessonId}`, undefined, S)).statusCode).toBe(200);

    const d = (await req("GET", `/admin/students/${studentId}`)).json();
    expect(d.activity.lastBotAt).not.toBeNull();
    expect(d.activity.lastAppAt).not.toBeNull();
    expect(d.activity.lessons[0]).toMatchObject({ lessonId, title: `${TAG} bepul dars`, completedAt: null });
    expect(d.lastActiveAt).not.toBeNull();
  });

  it("o'qishni boshlagan sana: birinchi to'lov davri shundan; boshqa maydon tahrirlansa o'chmaydi", async () => {
    const groupId = (await req("POST", "/admin/groups", { name: `${TAG} guruh` })).json().id;
    // Guruhga qo'shilganda sana bo'sh bo'lsa: bugun
    expect((await req("PATCH", `/admin/students/${studentId}`, { groupId })).statusCode).toBe(200);
    expect((await req("GET", `/admin/students/${studentId}`)).json().startedOn).toBe(tashkentToday());

    expect((await req("PATCH", `/admin/students/${studentId}`, { startedOn: "2026-10-05" })).json().startedOn).toBe("2026-10-05");
    expect((await req("PATCH", `/admin/students/${studentId}`, { firstName: `${TAG} Yangi` })).json().startedOn).toBe("2026-10-05");

    const next = (await req("GET", `/admin/offline-payments/student/${studentId}`)).json();
    expect(next).toMatchObject({ startedOn: "2026-10-05", nextPeriodStart: "2026-10-05", coveredUntil: null });

    const ledger = (await req("GET", `/admin/offline-payments?groupId=${groupId}`)).json();
    expect(ledger.rows.find((r: { studentId: string }) => r.studentId === studentId)).toMatchObject({ startedOn: "2026-10-05", nextPeriodStart: "2026-10-05" });

    // Sana olib tashlansa: keyingi davr yana bugundan
    expect((await req("PATCH", `/admin/students/${studentId}`, { startedOn: null })).json().startedOn).toBeNull();
    expect((await req("GET", `/admin/offline-payments/student/${studentId}`)).json().nextPeriodStart).toBe(tashkentToday());
  });

  it("Statistika «e'tibor kerak» ro'yxati o'quvchi sahifasini profil ID si bilan ochadi (foydalanuvchi ID si emas)", async () => {
    const old = new Date(Date.now() - 30 * 86_400_000);
    const u = await prisma.user.create({ data: { firstName: `${TAG} Jim`, role: "STUDENT", createdAt: old, student: { create: { parentLinkCode: `E2EJIM${Date.now()}` } } }, include: { student: true } });
    const row = (await req("GET", "/admin/stats")).json().attention.find((x: { userId: string }) => x.userId === u.id);
    expect(row).toMatchObject({ studentId: u.student!.id });
    expect((await req("GET", `/admin/students/${row.studentId}`)).statusCode).toBe(200);
  });

  it("qo'lda qo'shilgan o'quvchi: sana berilmasa bugun, berilsa o'sha", async () => {
    const a = (await req("POST", "/admin/students", { firstName: `${TAG} Qo'lda` })).json();
    expect((await req("GET", `/admin/students/${a.studentId}`)).json()).toMatchObject({ startedOn: tashkentToday(), activity: { botJoinedAt: null, lessons: [] } });
    const b = (await req("POST", "/admin/students", { firstName: `${TAG} Sanali`, startedOn: "2026-09-01" })).json();
    expect((await req("GET", `/admin/students/${b.studentId}`)).json().startedOn).toBe("2026-09-01");
  });
});
