import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { internalKey } from "@onatili/shared/server";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attendanceMessage } from "../src/attendance/attendance.service";
import { redisConnection } from "../src/media/queue";
import { NOTIFY_QUEUE, type NotifyJob } from "../src/notify/notify.service";
import { BOT_TOKEN, OWNER, createApp, login, parentTgId } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900000501, student: 900000502, mom: 900000503, dad: 900000504, sneaky: 900000505, third: 900000506 };
const ALL = [...Object.values(TG).map(BigInt), ...Object.values(TG).map(parentTgId)];
const GROUP = "E2E guruh";
const queue = new Queue<NotifyJob>(NOTIFY_QUEUE, { prefix: "onatili-e2e", connection: redisConnection(process.env.REDIS_URL ?? "redis://localhost:6381") });

async function cleanup() {
  await prisma.attendance.deleteMany({ where: { group: { name: GROUP } } });
  await prisma.user.deleteMany({ where: { telegramId: { in: ALL } } });
  await prisma.pendingParent.deleteMany({ where: { telegramId: { in: ALL } } });
  await prisma.group.deleteMany({ where: { name: GROUP } });
  await queue.obliterate({ force: true });
}
const jobs = async () => (await queue.getJobs(["waiting", "delayed", "prioritized"])).map((j) => j.data);
const tgUser = (id: number, first_name: string, username?: string) => ({ id, first_name, ...(username ? { username } : {}) });

