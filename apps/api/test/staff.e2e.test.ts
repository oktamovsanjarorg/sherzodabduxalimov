import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { internalKey } from "@onatili/shared/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BOT_TOKEN, OWNER, createApp, login } from "./helpers";

const prisma = new PrismaClient();
const IDS = [900000201, 900000202, 900000203].map(BigInt);
const ASSISTANT = "e2e_helper";

async function cleanup() {
  await prisma.user.deleteMany({ where: { telegramId: { in: IDS } } });
  await prisma.staffInvite.deleteMany({ where: { username: { in: [ASSISTANT, "e2e_nobody"] } } });
}

describe("Xodimlar va admin kirishi (e2e)", () => {
  let app: NestFastifyApplication;
  const inject = (o: Parameters<NestFastifyApplication["inject"]>[0]) => app.inject(o);
  const internal = (body: object, key = internalKey(BOT_TOKEN)) =>
    inject({ method: "POST", url: "/api/internal/admin-login-link", headers: { "x-internal-key": key }, payload: body });

  beforeAll(async () => {
    await cleanup();
    app = await createApp();
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app?.close();
  });

  it("ega ro'yxatidagi username kirganda TEACHER bo'ladi (katta-kichik harf farqsiz)", async () => {
    const owner = await login(app, 900000201, "Ega", "E2E_Owner");
    expect(owner.role).toBe("TEACHER");
  });

  it("ichki endpoint kalitsiz yoki noto'g'ri kalit bilan yopiq", async () => {
    expect((await internal({ id: 900000201, first_name: "Ega", username: OWNER }, "wrong")).statusCode).toBe(401);
    const res = await inject({ method: "POST", url: "/api/internal/admin-login-link", payload: { id: 1, first_name: "x" } });
    expect(res.statusCode).toBe(401);
  });

  it("oddiy o'quvchiga havola berilmaydi", async () => {
    const res = await internal({ id: 900000203, first_name: "O'quvchi" });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBeNull();
  });

  it("havola bir marta ishlaydi va admin JWT beradi", async () => {
    const { url } = (await internal({ id: 900000201, first_name: "Ega", username: OWNER })).json();
    expect(url).toMatch(/^https:\/\/test\.local\/admin\/login#t=/);
    const token = url.split("#t=")[1];

    const first = await inject({ method: "POST", url: "/api/auth/admin-link", payload: { token } });
    expect(first.statusCode).toBe(200);
    expect(first.json().user.role).toBe("TEACHER");

    const second = await inject({ method: "POST", url: "/api/auth/admin-link", payload: { token } });
    expect(second.statusCode).toBe(401);
  });

  it("muddati o'tgan havola ishlamaydi", async () => {
    const { url } = (await internal({ id: 900000201, first_name: "Ega", username: OWNER })).json();
    const token = url.split("#t=")[1];
    await prisma.loginToken.updateMany({ where: { usedAt: null, user: { telegramId: IDS[0] } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await inject({ method: "POST", url: "/api/auth/admin-link", payload: { token } })).statusCode).toBe(401);
  });

  it("taklif: ega yordamchi qo'shadi, u botga kirganda ASSISTANT bo'ladi va xodimlarni boshqara olmaydi", async () => {
    const owner = await login(app, 900000201, "Ega", OWNER);
    const add = await inject({ method: "POST", url: "/api/admin/staff", headers: owner.headers, payload: { username: `@${ASSISTANT}` } });
    expect(add.json().status).toBe("invited");

    const helper = await login(app, 900000202, "Yordamchi", ASSISTANT);
    expect(helper.role).toBe("ASSISTANT");
    expect(await prisma.staffInvite.findUnique({ where: { username: ASSISTANT } })).toBeNull();

    // Yordamchi xodimlar ro'yxatini ko'ra olmaydi va qo'sha olmaydi
    expect((await inject({ method: "GET", url: "/api/admin/staff", headers: helper.headers })).statusCode).toBe(403);
    expect(
      (await inject({ method: "POST", url: "/api/admin/staff", headers: helper.headers, payload: { username: "e2e_nobody" } })).statusCode,
    ).toBe(403);

    // Yordamchi ham admin panel havolasini oladi
    expect((await internal({ id: 900000202, first_name: "Yordamchi", username: ASSISTANT })).json().url).toBeTruthy();

    const list = (await inject({ method: "GET", url: "/api/admin/staff", headers: owner.headers })).json();
    expect(list.staff.find((s: { username: string }) => s.username === ASSISTANT).role).toBe("ASSISTANT");

    // Ega o'zini va boshqa egani o'chira olmaydi, yordamchini o'chira oladi
    expect((await inject({ method: "DELETE", url: `/api/admin/staff/${owner.userId}`, headers: owner.headers })).statusCode).toBe(400);
    expect((await inject({ method: "DELETE", url: `/api/admin/staff/${helper.userId}`, headers: owner.headers })).statusCode).toBe(200);
    const after = await prisma.user.findUnique({ where: { id: helper.userId } });
    expect(after?.role).toBe("STUDENT");

    // Muhim: olib tashlangan yordamchining eski (hali muddati tugamagan) tokeni darhol ishlamay qoladi
    expect((await inject({ method: "GET", url: "/api/admin/courses", headers: helper.headers })).statusCode).toBe(403);

    // Bloklangan egada ham token darhol kuchini yo'qotadi
    await prisma.user.update({ where: { id: owner.userId }, data: { isBlocked: true } });
    expect((await inject({ method: "GET", url: "/api/admin/courses", headers: owner.headers })).statusCode).toBe(401);
    await prisma.user.update({ where: { id: owner.userId }, data: { isBlocked: false } });
  });
});
