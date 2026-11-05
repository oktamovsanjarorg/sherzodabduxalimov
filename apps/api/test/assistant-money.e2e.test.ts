import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { currentMonth } from "@onatili/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OWNER, createApp, login } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900001101, assistant: 900001102, student: 900001103 };
const TAG = "E2E-money";
const DAY = 86_400_000;

async function cleanup() {
  await prisma.user.deleteMany({ where: { telegramId: { in: Object.values(TG).map(BigInt) } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.plan.deleteMany({ where: { name: { startsWith: TAG } } });
}

/** Ustoz talabi: yordamchilar to'lov va pulga oid hech narsani ko'rmasligi va o'zgartira olmasligi kerak */
describe("Yordamchi pulga oid ma'lumotlarni ko'rmaydi (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let A: Record<string, string>;
  let studentId = "";
  let groupId = "";
  let paymentId = "";
  const req = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, headers: Record<string, string>, payload?: object) =>
    app.inject({ method, url: `/api${url}`, headers, payload });

  beforeAll(async () => {
    await cleanup();
    app = await createApp();
    H = (await login(app, TG.owner, "Ega", OWNER)).headers;
    await login(app, TG.assistant, "Yordamchi");
    await prisma.user.update({ where: { telegramId: BigInt(TG.assistant) }, data: { role: "ASSISTANT" } });
    A = (await login(app, TG.assistant, "Yordamchi")).headers;
    await login(app, TG.student, "Pulli");

    // Pulga oid ma'lumotlar: guruh, tarif, obuna, kutilayotgan chek, offline to'lov
    const u = await prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(TG.student) }, include: { student: true } });
    studentId = u.student!.id;
    groupId = (await prisma.group.create({ data: { name: `${TAG} guruh`, monthlyFeeUzs: 300000 } })).id;
    await prisma.studentProfile.update({ where: { id: studentId }, data: { groupId, mode: "OFFLINE" } });
    const plan = await prisma.plan.create({ data: { name: `${TAG} oy`, priceUzs: 100000, durationDays: 30 } });
    await prisma.subscription.create({ data: { userId: u.id, planId: plan.id, startsAt: new Date(), endsAt: new Date(Date.now() + 3 * DAY) } });
    paymentId = (await prisma.payment.create({ data: { userId: u.id, planId: plan.id, method: "MANUAL", amountUzs: 100000 } })).id;
    await prisma.offlinePayment.create({ data: { studentId, groupId, month: currentMonth(), amountUzs: 300000 } });
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app?.close();
  });

  it("pulga oid barcha endpointlar yordamchiga yopiq (403)", async () => {
    const forbidden: [Parameters<typeof req>[0], string, object?][] = [
      ["GET", "/admin/payments"],
      ["GET", "/admin/payments?status=APPROVED"],
      ["GET", `/admin/payments/${paymentId}/receipt`],
      ["POST", `/admin/payments/${paymentId}/approve`],
      ["POST", `/admin/payments/${paymentId}/reject`, { reason: "yo'q" }],
      ["GET", "/admin/subscriptions"],
      ["POST", "/admin/subscriptions", { userId: "x", planId: "y" }],
      ["GET", "/admin/plans"],
      ["POST", "/admin/plans", { name: "x", priceUzs: 5000, durationDays: 30 }],
      ["GET", "/admin/billing-settings"],
      ["PUT", "/admin/billing-settings", { number: "8600123456789012", holder: "Yordamchi" }],
      ["GET", `/admin/offline-payments?groupId=${groupId}`],
      ["PUT", "/admin/offline-payments", { studentId, month: currentMonth() }],
      ["DELETE", `/admin/offline-payments/${studentId}/${currentMonth()}`],
      ["PATCH", `/admin/offline-payments/groups/${groupId}/fee`, { monthlyFeeUzs: 1 }],
      ["POST", "/admin/offline-payments/remind", { groupId }],
      ["GET", "/admin/essay-settings"],
      ["PUT", "/admin/essay-settings", { priceUzs: 1 }],
      ["PATCH", `/admin/students/${studentId}/access`, { mode: "FREE" }],
      ["POST", `/admin/students/${studentId}/block`, { blocked: true }],
    ];
    for (const [m, url, body] of forbidden) {
      const r = await req(m, url, A, body);
      expect(`${m} ${url} -> ${r.statusCode}`).toBe(`${m} ${url} -> 403`);
    }
    // Ega uchun ochiq (tekshiruv to'g'ri ishlayotganini ko'rsatish uchun)
    expect((await req("GET", "/admin/payments", H)).statusCode).toBe(200);
  });

  it("umumiy sahifalarda pul ma'lumoti yashirin: bosh sahifa, o'quvchilar ro'yxati va kartasi", async () => {
    const dt = (await req("GET", "/admin/dashboard", H)).json();
    const da = (await req("GET", "/admin/dashboard", A)).json();
    expect(dt.pendingPayments).toBeGreaterThan(0);
    expect(dt.expiringSubscriptions).toBeGreaterThan(0);
    expect(da).toMatchObject({ pendingPayments: 0, expiringSubscriptions: 0 });

    const rowT = (await req("GET", `/admin/roster?groupId=${groupId}`, H)).json()[0];
    const rowA = (await req("GET", `/admin/roster?groupId=${groupId}`, A)).json()[0];
    expect(rowT.subscriptionEndsAt).not.toBeNull();
    expect(rowT.paidThisMonth).toBe(true);
    expect(rowA).toMatchObject({ subscriptionEndsAt: null, paidThisMonth: null });

    const cardA = (await req("GET", `/admin/students/${studentId}`, A)).json();
    expect(cardA).toMatchObject({ billing: null, subscriptionEndsAt: null, paidThisMonth: null });
    expect((await req("GET", `/admin/students/${studentId}`, H)).json().billing.offlineMonths[0]).toMatchObject({ paid: true, amountUzs: 300000 });

    // Guruhlar ro'yxatida oylik summa yo'q
    const g = (await req("GET", "/admin/groups", A)).json().find((x: { id: string }) => x.id === groupId);
    expect(g).not.toHaveProperty("monthlyFeeUzs");
  });
});