describe("Ota-ona va davomat (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>; // ega
  let S: Awaited<ReturnType<typeof login>>; // o'quvchi
  let code: string;
  const req = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object, headers = H) =>
    app.inject({ method, url: `/api${url}`, headers, payload });
  const internal = (path: string, payload: object, key = internalKey(BOT_TOKEN)) =>
    app.inject({ method: "POST", url: `/api/internal/${path}`, headers: { "x-internal-key": key }, payload });

  beforeAll(async () => {
    await cleanup();
    app = await createApp();
    H = (await login(app, TG.owner, "Ega", OWNER)).headers;
    S = await login(app, TG.student, "Aziz", "aziz_e2e", { withParent: false });
    code = (await prisma.studentProfile.findUniqueOrThrow({ where: { userId: S.userId } })).parentLinkCode;
  });
  afterAll(async () => {
    await cleanup();
    await queue.close();
    await prisma.$disconnect();
    await app?.close();
  });

  it("ota-onasiz o'quvchi cheklangan rejimda: kontent ro'yxati ochiq", async () => {
    const me = (await req("GET", "/me", undefined, S.headers)).json();
    expect(me.parentStatus).toBe("NONE");
    expect(me.trial).toMatchObject({ limited: true, accepted: false });
    expect((await req("GET", "/courses", undefined, S.headers)).statusCode).toBe(200);
    expect((await req("GET", "/mocks", undefined, S.headers)).statusCode).toBe(200);
  });

  it("o'quvchi o'z raqamini ulashadi: boshqaning kontakti qabul qilinmaydi", async () => {
    const foreign = await internal("user-phone", { from: tgUser(TG.student, "Aziz"), contact: { phone_number: "998901112233", user_id: TG.mom } });
    expect(foreign.json().status).toBe("not_own_contact");
    const own = await internal("user-phone", { from: tgUser(TG.student, "Aziz", "aziz_e2e"), contact: { phone_number: "998 90 111 22 33", user_id: TG.student } });
    expect(own.json().status).toBe("saved");
    expect((await req("GET", "/me", undefined, S.headers)).json().phone).toBe("+998901112233");
  });

  it("bot so'rovi (photo_url'siz) profil rasmini o'chirmaydi", async () => {
    await prisma.user.update({ where: { id: S.userId }, data: { photoUrl: "https://t.me/i/userpic/x.jpg" } });
    await internal("user-phone", { from: tgUser(TG.student, "Aziz", "aziz_e2e"), contact: { phone_number: "998901112233", user_id: TG.student } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: S.userId } })).photoUrl).toBe("https://t.me/i/userpic/x.jpg");
  });

  it("taklif havolasi to'g'ri yasaladi", async () => {
    const r = (await req("GET", "/me/parents", undefined, S.headers)).json();
    expect(r.inviteUrl).toMatch(new RegExp(`^https://t\\.me/[A-Za-z0-9_]+\\?start=p_${code}$`));
    expect(r.parents).toEqual([]);
  });

  it("firibgarlikka qarshi: noto'g'ri kalit, noto'g'ri kod, o'zini ulash, boshqaning kontakti", async () => {
    const mom = { code, from: tgUser(TG.mom, "Malika"), contact: { phone_number: "998935556677", user_id: TG.mom } };
    expect((await internal("parent-link", mom, "wrong-key")).statusCode).toBe(401);
    expect((await internal("parent-link", { ...mom, code: "00000000" })).json().status).toBe("invalid_code");
    expect(
      (await internal("parent-link", { code, from: tgUser(TG.student, "Aziz"), contact: { phone_number: "998901112233", user_id: TG.student } })).json().status,
    ).toBe("self");
    expect((await internal("parent-link", { ...mom, contact: { phone_number: "998935556677", user_id: TG.dad } })).json().status).toBe("not_own_contact");
  });

  it("kutilayotgan ota-ona kodi bazada saqlanadi (bot qayta ishga tushsa ham), bir marta olinadi", async () => {
    const third = tgUser(TG.third, "Uchinchi");
    expect((await internal("parent-pending", { from: third, code })).json()).toEqual({ status: "ok" });
    expect((await internal("parent-pending/take", { telegramId: TG.third })).json()).toEqual({ code });
    expect((await internal("parent-pending/take", { telegramId: TG.third })).json()).toEqual({ code: null });
    expect((await internal("parent-pending", { from: third, code }, "wrong")).statusCode).toBe(401);
    expect((await internal("parent-pending", { from: third, code: "not-hex!" })).statusCode).toBe(400);
    expect((await internal("parent-pending", { from: third, code: "00000000" })).json()).toEqual({ status: "invalid" });
    expect((await internal("parent-pending", { from: tgUser(TG.student, "Aziz"), code })).json()).toEqual({ status: "self" });
  });

  it("ona ulanadi: PENDING, ilova ochiladi; shubhali 'ota' belgilanadi; 3-ota-ona rad etiladi", async () => {
    const r = await internal("parent-link", { code, from: tgUser(TG.mom, "Malika"), contact: { phone_number: "998935556677", user_id: TG.mom } });
    expect(r.json()).toMatchObject({ status: "created", studentName: "Aziz" });
    expect((await req("GET", "/me", undefined, S.headers)).json().parentStatus).toBe("PENDING");
    expect((await req("GET", "/courses", undefined, S.headers)).statusCode).toBe(200);

    // Takroriy so'rov
    expect((await internal("parent-link", { code, from: tgUser(TG.mom, "Malika"), contact: { phone_number: "998935556677", user_id: TG.mom } })).json().status).toBe("exists");

    // "Ota": aslida o'quvchining ikkinchi akkaunti, ilovada test yechgan va raqami o'quvchiniki bilan bir xil
    const sneaky = await login(app, TG.sneaky, "Dadam", undefined, { withParent: true });
    await prisma.lessonProgress.create({ data: { userId: sneaky.userId, lessonId: (await prisma.lesson.findFirstOrThrow()).id } });
    await internal("parent-link", { code, from: tgUser(TG.sneaky, "Dadam"), contact: { phone_number: "+998901112233", user_id: TG.sneaky } });
    const link = await prisma.parentLink.findFirstOrThrow({ where: { parent: { telegramId: BigInt(TG.sneaky) } } });
    expect(link.flags).toEqual(expect.arrayContaining(["same_phone", "student_activity"]));
    // O'quvchi sifatida ishlagan akkaunt PARENT roliga o'tmaydi
    expect((await prisma.user.findUniqueOrThrow({ where: { id: sneaky.userId } })).role).toBe("STUDENT");

    // 2 ta faol so'rov bor: uchinchisi qabul qilinmaydi
    expect((await internal("parent-link", { code, from: tgUser(TG.third, "Boshqa"), contact: { phone_number: "998977777777", user_id: TG.third } })).json().status).toBe("limit");

    // O'quvchiga xabar navbatga qo'yilgan
    expect((await jobs()).some((j) => j.chatId === String(TG.student) && j.text.includes("Malika"))).toBe(true);
  });

  it("admin: o'quvchi navbatni ko'ra olmaydi; ega onani tasdiqlaydi, shubhali so'rovni rad etadi", async () => {
    expect((await req("GET", "/admin/parent-links?status=PENDING", undefined, S.headers)).statusCode).toBe(403);
    const list = (await req("GET", "/admin/parent-links?status=PENDING")).json();
    const mom = list.find((l: { parent: { telegramId: string } }) => l.parent.telegramId === String(TG.mom));
    const sneaky = list.find((l: { parent: { telegramId: string } }) => l.parent.telegramId === String(TG.sneaky));
    expect(mom).toMatchObject({ phone: "+998935556677", student: { name: "Aziz", phone: "+998901112233" }, flags: [] });

    expect((await req("POST", `/admin/parent-links/${sneaky.id}/reject`, { reason: "" })).statusCode).toBe(400);
    expect((await req("POST", `/admin/parent-links/${sneaky.id}/reject`, { reason: "Raqam o'quvchiniki" })).statusCode).toBe(200);
    expect((await req("POST", `/admin/parent-links/${mom.id}/approve`)).statusCode).toBe(200);
    expect((await req("POST", `/admin/parent-links/${mom.id}/approve`)).statusCode).toBe(409);

    expect((await req("GET", "/me", undefined, S.headers)).json().parentStatus).toBe("APPROVED");
    const j = await jobs();
    expect(j.some((x) => x.chatId === String(TG.mom) && x.text.includes("tasdiqlandingiz"))).toBe(true);
    expect(j.some((x) => x.chatId === String(TG.student) && x.text.includes("Raqam o'quvchiniki"))).toBe(true);

    // Rad etilgan akkaunt qayta so'rov yubora olmaydi
    expect((await internal("parent-link", { code, from: tgUser(TG.sneaky, "Dadam"), contact: { phone_number: "998901112233", user_id: TG.sneaky } })).json().status).toBe("rejected_before");
  });

  it("davomat: faqat tasdiqlangan ota-onaga xabar; takror saqlash xabar yubormaydi; o'zgarsa 'Tuzatish'", async () => {
    await queue.obliterate({ force: true });
    const group = (await req("POST", "/admin/groups", { name: GROUP, schedule: "Du/Chor/Ju 14:00" })).json();
    const studentId = (await prisma.studentProfile.findUniqueOrThrow({ where: { userId: S.userId } })).id;

    // Guruhda bo'lmagan o'quvchiga davomat qo'yib bo'lmaydi
    const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    expect((await req("PUT", `/admin/groups/${group.id}/attendance`, { date: today, items: [{ studentId, status: "PRESENT" }] })).statusCode).toBe(400);

    const found = (await req("GET", "/admin/students?search=aziz_e2e")).json();
    expect(found[0].studentId).toBe(studentId);
    await req("POST", `/admin/groups/${group.id}/students`, { studentIds: [studentId] });

    const day = (await req("GET", `/admin/groups/${group.id}/attendance?date=${today}`)).json();
    expect(day.rows).toHaveLength(1);
    expect(day.rows[0].status).toBeNull();

    // Kelajak sanasi
    expect((await req("PUT", `/admin/groups/${group.id}/attendance`, { date: "2099-01-01", items: [{ studentId, status: "PRESENT" }] })).statusCode).toBe(400);

    const first = (await req("PUT", `/admin/groups/${group.id}/attendance`, { date: today, items: [{ studentId, status: "PRESENT" }] })).json();
    expect(first).toEqual({ saved: 1, notified: 1 }); // faqat tasdiqlangan ona (rad etilgan "ota"ga emas)
    let j = await jobs();
    expect(j).toHaveLength(1);
    expect(j[0]).toMatchObject({ chatId: String(TG.mom) });
    expect(j[0].text).toContain("darsga keldi");

    const again = (await req("PUT", `/admin/groups/${group.id}/attendance`, { date: today, items: [{ studentId, status: "PRESENT" }] })).json();
    expect(again.notified).toBe(0);

    // Worker xabarni yuborgan deb belgilaymiz, keyin holatni o'zgartiramiz
    await prisma.attendance.updateMany({ where: { studentId }, data: { notifiedAt: new Date() } });
    await queue.obliterate({ force: true });
    const changed = (await req("PUT", `/admin/groups/${group.id}/attendance`, { date: today, items: [{ studentId, status: "ABSENT", note: "Kasal" }] })).json();
    expect(changed.notified).toBe(1);
    j = await jobs();
    expect(j[0].text).toContain("Tuzatish");
    expect(j[0].text).toContain("kelmadi");
    expect(j[0].text).toContain("Kasal");

    const month = (await req("GET", `/admin/groups/${group.id}/attendance/month?month=${today.slice(0, 7)}`)).json();
    expect(month.days).toEqual([today]);
    expect(month.rows[0].marks[today]).toBe("ABSENT");

    // Davomat tarixi bor guruhni o'chirib bo'lmaydi
    expect((await req("DELETE", `/admin/groups/${group.id}`)).statusCode).toBe(409);
  });

  it("ota-ona ko'rinishi: tasdiqlangan ona farzandining davomatini ko'radi", async () => {
    const mom = await login(app, TG.mom, "Malika", undefined, { withParent: false });
    expect(mom.role).toBe("PARENT");
    const children = (await req("GET", "/me/children", undefined, mom.headers)).json();
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({ name: "Aziz", status: "APPROVED", groupName: GROUP });
    expect(children[0].recent[0].status).toBe("ABSENT");
  });

  it("xabar matni: HTML ekranlanadi", () => {
    const t = attendanceMessage("<b>Ali</b>", "1-guruh", "2026-11-03", "LATE");
    expect(t).toContain("&lt;b&gt;Ali&lt;/b&gt;");
    expect(t).toContain("03.11.2026");
    expect(t).toContain("kechikib");
  });
});
