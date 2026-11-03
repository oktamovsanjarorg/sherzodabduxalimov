import "reflect-metadata";
import type { Type } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { signInitData } from "@onatili/shared/server";
import { AppModule } from "../src/app.module";
import { loadEnv } from "../src/config/env";

export const BOT_TOKEN = "123456:E2E_TEST_TOKEN";

export const OWNER = "e2e_owner";

export async function createApp(extraControllers: Type[] = []) {
  const env = loadEnv({
    ...process.env,
    BOT_TOKEN,
    JWT_SECRET: "e2e-secret-e2e-secret",
    OWNER_USERNAMES: OWNER,
    ADMIN_URL: "https://test.local/admin",
    MEDIA_DIR: process.env.E2E_MEDIA_DIR ?? "/tmp/onatili-e2e-media",
  });
  const mod = await Test.createTestingModule({
    imports: [AppModule.forRoot(env)],
    controllers: extraControllers,
  }).compile();
  const app = mod.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.setGlobalPrefix("api");
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export function initData(user: object, botToken = BOT_TOKEN) {
  return signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user) }, botToken);
}

/** Telegram orqali kirib, Authorization sarlavhasini qaytaradi */
export async function login(app: NestFastifyApplication, tgId: number, firstName = "Test", username?: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/telegram",
    payload: { initData: initData({ id: tgId, first_name: firstName, ...(username ? { username } : {}) }) },
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
  const { token, user } = res.json();
  return { headers: { authorization: `Bearer ${token}` }, userId: user.id as string, role: user.role as string };
}
