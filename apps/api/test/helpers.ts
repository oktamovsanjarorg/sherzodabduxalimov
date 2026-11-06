import "reflect-metadata";
import type { Type } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@onatili/db";
import { currentMonth } from "@onatili/shared";
import { signInitData } from "@onatili/shared/server";
import { AppModule } from "../src/app.module";
import { loadEnv } from "../src/config/env";
import { configureApp } from "../src/setup";

export const BOT_TOKEN = "123456:E2E_TEST_TOKEN";

export const OWNER = "e2e_owner";

export async function createApp(extraControllers: Type[] = [], opts: { rateLimit?: boolean } = {}) {
  const env = loadEnv({
    ...process.env,
    BOT_TOKEN,
    JWT_SECRET: "e2e-secret-e2e-secret",
    OWNER_USERNAMES: OWNER,
    ADMIN_URL: "https://test.local/admin",
    MEDIA_DIR: process.env.E2E_MEDIA_DIR ?? "/tmp/onatili-e2e-media",
    QUEUE_PREFIX: "onatili-e2e",
  });
  const mod = await Test.createTestingModule({
    imports: [AppModule.forRoot(env)],
    controllers: extraControllers,
  }).compile();
  const app = mod.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await configureApp(app, { rateLimit: opts.rateLimit ?? false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export function initData(user: object, botToken = BOT_TOKEN) {
  return signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user) }, botToken);
}

const prisma = new PrismaClient();
/** Test ota-onasining telegramId'si: o'quvchinikidan aniq farq qiladi */
export const parentTgId = (tgId: number) => BigInt(tgId) + 1_000_000_000n;

/**
 * Telegram orqali kirib, Authorization sarlavhasini qaytaradi.
 * O'quvchiga avtomatik tasdiqlangan ota-ona ulanadi, ustoz qabul qiladi va shu oy to'lovi yoziladi (to'liq foydalanish).
 * withParent: false, accepted: false yoki paid: false bilan tegishli qadam o'tkazib yuboriladi.
 */
export async function login(app: NestFastifyApplication, tgId: number, firstName = "Test", username?: string, opts: { withParent?: boolean; accepted?: boolean; paid?: boolean } = {}) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/telegram",
    payload: { initData: initData({ id: tgId, first_name: firstName, ...(username ? { username } : {}) }) },
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
  const { token, user } = res.json();
  if (user.role === "STUDENT" && opts.withParent !== false) {
    const parent = await prisma.user.upsert({
      where: { telegramId: parentTgId(tgId) },
      update: {},
      create: { telegramId: parentTgId(tgId), firstName: "Ota", role: "PARENT" },
    });
    const sp = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: user.id } });
    await prisma.parentLink.upsert({
      where: { parentId_studentId: { parentId: parent.id, studentId: sp.id } },
      update: {},
      create: { parentId: parent.id, studentId: sp.id, status: "APPROVED" },
    });
    if (opts.accepted !== false) await prisma.studentProfile.update({ where: { id: sp.id }, data: { acceptedAt: sp.acceptedAt ?? new Date() } });
    const month = currentMonth();
    if (opts.paid !== false) await prisma.offlinePayment.upsert({ where: { studentId_month: { studentId: sp.id, month } }, update: {}, create: { studentId: sp.id, month, amountUzs: 0 } });
  }
  return { headers: { authorization: `Bearer ${token}` }, userId: user.id as string, role: user.role as string };
}
