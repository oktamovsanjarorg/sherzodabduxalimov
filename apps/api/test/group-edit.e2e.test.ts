import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { afterAll, beforeAll, expect, it } from "vitest";
import { OWNER, createApp, login } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900000791, student: 900000792 };
const GROUP = "E2E tahrir";
const cleanup = async () => {
  await prisma.user.deleteMany({ where: { telegramId: { in: Object.values(TG).map(BigInt) } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: GROUP } } });
};

let app: NestFastifyApplication;
beforeAll(async () => {
  await cleanup();
  app = await createApp();
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
  await app?.close();
});

it("guruh nomi va jadvali tahrirlanadi, jadvalni bo'shatish mumkin, o'quvchi tahrirlay olmaydi", async () => {
  const H = (await login(app, TG.owner, "Ega", OWNER)).headers;
  const S = (await login(app, TG.student, "Aziz")).headers;
  const req = (method: "POST" | "PATCH" | "GET", url: string, payload?: object, headers = H) =>
    app.inject({ method, url: `/api/admin/groups${url}`, headers, payload });
  const { id } = (await req("POST", "", { name: GROUP, schedule: "ertalab" })).json();

  const upd = await req("PATCH", `/${id}`, { name: `  ${GROUP} 2 `, schedule: "Se, Pay, Sha 14:00" });
  expect(upd.json()).toMatchObject({ id, name: `${GROUP} 2`, schedule: "Se, Pay, Sha 14:00", isActive: true });
  expect((await req("PATCH", `/${id}`, { name: " ", schedule: null })).statusCode).toBe(400);
  expect((await req("PATCH", `/${id}`, { name: "x" }, S)).statusCode).toBe(403);

  expect((await req("PATCH", `/${id}`, { schedule: null })).statusCode).toBe(200);
  const list = (await req("GET", "")).json() as { id: string }[];
  expect(list.find((g) => g.id === id)).toMatchObject({ name: `${GROUP} 2`, schedule: null });
});
