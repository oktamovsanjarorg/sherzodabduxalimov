import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { currentMonth } from "@onatili/shared";
import { internalKey } from "@onatili/shared/server";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessService } from "../src/access/access.service";
import { redisConnection } from "../src/media/queue";
import { NOTIFY_QUEUE, type NotifyJob } from "../src/notify/notify.service";
import { BOT_TOKEN, OWNER, createApp, login, parentTgId } from "./helpers";

const prisma = new PrismaClient();
const P = "e2e-access";
const TG = { owner: 900001001, fresh: 900001002, accepted: 900001003, parentOnly: 900001004, full: 900001005, free: 900001006, visitor: 900001007, mom: 900001008, late: 900001009, placeholderMom: 900001010, unpaid: 900001011, subscriber: 900001012 };
const ALL = [...Object.values(TG).map(BigInt), ...Object.values(TG).map(parentTgId)];
const queue = new Queue<NotifyJob>(NOTIFY_QUEUE, { prefix: "onatili-e2e", connection: redisConnection(process.env.REDIS_URL ?? "redis://localhost:6381") });
const jobs = async () => (await queue.getJobs(["waiting", "delayed", "prioritized"])).map((j) => j.data);

async function cleanup() {
  await prisma.user.deleteMany({ where: { OR: [{ telegramId: { in: ALL } }, { firstName: `${P}-qolda` }] } });
  await prisma.pendingParent.deleteMany({ where: { telegramId: { in: ALL } } });
  await prisma.course.deleteMany({ where: { id: `${P}-course` } });
  await prisma.test.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.plan.deleteMany({ where: { id: `${P}-plan` } });
  await queue.obliterate({ force: true });
}

