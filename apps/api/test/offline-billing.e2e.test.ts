import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { currentMonth } from "@onatili/shared";
import { internalKey } from "@onatili/shared/server";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reminderStageFor, runSubscriptionReminders } from "../src/billing/reminders";
import { redisConnection } from "../src/media/queue";
import { NOTIFY_QUEUE, type NotifyJob } from "../src/notify/notify.service";
import { BOT_TOKEN, OWNER, createApp, login, parentTgId } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900000801, offline: 900000802, online: 900000803, paid: 900000804, joiner: 900000805 };
const TAG = "E2E-offline";
const DAY = 86_400_000;
const queue = new Queue<NotifyJob>(NOTIFY_QUEUE, { prefix: "onatili-e2e", connection: redisConnection(process.env.REDIS_URL ?? "redis://localhost:6381") });

async function cleanup() {
  const tg = Object.values(TG).map(BigInt);
  await prisma.user.deleteMany({ where: { telegramId: { in: [...tg, ...Object.values(TG).map(parentTgId)] } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.course.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.plan.deleteMany({ where: { name: { startsWith: TAG } } });
}

describe("Offline guruh: kirish va oylik to'lov; online obuna eslatmalari (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let OFF: Record<string, string>;
  let ON: Record<string, string>;
  let groupId = "";
  let offlineStudentId = "";
  let paidStudentId = "";
  let lessonId = "";
  const month = currentMonth();
  const req = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object, headers = H) =>
    app.inject({ method, url: `/api${url}`, headers, payload });
  const jobs = async () => (await queue.getJobs(["waiting", "delayed"])).map((j) => j.data);

  beforeAll(async () => {
    await cleanup();
    await queue.obliterate({ force: true });
    app = await createApp();
    H = (await login(app, TG.owner, "Ega", OWNER)).headers;
    OFF = (await login(app, TG.offline, "Offline")).headers;
    ON = (await login(app, TG.online, "Online")).headers;
    await login(app, TG.paid, "Tolagan");
    // Ota-onalarni tasdiqlaymiz: eslatmalar faqat tasdiqlangan ota-onaga boradi
    await prisma.parentLink.updateMany({ where: { parent: { telegramId: { in: [parentTgId(TG.offline), parentTgId(TG.paid)] } } }, data: { status: "APPROVED" } });

    const course = await prisma.course.create({ data: { title: `${TAG} kurs`, isPublished: true } });
    const topic = await prisma.topic.create({ data: { courseId: course.id, title: "Mavzu" } });
    lessonId = (await prisma.lesson.create({ data: { topicId: topic.id, title: "Pullik dars", isPublished: true, isFree: false } })).id;

    groupId = (await req("POST", "/admin/groups", { name: `${TAG} 1-guruh` })).json().id;
    const sp = await prisma.studentProfile.findMany({ where: { user: { telegramId: { in: [BigInt(TG.offline), BigInt(TG.paid)] } } }, include: { user: true } });
    offlineStudentId = sp.find((s) => s.user.telegramId === BigInt(TG.offline))!.id;
    paidStudentId = sp.find((s) => s.user.telegramId === BigInt(TG.paid))!.id;
  });
  afterAll(async () => {
    await cleanup();
    await queue.close();
    await prisma.$disconnect();
    await app?.close();
  });

  it("offline guruhga qo'shilgan o'quvchiga pullik dars ochiladi, chiqarilsa yopiladi", async () => {
    expect((await req("GET", `/lessons/${lessonId}`, undefined, OFF)).statusCode).toBe(403);
    expect((await req("POST", `/admin/groups/${groupId}/students`, { studentIds: [offlineStudentId, paidStudentId] })).statusCode).toBeLessThan(300);

    expect((await req("GET", `/lessons/${lessonId}`, undefined, OFF)).statusCode).toBe(200);
    const me = (await req("GET", "/me", undefined, OFF)).json();
    expect(me.offlineGroup).toEqual({ name: `${TAG} 1-guruh` });
    const b = (await req("GET", "/billing", undefined, OFF)).json();
    expect(b.offline).toMatchObject({ groupName: `${TAG} 1-guruh` });
    expect(b.offline.months[0]).toMatchObject({ month, paid: false });

    // Online o'quvchi hali ham yopiq
    expect((await req("GET", `/lessons/${lessonId}`, undefined, ON)).statusCode).toBe(403);
    expect((await req("GET", "/billing", undefined, ON)).json().offline).toBeNull();

    // Guruh faol emas -> yopiladi
    await req("PATCH", `/admin/groups/${groupId}`, { isActive: false });
    expect((await req("GET", `/lessons/${lessonId}`, undefined, OFF)).statusCode).toBe(403);
    await req("PATCH", `/admin/groups/${groupId}`, { isActive: true });
  });

  it("guruh havolasi: o'quvchi botda bosib o'zi qo'shiladi; yangilansa eskisi ishlamaydi", async () => {
    const join = (code: string, id: number) =>
      app.inject({
        method: "POST",
        url: "/api/internal/join-group",
        headers: { "x-internal-key": internalKey(BOT_TOKEN) },
        payload: { code, from: { id, first_name: "Yangi", username: "yangi_e2e" } },
      });
    const url = (await req("POST", `/admin/groups/${groupId}/invite`)).json().inviteUrl as string;
    expect(url).toMatch(/^https:\/\/t\.me\/\w+\?start=g_[A-Za-z0-9_-]{8}$/);
    const code = url.split("g_")[1];
    expect((await req("GET", "/admin/groups")).json().find((g: { id: string }) => g.id === groupId).inviteUrl).toBe(url);

    // Hali botga kirmagan o'quvchi ham yaratiladi va guruhga tushadi
    expect((await join(code, TG.joiner)).json()).toMatchObject({ status: "joined", groupName: `${TAG} 1-guruh`, parentLinked: false });
    // Egaga xabar: yangi o'quvchi guruhga qo'shildi
    expect((await jobs()).some((j) => j.chatId === String(TG.owner) && j.text.includes("Yangi o'quvchi") && j.text.includes(`${TAG} 1-guruh`))).toBe(true);
    expect((await join(code, TG.joiner)).json().status).toBe("already");
    const sp = await prisma.studentProfile.findFirstOrThrow({ where: { user: { telegramId: BigInt(TG.joiner) } } });
    expect(sp).toMatchObject({ groupId, mode: "OFFLINE" });
    expect((await join(code, TG.owner)).json().status).toBe("staff");
    // Kalitsiz chaqirib bo'lmaydi
    expect((await app.inject({ method: "POST", url: "/api/internal/join-group", payload: { code, from: { id: 1, first_name: "x" } } })).statusCode).toBe(401);

    // Yangi havola: eskisi ishlamaydi; o'chirilsa ham
    const url2 = (await req("POST", `/admin/groups/${groupId}/invite`)).json().inviteUrl as string;
    expect(url2).not.toBe(url);
    expect((await join(code, TG.joiner)).json().status).toBe("invalid");
    await req("DELETE", `/admin/groups/${groupId}/invite`);
    expect((await join(url2.split("g_")[1], TG.joiner)).json().status).toBe("invalid");
    // Testning qolgan qismi uchun guruhdan chiqaramiz
    await req("DELETE", `/admin/groups/${groupId}/students/${sp.id}`);
  });

  it("ega: oylik summa, to'lovni belgilash (ota-onaga xabar), qarzdorlarga eslatma", async () => {
    expect((await req("PATCH", `/admin/offline-payments/groups/${groupId}/fee`, { monthlyFeeUzs: 300000 })).statusCode).toBe(200);
    let l = (await req("GET", `/admin/offline-payments?groupId=${groupId}&month=${month}`)).json();
    expect(l.totals).toEqual({ students: 2, paid: 0, debtors: 2, sumUzs: 0 });
    expect((await req("GET", `/admin/offline-payments?groupId=${groupId}`, undefined, OFF)).statusCode).toBe(403);

    // Summa ko'rsatilmasa guruh summasi olinadi
    expect((await req("PUT", "/admin/offline-payments", { studentId: paidStudentId, month, note: "Naqd" })).statusCode).toBe(200);
    l = (await req("GET", `/admin/offline-payments?groupId=${groupId}&month=${month}`)).json();
    expect(l.totals).toEqual({ students: 2, paid: 1, debtors: 1, sumUzs: 300000 });
    expect(l.rows[0].paid).toBeNull(); // qarzdorlar tepada
    expect(l.rows[1].paid).toMatchObject({ amountUzs: 300000, note: "Naqd" });
    expect((await jobs()).some((j) => j.chatId === String(parentTgId(TG.paid)) && j.text.includes("qabul qilindi"))).toBe(true);

    const r = (await req("POST", "/admin/offline-payments/remind", { groupId, month })).json();
    expect(r).toEqual({ students: 1, messages: 2 }); // ota-ona + o'quvchining o'zi
    const texts = (await jobs()).filter((j) => j.chatId === String(parentTgId(TG.offline))).map((j) => j.text);
    expect(texts.some((t) => t.includes("hali qabul qilinmagan") && t.includes("300 000"))).toBe(true);
    // Qayta-qayta yuborib bo'lmaydi
    expect((await req("POST", "/admin/offline-payments/remind", { groupId, month })).statusCode).toBe(409);

    // Offline o'quvchi obuna sotib olishi shart emas
    const plan = (await req("POST", "/admin/plans", { name: `${TAG} oy`, priceUzs: 100000, durationDays: 30 })).json();
    const up = await app.inject({ method: "POST", url: `/api/billing/payments?planId=${plan.id}`, headers: { ...OFF, "content-type": "image/jpeg" }, payload: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) });
    expect(up.statusCode).toBe(409);

    // Guruhdan chiqqan o'quvchining to'lovini tahrirlash (avval 500 xato berardi) va boshqa guruhda ikki marta hisoblanmasligi
    const g2 = (await req("POST", "/admin/groups", { name: `${TAG} 2-guruh` })).json().id;
    await req("POST", `/admin/groups/${g2}/students`, { studentIds: [paidStudentId] });
    expect((await req("PUT", "/admin/offline-payments", { studentId: paidStudentId, month, amountUzs: 250000, note: "Tuzatildi" })).statusCode).toBe(200);
    const l1 = (await req("GET", `/admin/offline-payments?groupId=${groupId}&month=${month}`)).json();
    const l2 = (await req("GET", `/admin/offline-payments?groupId=${g2}&month=${month}`)).json();
    expect(l1.totals.sumUzs).toBe(250000); // to'lov 1-guruhda olingan
    expect(l2.totals).toMatchObject({ paid: 1, sumUzs: 0 }); // 2-guruhda "to'lagan", lekin summa qayta qo'shilmaydi
    await req("DELETE", `/admin/groups/${g2}/students/${paidStudentId}`);
    await req("POST", `/admin/groups/${groupId}/students`, { studentIds: [paidStudentId] });

    expect((await req("DELETE", `/admin/offline-payments/${paidStudentId}/${month}`)).statusCode).toBe(200);
    expect((await req("GET", `/admin/offline-payments?groupId=${groupId}&month=${month}`)).json().totals.paid).toBe(0);
  });

  it("online obuna: 3 kun, 1 kun qolganda va tugaganda bittadan eslatma; uzaytirilganga yuborilmaydi", async () => {
    const now = new Date();
    expect([5, 2.5, 0.5, -0.1].map((d) => reminderStageFor(new Date(now.getTime() + d * DAY), now))).toEqual([0, 1, 2, 3]);

    const user = await prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(TG.online) } });
    const plan = await prisma.plan.findFirstOrThrow({ where: { name: { startsWith: TAG } } });
    const sub = await prisma.subscription.create({ data: { userId: user.id, planId: plan.id, startsAt: new Date(now.getTime() - 28 * DAY), endsAt: new Date(now.getTime() + 2.5 * DAY) } });

    const sent: { chatId: bigint; text: string; url?: string }[] = [];
    const send = async (chatId: bigint, text: string, b?: { webAppUrl: string }) => void sent.push({ chatId, text, url: b?.webAppUrl });
    const mine = () => sent.filter((x) => x.chatId === BigInt(TG.online));
    const run = (t: Date) => runSubscriptionReminders(prisma, send, "https://app.example.uz", t);

    await run(now);
    await run(now); // ikkinchi marta yuborilmaydi
    expect(mine()).toHaveLength(1);
    expect(mine()[0]).toMatchObject({ url: "https://app.example.uz/subscribe" });
    expect(mine()[0].text).toContain("3 kun");

    await run(new Date(now.getTime() + 2 * DAY)); // 0,5 kun qoldi
    expect(mine()[1].text).toContain("ertaga");
    await run(new Date(now.getTime() + 3 * DAY)); // tugadi
    expect(mine()[2].text).toContain("tugadi");
    await run(new Date(now.getTime() + 3.5 * DAY));
    expect(mine()).toHaveLength(3);

    // Imtiyoz: tugaganiga 1 kun bo'lmagan obuna hali ochiq
    await prisma.subscription.update({ where: { id: sub.id }, data: { endsAt: new Date(Date.now() - 3600_000) } });
    expect((await req("GET", `/lessons/${lessonId}`, undefined, ON)).statusCode).toBe(200);
    expect((await req("GET", "/admin/subscriptions")).json().lapsed.some((s: { id: string }) => s.id === sub.id)).toBe(true);
    await prisma.subscription.update({ where: { id: sub.id }, data: { endsAt: new Date(Date.now() - 1.1 * DAY) } });
    expect((await req("GET", `/lessons/${lessonId}`, undefined, ON)).statusCode).toBe(403);

    // Uzaytirilgan obunaga eslatma ketmaydi
    const s2 = await prisma.subscription.create({ data: { userId: user.id, planId: plan.id, startsAt: now, endsAt: new Date(now.getTime() + 2 * DAY) } });
    await prisma.subscription.create({ data: { userId: user.id, planId: plan.id, startsAt: s2.endsAt, endsAt: new Date(s2.endsAt.getTime() + 30 * DAY) } });
    const before = mine().length;
    await run(now);
    expect(mine()).toHaveLength(before);
  });
});
