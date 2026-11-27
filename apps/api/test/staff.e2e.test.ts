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

  it("Mini App: xodim o'z tokeni bilan admin havolasini oladi, o'quvchi olmaydi", async () => {
    const owner = await login(app, 900000201, "Ega", OWNER);
    const res = await inject({ method: "POST", url: "/api/me/admin-link", headers: owner.headers });
    expect(res.statusCode).toBe(200);
    const token = res.json().url.split("#t=")[1];
    const auth = await inject({ method: "POST", url: "/api/auth/admin-link", payload: { token } });
    expect(auth.json().user.role).toBe("TEACHER");

    const student = await login(app, 900000203, "O'quvchi");
    expect((await inject({ method: "POST", url: "/api/me/admin-link", headers: student.headers })).statusCode).toBe(403);
  });

  it("muddati o'tgan havola ishlamaydi", async () => {
    const { url } = (await internal({ id: 900000201, first_name: "Ega", username: OWNER })).json();
    const token = url.split("#t=")[1];
    await prisma.loginToken.updateMany({ where: { usedAt: null, user: { telegramId: IDS[0] } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await inject({ method: "POST", url: "/api/auth/admin-link", payload: { token } })).statusCode).toBe(401);
  });

  it("taklif: ega yordamchi qo'shadi, u botga kirganda ASSISTANT bo'ladi va xodimlarni boshqara olmaydi", async () => {
    const owner = await login(app, 900000201, "Ega", OWNER);
    const add = await inject({
      method: "POST",
      url: "/api/admin/staff",
      headers: owner.headers,
      payload: { username: `@${ASSISTANT}`, permissions: ["CONTENT", "ESSAYS"] },
    });
    expect(add.json().status).toBe("invited");

    const helper = await login(app, 900000202, "Yordamchi", ASSISTANT);
    expect(helper.role).toBe("ASSISTANT");
    expect(await prisma.staffInvite.findUnique({ where: { username: ASSISTANT } })).toBeNull();

    // Yordamchi xodimlar ro'yxatini ko'ra olmaydi va qo'sha olmaydi
    expect((await inject({ method: "GET", url: "/api/admin/staff", headers: helper.headers })).statusCode).toBe(403);
    expect(
      (await inject({ method: "POST", url: "/api/admin/staff", headers: helper.headers, payload: { username: "e2e_nobody", permissions: [] } })).statusCode,
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

  it("ruxsatlar: taklifdagisi o'tadi, ega o'zgartirsa darhol kuchga kiradi, yordamchi o'zi o'zgartira olmaydi", async () => {
    // Oldingi testdagi yordamchi botga kirmagan yangi odam bo'lib qaytsin: taklif yo'li tekshiriladi
    await prisma.user.deleteMany({ where: { telegramId: IDS[1] } });
    const owner = await login(app, 900000201, "Ega", OWNER);
    const post = (payload: object) => inject({ method: "POST", url: "/api/admin/staff", headers: owner.headers, payload });
    // Ruxsatlarsiz yoki noto'g'ri ruxsat bilan qo'shib bo'lmaydi
    expect((await post({ username: ASSISTANT })).statusCode).toBe(400);
    expect((await post({ username: ASSISTANT, permissions: ["NOPE"] })).statusCode).toBe(400);

    expect((await post({ username: ASSISTANT, permissions: ["CONTENT"] })).json().status).toBe("invited");
    const patchInvite = (permissions: string[]) =>
      inject({ method: "PATCH", url: `/api/admin/invites/${ASSISTANT}/permissions`, headers: owner.headers, payload: { permissions } });
    expect((await patchInvite(["EXTERNAL", "PAYMENTS"])).statusCode).toBe(200);
    const inv = (await inject({ method: "GET", url: "/api/admin/staff", headers: owner.headers })).json().invites;
    expect(inv.find((i: { username: string }) => i.username === ASSISTANT).permissions).toEqual(["EXTERNAL", "PAYMENTS"]);

    // Botga kirganda taklifdagi ruxsatlar beriladi
    const helper = await login(app, 900000202, "Yordamchi", ASSISTANT);
    expect(helper.role).toBe("ASSISTANT");
    const get = (url: string) => inject({ method: "GET", url: `/api${url}`, headers: helper.headers });
    expect((await get("/me")).json().permissions).toEqual(["EXTERNAL", "PAYMENTS"]);
    expect((await get("/admin/payments")).statusCode).toBe(200);
    expect((await get("/admin/external-tests")).statusCode).toBe(200);
    expect((await get("/admin/courses")).statusCode).toBe(403);
    expect((await get("/admin/trash")).statusCode).toBe(403);
    // Bosh sahifa ruxsatsiz ham ochiq; xodimlar va zaxira faqat egada
    expect((await get("/admin/dashboard")).statusCode).toBe(200);
    expect((await get("/admin/backups")).statusCode).toBe(403);

    // Ega ruxsatni o'zgartiradi: eski token bilan ham darhol yangi holat
    const patch = (headers: Record<string, string>, id: string, permissions: string[]) =>
      inject({ method: "PATCH", url: `/api/admin/staff/${id}/permissions`, headers, payload: { permissions } });
    expect((await patch(owner.headers, helper.userId, ["CONTENT"])).statusCode).toBe(200);
    expect((await get("/admin/courses")).statusCode).toBe(200);
    expect((await get("/admin/payments")).statusCode).toBe(403);
    expect((await get("/me")).json().permissions).toEqual(["CONTENT"]);

    // Yordamchi o'ziga ruxsat qo'sha olmaydi; egada ruxsat o'zgarmaydi (u doim hammasiga ega)
    expect((await patch(helper.headers, helper.userId, ["PAYMENTS"])).statusCode).toBe(403);
    expect((await patch(owner.headers, owner.userId, [])).statusCode).toBe(404);
    const ownerMe = (await inject({ method: "GET", url: "/api/me", headers: owner.headers })).json();
    expect(ownerMe.permissions).toContain("PAYMENTS");

    // Hammasi o'chirilsa ham bosh sahifa qoladi, boshqa bo'limlar yopiladi
    expect((await patch(owner.headers, helper.userId, [])).statusCode).toBe(200);
    expect((await get("/admin/courses")).statusCode).toBe(403);
    expect((await get("/admin/dashboard")).statusCode).toBe(200);
  });
});
