import "reflect-metadata";
import { Controller, Get } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@onatili/db";
import { signInitData } from "@onatili/shared/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { Roles } from "../src/auth/decorators";
import { loadEnv } from "../src/config/env";

const BOT_TOKEN = "123456:E2E_TEST_TOKEN";
const TG_ID = 900000001; // test foydalanuvchisi
const prisma = new PrismaClient();

@Controller("staff-only")
class StaffOnlyController {
  @Roles("TEACHER", "ASSISTANT")
  @Get()
  ok() {
    return { ok: true };
  }
}

function initData(user: object, botToken = BOT_TOKEN) {
  return signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user) }, botToken);
}

describe("Auth (e2e)", () => {
  let app: NestFastifyApplication;
  const inject = (opts: Parameters<NestFastifyApplication["inject"]>[0]) => app.inject(opts);

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { telegramId: BigInt(TG_ID) } });
    const env = loadEnv({ ...process.env, BOT_TOKEN, JWT_SECRET: "e2e-secret-e2e-secret" });
    const mod = await Test.createTestingModule({
      imports: [AppModule.forRoot(env)],
      controllers: [StaffOnlyController],
    }).compile();
    app = mod.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("api");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { telegramId: BigInt(TG_ID) } });
    await prisma.$disconnect();
    await app?.close();
  });

  it("health ochiq", async () => {
    const res = await inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
  });

  it("tokensiz /me — 401", async () => {
    const res = await inject({ method: "GET", url: "/api/me" });
    expect(res.statusCode).toBe(401);
  });

  it("soxta imzo — 401", async () => {
    const res = await inject({
      method: "POST",
      url: "/api/auth/telegram",
      payload: { initData: initData({ id: TG_ID, first_name: "X" }, "1:WRONG") },
    });
    expect(res.statusCode).toBe(401);
  });

  it("to'g'ri initData: user yaratadi, token beradi, /me ishlaydi, rol cheklovi ishlaydi", async () => {
    const login = await inject({
      method: "POST",
      url: "/api/auth/telegram",
      payload: { initData: initData({ id: TG_ID, first_name: "Aziza", username: "aziza" }) },
    });
    expect(login.statusCode).toBe(200);
    const { token, user } = login.json();
    expect(user.firstName).toBe("Aziza");
    expect(user.role).toBe("STUDENT");

    const db = await prisma.user.findUnique({ where: { telegramId: BigInt(TG_ID) }, include: { student: true } });
    expect(db?.student?.parentLinkCode).toMatch(/^[0-9A-F]{8}$/);

    const auth = { authorization: `Bearer ${token}` };
    const me = await inject({ method: "GET", url: "/api/me", headers: auth });
    expect(me.statusCode).toBe(200);
    expect(me.json().username).toBe("aziza");

    const staff = await inject({ method: "GET", url: "/api/staff-only", headers: auth });
    expect(staff.statusCode).toBe(403);
  });
});
