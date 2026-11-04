import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./helpers";

describe("So'rovlar chegarasi (rate limit)", () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    app = await createApp([], { rateLimit: true });
  });
  afterAll(async () => {
    await app?.close();
  });

  it("kirish (auth): bitta IP'dan daqiqasiga 30 tadan ko'p so'rov to'xtatiladi; boshqa IP'ga ta'sir qilmaydi", async () => {
    const hit = (ip: string) => app.inject({ method: "POST", url: "/api/auth/telegram", headers: { "x-real-ip": ip }, payload: { initData: "x" } });
    const codes: number[] = [];
    for (let i = 0; i < 32; i++) codes.push((await hit("10.9.9.9")).statusCode);
    expect(codes.slice(0, 30).every((c) => c === 401)).toBe(true); // noto'g'ri initData
    expect(codes.slice(30)).toEqual([429, 429]);
    expect((await hit("10.9.9.8")).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/health", headers: { "x-real-ip": "10.9.9.9" } })).statusCode).toBe(200);
  });
});
