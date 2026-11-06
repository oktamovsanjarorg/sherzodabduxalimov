import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { currentMonth } from "@onatili/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OWNER, createApp, login, parentTgId } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900002001, assistant: 900002002, student: 900002003 };
const TAG = "E2E-trash";

async function cleanup() {
  await prisma.trashItem.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { telegramId: { in: [...Object.values(TG).map(BigInt), parentTgId(TG.student)] } } });
  await prisma.course.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: TAG } } });
}

describe("Korzinka (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let A: Record<string, string>;
  const req = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object, headers = H) =>
    app.inject({ method, url: `/api${url}`, headers, payload });

  beforeAll(async () => {
    await cleanup();
    app = await createApp();
    H = (await login(app, TG.owner, "Ega", OWNER)).headers;
    await login(app, TG.assistant, "Yordamchi");
    await prisma.user.update({ where: { telegramId: BigInt(TG.assistant) }, data: { role: "ASSISTANT" } });
    A = (await login(app, TG.assistant, "Yordamchi")).headers;
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app?.close();
  });

  it("o'quvchi korzinkaga tushadi va hamma ma'lumotlari bilan aynan tiklanadi", async () => {
    const s = await login(app, TG.student, `${TAG} Bekzod`);
    await prisma.user.update({ where: { id: s.userId }, data: { firstName: `${TAG} Bekzod` } });
    const g = (await req("POST", "/admin/groups", { name: `${TAG} guruh` })).json();
    const sp = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: s.userId } });
    await req("POST", `/admin/groups/${g.id}/students`, { studentIds: [sp.id] });
    await req("PUT", "/admin/offline-payments", { studentId: sp.id, month: currentMonth(), amountUzs: 300000 });
    const before = { links: await prisma.parentLink.count({ where: { studentId: sp.id } }), pays: await prisma.offlinePayment.count({ where: { studentId: sp.id } }) };
    expect(before).toEqual({ links: 1, pays: 1 });

    expect((await req("DELETE", `/admin/students/${sp.id}?force=1`)).statusCode).toBe(200);
    expect(await prisma.user.count({ where: { id: s.userId } })).toBe(0);
    expect((await req("GET", "/me", undefined, s.headers)).statusCode).toBe(401);

    // Faqat ega ko'radi va tiklaydi
    expect((await req("GET", "/admin/trash", undefined, A)).statusCode).toBe(403);
    const item = (await req("GET", "/admin/trash")).json().find((x: { title: string }) => x.title.startsWith(`${TAG} Bekzod`));
    expect(item).toMatchObject({ kind: "STUDENT" });
    expect(item.rows).toBeGreaterThanOrEqual(4); // User, StudentProfile, ParentLink, OfflinePayment...
    expect(new Date(item.purgeAt).getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);

    expect((await req("POST", `/admin/trash/${item.id}/restore`)).statusCode).toBe(200);
    const back = await prisma.studentProfile.findUniqueOrThrow({ where: { id: sp.id }, include: { user: true } });
    expect(back.userId).toBe(s.userId);
    expect(back.groupId).toBe(g.id);
    expect(back.user.telegramId).toBe(BigInt(TG.student));
    expect({ links: await prisma.parentLink.count({ where: { studentId: sp.id } }), pays: await prisma.offlinePayment.count({ where: { studentId: sp.id } }) }).toEqual(before);
    expect((await req("GET", "/me", undefined, s.headers)).statusCode).toBe(200); // eski token yana ishlaydi
    expect((await req("POST", `/admin/trash/${item.id}/restore`)).statusCode).toBe(404);
  });

  it("o'quvchi botga qayta kirib yangi hisob ochgan bo'lsa, tiklash tushunarli xato beradi", async () => {
    const sp = await prisma.studentProfile.findFirstOrThrow({ where: { user: { telegramId: BigInt(TG.student) } } });
    await req("DELETE", `/admin/students/${sp.id}?force=1`);
    await login(app, TG.student, "Yangi hisob"); // xuddi shu Telegram hisobi bilan qayta kirdi
    const item = (await req("GET", "/admin/trash")).json().find((x: { title: string }) => x.title.startsWith(`${TAG} Bekzod`));
    const r = await req("POST", `/admin/trash/${item.id}/restore`);
    expect(r.statusCode).toBe(409);
    expect(r.json().message).toMatch(/yangi hisob/);
    // Butunlay o'chirish
    expect((await req("DELETE", `/admin/trash/${item.id}`)).statusCode).toBe(200);
    expect(await prisma.trashItem.count({ where: { id: item.id } })).toBe(0);
  });

  it("dars korzinkaga tushadi va tiklanadi; kurs bo'sh bo'lmasa o'chmaydi", async () => {
    const c = (await req("POST", "/admin/courses", { title: `${TAG} kurs` })).json();
    const t = (await req("POST", `/admin/courses/${c.id}/topics`, { title: `${TAG} mavzu` })).json();
    const l = (await req("POST", `/admin/topics/${t.id}/lessons`, { title: `${TAG} dars`, content: "Konspekt", isPublished: true })).json();
    expect((await req("DELETE", `/admin/lessons/${l.id}`, undefined, A)).statusCode).toBe(200); // yordamchi ham o'chira oladi, lekin korzinkaga
    expect(await prisma.lesson.count({ where: { id: l.id } })).toBe(0);
    const item = (await req("GET", "/admin/trash")).json().find((x: { title: string }) => x.title === `${TAG} dars`);
    expect(item.kind).toBe("LESSON");
    expect((await req("POST", `/admin/trash/${item.id}/restore`)).statusCode).toBe(200);
    expect(await prisma.lesson.findUniqueOrThrow({ where: { id: l.id } })).toMatchObject({ title: `${TAG} dars`, topicId: t.id, isPublished: true });
    expect((await req("DELETE", `/admin/topics/${t.id}`)).statusCode).toBe(409);
  });
});