describe("Kirish darajalari (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let ownerId: string;
  const req = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, headers: Record<string, string> = H, payload?: object) =>
    app.inject({ method, url: `/api${url}`, headers, payload });
  const internal = (path: string, payload: object) => app.inject({ method: "POST", url: `/api/internal/${path}`, headers: { "x-internal-key": internalKey(BOT_TOKEN) }, payload });
  const tg = (id: number, first_name: string) => ({ id, first_name });
  const lesson = (n: number, h: Record<string, string>) => req("GET", `/lessons/${P}-l${n}`, h);
  const start = (id: string, h: Record<string, string>) => req("POST", `/tests/${P}-${id}/attempts`, h);

  /** Hamma bo'limdan ikkinchi marta foydalanib ko'radi */
  async function canUseTwice(h: Record<string, string>) {
    await lesson(1, h);
    await start("t1", h);
    await start("m1", h);
    return [(await lesson(2, h)).statusCode, (await start("t2", h)).statusCode, (await start("m2", h)).statusCode];
  }

  beforeAll(async () => {
    await cleanup();
    await prisma.course.create({
      data: {
        id: `${P}-course`,
        title: "E2E",
        isPublished: true,
        order: 998,
        topics: {
          create: {
            id: `${P}-topic`,
            title: "Mavzu",
            lessons: { create: [1, 2].map((n) => ({ id: `${P}-l${n}`, title: `Dars ${n}`, isFree: true, isPublished: true, order: n })) },
          },
        },
      },
    });
    for (const [id, type] of [["t1", "TOPIC"], ["t2", "TOPIC"], ["m1", "MOCK"], ["m2", "MOCK"]] as const)
      await prisma.test.create({ data: { id: `${P}-${id}`, type, title: id, isFree: true, isPublished: true, ...(type === "TOPIC" ? { topicId: `${P}-topic` } : {}) } });
    app = await createApp();
    const owner = await login(app, TG.owner, "Ega", OWNER);
    H = owner.headers;
    ownerId = owner.userId;
  });
  afterAll(async () => {
    await cleanup();
    await queue.close();
    await prisma.$disconnect();
    await app?.close();
  });

  it("tasdiqlanmagan: har bo'limdan bir marta, o'sha darsni qayta ochish mumkin", async () => {
    const s = await login(app, TG.fresh, "Yangi", undefined, { withParent: false });
    expect((await lesson(1, s.headers)).statusCode).toBe(200);
    expect((await lesson(1, s.headers)).statusCode).toBe(200);
    const denied = await lesson(2, s.headers);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe("TRIAL_LIMIT");

    const first = await start("t1", s.headers);
    expect(first.statusCode).toBe(200);
    // Tugallanmagan urinishni davom ettirish bir martalik imkoniyatni yemaydi
    expect((await start("t1", s.headers)).json().id).toBe(first.json().id);
    expect((await start("t2", s.headers)).json().code).toBe("TRIAL_LIMIT");
    // Test turlari alohida hisoblanadi
    expect((await start("m1", s.headers)).statusCode).toBe(200);
    expect((await start("m2", s.headers)).json().code).toBe("TRIAL_LIMIT");

    const me = (await req("GET", "/me", s.headers)).json();
    expect(me.trial.limited).toBe(true);
    expect(me.trial.used.sort()).toEqual(["LESSON", "MOCK", "TOPIC_TEST"]);
  });

  it("esse ham bir marta", async () => {
    const s = await login(app, TG.fresh, "Yangi", undefined, { withParent: false });
    const access = app.get(AccessService);
    await access.useTrial(s.userId, "ESSAY");
    await expect(access.useTrial(s.userId, "ESSAY")).rejects.toMatchObject({ status: 403 });
  });

  it("faqat ustoz yoki faqat ota-ona tasdiqlagan bo'lsa ham cheklangan", async () => {
    const a = await login(app, TG.accepted, "Ustozli", undefined, { withParent: false });
    await prisma.studentProfile.update({ where: { userId: a.userId }, data: { acceptedAt: new Date() } });
    expect(await canUseTwice(a.headers)).toEqual([403, 403, 403]);

    const p = await login(app, TG.parentOnly, "Otali", undefined, { accepted: false, paid: false });
    expect(await canUseTwice(p.headers)).toEqual([403, 403, 403]);
    // Ota-ona hali kutilayotgan bo'lsa ham cheklangan
    await prisma.studentProfile.update({ where: { userId: p.userId }, data: { acceptedAt: new Date() } });
    await prisma.parentLink.updateMany({ where: { student: { userId: p.userId } }, data: { status: "PENDING" } });
    expect((await req("GET", "/me", p.headers)).json().trial.limited).toBe(true);
  });

  it("ustoz va ota-ona tasdiqlagan, lekin to'lovi yo'q: cheklangan; to'lov belgilansa to'liq", async () => {
    const s = await login(app, TG.unpaid, "Tolamagan", undefined, { paid: false });
    expect((await req("GET", "/me", s.headers)).json().trial).toMatchObject({ limited: true, accepted: true, paid: false });
    expect(await canUseTwice(s.headers)).toEqual([403, 403, 403]);
    const row = (await req("GET", "/admin/users?q=Tolamagan")).json()[0];
    expect(row).toMatchObject({ full: false, waiting: ["PAYMENT"], paid: false });

    const g = await prisma.group.create({ data: { name: `${P}-tolov` } });
    expect((await req("POST", `/admin/students/${row.studentId}/accept`, H, { groupId: g.id })).statusCode).toBe(200);
    expect((await req("GET", "/me", s.headers)).json().trial.limited).toBe(true);
    expect((await app.inject({ method: "PUT", url: "/api/admin/offline-payments", headers: H, payload: { studentId: row.studentId, month: currentMonth(), amountUzs: 100000 } })).statusCode).toBe(200);
    expect((await req("GET", "/me", s.headers)).json().trial).toMatchObject({ limited: false, paid: true });
    expect((await req("GET", "/admin/users?q=Tolamagan")).json()[0]).toMatchObject({ full: true, waiting: [], paid: true, group: { id: g.id } });
    expect(await canUseTwice(s.headers)).toEqual([200, 200, 200]);
    await prisma.offlinePayment.deleteMany({ where: { groupId: g.id } });
    await prisma.group.delete({ where: { id: g.id } });
  });

  it("faol obuna ham to'lov hisoblanadi", async () => {
    const s = await login(app, TG.subscriber, "Obunachi", undefined, { paid: false });
    const plan = await prisma.plan.create({ data: { id: `${P}-plan`, name: "Oylik", priceUzs: 1000, durationDays: 30 } });
    const now = Date.now();
    await prisma.subscription.create({ data: { userId: s.userId, planId: plan.id, startsAt: new Date(now - 1000), endsAt: new Date(now + 86_400_000) } });
    expect((await req("GET", "/me", s.headers)).json().trial).toMatchObject({ limited: false, paid: true });
  });

  it("ustoz va ota-ona tasdiqlagan: to'liq; ustoz qo'lda ochgan ham to'liq", async () => {
    const f = await login(app, TG.full, "Toliq");
    expect(await canUseTwice(f.headers)).toEqual([200, 200, 200]);
    expect((await req("GET", "/me", f.headers)).json().trial).toMatchObject({ limited: false, accepted: true, used: [] });

    const free = await login(app, TG.free, "Ochiq", undefined, { withParent: false });
    await prisma.studentProfile.update({ where: { userId: free.userId }, data: { accessMode: "FREE" } });
    expect(await canUseTwice(free.headers)).toEqual([200, 200, 200]);
  });

  it("guruhga qo'shilgan o'quvchi ustoz tasdiqlagan hisoblanadi", async () => {
    const g = await prisma.group.create({ data: { name: `${P}-guruh` } });
    const sp = await prisma.studentProfile.findFirstOrThrow({ where: { user: { telegramId: BigInt(TG.parentOnly) } } });
    await prisma.studentProfile.update({ where: { id: sp.id }, data: { acceptedAt: null } });
    expect((await req("POST", `/admin/groups/${g.id}/students`, H, { studentIds: [sp.id] })).statusCode).toBe(201);
    expect((await prisma.studentProfile.findUniqueOrThrow({ where: { id: sp.id } })).acceptedAt).not.toBeNull();
    await prisma.group.delete({ where: { id: g.id } });
  });

  it("oddiy /start: odam bir marta yoziladi va ro'yxatda ko'rinadi, ustozga ismini yozgunicha xabar bormaydi", async () => {
    expect((await internal("visit", tg(TG.visitor, "Mehmon"))).statusCode).toBe(200);
    await internal("visit", tg(TG.visitor, "Mehmon"));
    expect((await jobs()).filter((j) => j.chatId === String(TG.owner) && j.text.includes("Mehmon")).length).toBe(0);
    const rows = (await req("GET", "/admin/users?q=Mehmon")).json();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: "STUDENT", full: false, waiting: ["TEACHER", "PARENT", "PAYMENT"], telegramLinked: true });
    // Xodimlar va to'lov holati: ega ro'yxati xodimni ko'rsatmaydi
    expect((await req("GET", "/admin/users?q=Ega")).json().some((u: { userId: string }) => u.userId === ownerId)).toBe(false);
  });

  it("ota-ona havolasi: o'quvchi deb hisoblanmaydi, ilova raqam so'raydi, ro'yxatdan o'chiriladi", async () => {
    const sp = await prisma.studentProfile.findFirstOrThrow({ where: { user: { telegramId: BigInt(TG.full) } } });
    expect((await internal("parent-pending", { from: tg(TG.mom, "Onajon"), code: sp.parentLinkCode })).json()).toEqual({ status: "ok" });
    expect((await jobs()).some((j) => j.text.includes("Yangi o'quvchi") && j.text.includes("Onajon"))).toBe(false);
    const mom = await login(app, TG.mom, "Onajon");
    expect(mom.role).toBe("PARENT");
    expect((await req("GET", "/me", mom.headers)).json().pendingParentInvite).toBe(true);
    expect((await prisma.studentProfile.findMany({ where: { acceptedAt: null, user: { telegramId: BigInt(TG.mom), role: "STUDENT" } } })).length).toBe(0);

    await internal("parent-pending/take", { telegramId: TG.mom });
    await internal("parent-link", { code: sp.parentLinkCode, from: tg(TG.mom, "Onajon"), contact: { phone_number: "998901234001", user_id: TG.mom } });
    expect((await req("GET", "/me", mom.headers)).json().pendingParentInvite).toBe(false);

    const row = (await req("GET", "/admin/users?q=Onajon")).json()[0];
    expect(row).toMatchObject({ role: "PARENT", children: ["Toliq"] });
    expect((await req("DELETE", `/admin/students/${row.studentId}?force=1`)).statusCode).toBe(200);
    expect((await req("GET", "/admin/users?q=Onajon")).json()).toEqual([]);
    expect(await prisma.parentLink.count({ where: { student: { id: sp.id }, phone: "+998901234001" } })).toBe(0);
  });

  it("AI tekshiruvini bekor qilish: holat o'zgaradi, kech kelgan natija yozilmaydi, ikkinchi marta bo'lmaydi", async () => {
    const s = await login(app, TG.full, "Toliq");
    const e = await prisma.essay.create({ data: { userId: s.userId, mode: "AI", prompt: "Mavzu", text: "Matn", status: "AI_CHECKING" } });
    const res = await req("POST", `/essays/${e.id}/cancel`, s.headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("AI_FAILED");
    expect((await req("POST", `/essays/${e.id}/cancel`, s.headers)).statusCode).toBe(409);
    const other = await login(app, TG.free, "Ochiq", undefined, { withParent: false });
    expect((await req("POST", `/essays/${e.id}/cancel`, other.headers)).statusCode).toBe(404);
    // Bekor qilingan esseni o'chirsa bo'ladi
    expect((await req("DELETE", `/essays/${e.id}`, s.headers)).statusCode).toBe(200);
  });

  it("xodimni foydalanuvchilar ro'yxatidan o'chirib bo'lmaydi", async () => {
    const sp = await prisma.studentProfile.findFirstOrThrow({ where: { user: { telegramId: BigInt(TG.owner) } } });
    expect((await req("DELETE", `/admin/students/${sp.id}?force=1`)).statusCode).toBe(409);
  });

  it("muddati o'tgan ota-ona havolasi: expired, qo'lda kiritilgan yozuvga birlashmaydi", async () => {
    const sp = await prisma.studentProfile.findFirstOrThrow({ where: { user: { telegramId: BigInt(TG.full) } } });
    await internal("parent-pending", { from: tg(TG.late, "Kechikkan"), code: sp.parentLinkCode });
    await prisma.pendingParent.update({ where: { telegramId: BigInt(TG.late) }, data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) } });
    const late = await login(app, TG.late, "Kechikkan");
    expect((await req("GET", "/me", late.headers)).json().pendingParentInvite).toBe(false);
    expect((await internal("parent-pending/take", { telegramId: TG.late })).json()).toEqual({ code: null, expired: true });
  });

  it("ota-ona ulanishi rad etilsa ikkalasiga, tasdiqlansa ikkalasiga xabar boradi", async () => {
    const sp = await prisma.studentProfile.findFirstOrThrow({ where: { user: { telegramId: BigInt(TG.free) } } });
    await internal("parent-link", { code: sp.parentLinkCode, from: tg(TG.placeholderMom, "Rad"), contact: { phone_number: "998901234002", user_id: TG.placeholderMom } });
    const link = await prisma.parentLink.findFirstOrThrow({ where: { studentId: sp.id } });
    await queue.obliterate({ force: true });
    expect((await req("POST", `/admin/parent-links/${link.id}/reject`, H, { reason: "Begona" })).statusCode).toBe(200);
    let sent = await jobs();
    expect(sent.some((j) => j.chatId === String(TG.placeholderMom) && j.text.includes("rad etildi"))).toBe(true);
    expect(sent.some((j) => j.chatId === String(TG.free) && j.text.includes("rad etildi"))).toBe(true);
    await queue.obliterate({ force: true });
    expect((await req("POST", `/admin/parent-links/${link.id}/approve`)).statusCode).toBe(200);
    sent = await jobs();
    expect(sent.some((j) => j.chatId === String(TG.free) && j.text.includes("tasdiqlandi"))).toBe(true);
  });

  it("shaxsiy o'quvchi havolasini ota-ona ochsa: xodim deb aytilmaydi", async () => {
    const u = await prisma.user.create({
      data: { firstName: `${P}-qolda`, student: { create: { parentLinkCode: "E2EACC01", inviteCode: "e2eaccess1", acceptedAt: new Date() } } },
    });
    expect((await internal("claim-student", { code: "e2eaccess1", from: tg(TG.placeholderMom, "Rad") })).json().status).toBe("parent");
    await prisma.user.delete({ where: { id: u.id } });
  });
});
