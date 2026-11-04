import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redisConnection } from "../src/media/queue";
import { NOTIFY_QUEUE, type NotifyJob } from "../src/notify/notify.service";
import { OWNER, createApp, login } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900000701, assistant: 900000702, student: 900000703, other: 900000704 };
const TAG = "E2E-billing";
const DAY = 86_400_000;
const queue = new Queue<NotifyJob>(NOTIFY_QUEUE, { prefix: "onatili-e2e", connection: redisConnection(process.env.REDIS_URL ?? "redis://localhost:6381") });

// Eng kichik haqiqiy JPEG sarlavhasi (server baytlardan tekshiradi)
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);

async function cleanup() {
  const users = await prisma.user.findMany({ where: { telegramId: { in: Object.values(TG).map(BigInt) } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.payment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.plan.deleteMany({ where: { name: { startsWith: TAG } } });
}

describe("Qo'lda to'lov va obuna (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let A: Record<string, string>;
  let S: Record<string, string>;
  let studentId = "";
  let planId = "";
  // Karta sozlamasi umumiy: test tugagach avvalgi holatiga qaytariladi
  let savedCard: Awaited<ReturnType<typeof prisma.appSetting.findUnique>> = null;
  const req = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object, headers = H) =>
    app.inject({ method, url: `/api${url}`, headers, payload });
  const upload = (url: string, body: Buffer, headers = S, type = "image/jpeg") =>
    app.inject({ method: "POST", url: `/api${url}`, headers: { ...headers, "content-type": type }, payload: body });

  beforeAll(async () => {
    savedCard = await prisma.appSetting.findUnique({ where: { key: "billing" } });
    await cleanup();
    await queue.obliterate({ force: true });
    app = await createApp();
    H = (await login(app, TG.owner, "Ega", OWNER)).headers;
    const s = await login(app, TG.student, "Bekzod");
    S = s.headers;
    studentId = (await req("GET", "/me", undefined, S)).json().id;
    await login(app, TG.assistant, "Yordamchi");
    await prisma.user.update({ where: { telegramId: BigInt(TG.assistant) }, data: { role: "ASSISTANT" } });
    A = (await login(app, TG.assistant, "Yordamchi")).headers;
  });
  afterAll(async () => {
    await cleanup();
    if (savedCard) await prisma.appSetting.update({ where: { key: "billing" }, data: { value: savedCard.value as object } });
    else await prisma.appSetting.deleteMany({ where: { key: "billing" } });
    await queue.close();
    await prisma.$disconnect();
    await app?.close();
  });

  it("ega: tarif va karta rekvizitlari; yordamchi va o'quvchi kira olmaydi", async () => {
    const p = await req("POST", "/admin/plans", { name: `${TAG} 1 oy`, priceUzs: 120000, durationDays: 30, sortOrder: -100 });
    expect(p.statusCode).toBe(201);
    planId = p.json().id;
    expect((await req("POST", "/admin/plans", { name: `${TAG} arzon`, priceUzs: 5, durationDays: 30 })).statusCode).toBe(400);

    expect((await req("PUT", "/admin/billing-settings", { number: "8600 12", holder: "Sherzod" })).statusCode).toBe(400);
    const card = (await req("PUT", "/admin/billing-settings", { number: "8600 1234 5678 9012", holder: "Sherzod Abduxalimov", note: "Izohga ismingizni yozing" })).json();
    expect(card.number).toBe("8600123456789012");

    expect((await req("GET", "/admin/payments", undefined, A)).statusCode).toBe(403);
    expect((await req("GET", "/admin/plans", undefined, S)).statusCode).toBe(403);
  });

  it("o'quvchi: tarif va kartani ko'radi, chek yuboradi; ikkinchisi kutilayotganda rad etiladi", async () => {
    const v = (await req("GET", "/billing", undefined, S)).json();
    expect(v.plans.find((p: { id: string }) => p.id === planId)).toMatchObject({ priceUzs: 120000 });
    expect(v.card).toMatchObject({ number: "8600123456789012", holder: "Sherzod Abduxalimov" });
    expect(v.subscription).toBeNull();

    expect((await upload(`/billing/payments?planId=${planId}`, Buffer.from("not an image"))).statusCode).toBe(400);
    const r = await upload(`/billing/payments?planId=${planId}&note=${encodeURIComponent("Onamning kartasidan")}`, JPEG);
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ status: "PENDING", amountUzs: 120000 });
    expect((await upload(`/billing/payments?planId=${planId}`, JPEG)).statusCode).toBe(409);
    expect((await req("GET", "/billing", undefined, S)).json().pending.id).toBe(r.json().id);

    const jobs = (await queue.getJobs(["waiting", "delayed"])).map((j) => j.data.text);
    expect(jobs.some((t) => t.includes("Yangi to'lov cheki") && t.includes("120 000"))).toBe(true);
  });

  it("ega: chekni ko'radi, rad etadi; o'quvchi qayta yuboradi, ega tasdiqlaydi va obuna ochiladi", async () => {
    let list = (await req("GET", "/admin/payments?status=PENDING")).json();
    let p = list.find((x: { student: { id: string } }) => x.student.id === studentId);
    expect(p).toMatchObject({ hasReceipt: true, payerNote: "Onamning kartasidan", activeUntil: null });

    const img = await req("GET", `/admin/payments/${p.id}/receipt`);
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toBe("image/jpeg");
    expect(img.rawPayload.equals(JPEG)).toBe(true);
    expect((await req("GET", `/admin/payments/${p.id}/receipt`, undefined, S)).statusCode).toBe(403);

    expect((await req("POST", `/admin/payments/${p.id}/reject`, { reason: "Summa to'liq emas" })).statusCode).toBe(200);
    expect((await req("POST", `/admin/payments/${p.id}/approve`)).statusCode).toBe(409);
    const v = (await req("GET", "/billing", undefined, S)).json();
    expect(v.pending).toBeNull();
    expect(v.history[0]).toMatchObject({ status: "REJECTED", reviewNote: "Summa to'liq emas" });

    // Qayta yuborish
    await upload(`/billing/payments?planId=${planId}`, JPEG);
    list = (await req("GET", "/admin/payments?status=PENDING")).json();
    p = list.find((x: { student: { id: string } }) => x.student.id === studentId);
    const ok = (await req("POST", `/admin/payments/${p.id}/approve`)).json();
    const days = (new Date(ok.endsAt).getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    expect((await req("POST", `/admin/payments/${p.id}/approve`)).statusCode).toBe(409); // ikki marta emas

    const me = (await req("GET", "/me", undefined, S)).json();
    expect(me.subscription).toMatchObject({ planName: `${TAG} 1 oy` });
    const jobs = (await queue.getJobs(["waiting", "delayed"])).map((j) => j.data.text);
    expect(jobs.some((t) => t.includes("qabul qilinmadi") && t.includes("Summa to'liq emas"))).toBe(true);
    expect(jobs.some((t) => t.includes("To'lovingiz tasdiqlandi"))).toBe(true);
  });

  it("qo'lda berish faol obunani uzaytiradi; bekor qilish kirishni yopadi", async () => {
    const before = (await req("GET", "/me", undefined, S)).json().subscription.endsAt;
    const g = (await req("POST", "/admin/subscriptions", { userId: studentId, planId, note: "Naqd" })).json();
    expect(new Date(g.endsAt).getTime() - new Date(before).getTime()).toBe(30 * DAY);

    const subs = (await req("GET", "/admin/subscriptions")).json().active.filter((s: { student: { id: string } }) => s.student.id === studentId);
    expect(subs).toHaveLength(2);
    for (const s of subs) expect((await req("POST", `/admin/subscriptions/${s.id}/cancel`)).statusCode).toBe(200);
    expect((await req("GET", "/me", undefined, S)).json().subscription).toBeNull();
  });

  it("chekni bir vaqtda ikki marta yuborsa ham bitta to'lov yaratiladi", async () => {
    const [a, b] = await Promise.all([upload(`/billing/payments?planId=${planId}`, JPEG), upload(`/billing/payments?planId=${planId}`, JPEG)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    expect(await prisma.payment.count({ where: { userId: studentId, status: "PENDING" } })).toBe(1);
    const p = [a, b].find((r) => r.statusCode === 201)!.json();
    await req("DELETE", `/billing/payments/${p.id}`, undefined, S);
  });

  it("o'quvchi kutilayotgan chekini bekor qila oladi, boshqa birovnikini emas", async () => {
    const mine = (await upload(`/billing/payments?planId=${planId}`, JPEG)).json();
    const O = (await login(app, TG.other, "Begona")).headers;
    expect((await req("DELETE", `/billing/payments/${mine.id}`, undefined, O)).statusCode).toBe(404);
    expect((await req("DELETE", `/billing/payments/${mine.id}`, undefined, S)).statusCode).toBe(200);
    expect((await req("GET", "/billing", undefined, S)).json().pending).toBeNull();
  });
});
