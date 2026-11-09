import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { currentMonth, parseStudentLine } from "@onatili/shared";
import { internalKey } from "@onatili/shared/server";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redisConnection } from "../src/media/queue";
import { NOTIFY_QUEUE, type NotifyJob } from "../src/notify/notify.service";
import { BOT_TOKEN, OWNER, createApp, login } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900001001, assistant: 900001002, phoneUser: 900001003, linkUser: 900001004, existing: 900001005, managed: 900001006, newbie: 900001007, stranger: 900001008 };
const TAG = "E2E-roster";
const PHONES = ["+998901110001", "+998901110002", "+998901110003", "+998901110004"];

async function cleanup() {
  await prisma.user.deleteMany({ where: { OR: [{ telegramId: { in: Object.values(TG).map(BigInt) } }, { phone: { in: PHONES } }, { firstName: { startsWith: TAG } }] } });
  await prisma.group.deleteMany({ where: { name: { startsWith: TAG } } });
}

describe("O'quvchilar: botsiz kiritish, ro'yxat, karta, hisobni bog'lash (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let A: Record<string, string>;
  let groupId = "";
  const req = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object, headers = H) =>
    app.inject({ method, url: `/api${url}`, headers, payload });
  const internal = (path: string, payload: object) =>
    app.inject({ method: "POST", url: `/api/internal/${path}`, headers: { "x-internal-key": internalKey(BOT_TOKEN) }, payload });

  beforeAll(async () => {
    await cleanup();
    app = await createApp();
    H = (await login(app, TG.owner, "Ega", OWNER)).headers;
    await login(app, TG.assistant, "Yordamchi");
    await prisma.user.update({ where: { telegramId: BigInt(TG.assistant) }, data: { role: "ASSISTANT" } });
    A = (await login(app, TG.assistant, "Yordamchi")).headers;
    groupId = (await req("POST", "/admin/groups", { name: `${TAG} 1-guruh` })).json().id;
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app?.close();
  });

  it("qatorni o'qish: ism, familiya, turli ko'rinishdagi telefon", () => {
    expect(parseStudentLine("1. Aziz Karimov, 90 111 00 01")).toEqual({ firstName: "Aziz", lastName: "Karimov", phone: "90 111 00 01" });
    expect(parseStudentLine("Madina +998901110002")).toEqual({ firstName: "Madina", lastName: null, phone: "+998901110002" });
    expect(parseStudentLine("   ")).toBeNull();
  });

  it("ustoz botsiz kiritadi: bittalab va ro'yxat bilan; takror telefon rad etiladi", async () => {
    const one = await req("POST", "/admin/students", { firstName: `${TAG}Aziz`, lastName: "Karimov", phone: "90 111 00 01", groupId });
    expect(one.statusCode).toBe(201);
    const dup = await req("POST", "/admin/students", { firstName: `${TAG}Boshqa`, phone: "+998 90 111-00-01" });
    expect(dup.statusCode).toBe(409);

    const bulk = (
      await req("POST", "/admin/students/bulk", {
        groupId,
        text: `${TAG}Madina Aliyeva, 901110002\n2) ${TAG}Jasur 90 111 00 03\n\n${TAG}Telefonsiz\n${TAG}Takror 90 111 00 01`,
      })
    ).json();
    expect(bulk.added).toBe(3);
    expect(bulk.skipped).toHaveLength(1);
    expect(bulk.skipped[0].reason).toMatch(/telefon/);

    const list = (await req("GET", `/admin/roster?groupId=${groupId}`)).json();
    expect(list).toHaveLength(4);
    const aziz = list.find((r: { name: string }) => r.name === `${TAG}Aziz Karimov`);
    expect(aziz).toMatchObject({ phone: "+998901110001", telegramLinked: false, group: { name: `${TAG} 1-guruh` }, paidThisMonth: false });
    // Yordamchiga to'lov ma'lumoti ko'rinmaydi
    expect((await req("GET", `/admin/roster?groupId=${groupId}`, undefined, A)).json()[0].paidThisMonth).toBeNull();
    // Qidiruv
    expect((await req("GET", `/admin/roster?q=${encodeURIComponent("Madina")}`)).json().some((r: { name: string }) => r.name.includes("Madina"))).toBe(true);
  });

  it("davomat va to'lov botsiz o'quvchiga ham yoziladi; karta hammasini ko'rsatadi", async () => {
    const aziz = (await req("GET", `/admin/roster?q=${TAG}Aziz`)).json()[0];
    await req("PUT", `/admin/groups/${groupId}/attendance`, { date: new Date().toISOString().slice(0, 10), items: [{ studentId: aziz.studentId, status: "PRESENT" }] });
    await req("PUT", "/admin/offline-payments", { studentId: aziz.studentId, month: currentMonth(), amountUzs: 300000 });

    const d = (await req("GET", `/admin/students/${aziz.studentId}`)).json();
    expect(d.inviteUrl).toMatch(/\?start=s_[A-Za-z0-9_-]{8}$/);
    expect(d.parentInviteUrl).toMatch(/\?start=p_/);
    expect(d.attendance.counts.PRESENT).toBe(1);
    expect(d.billing.offlineMonths[0]).toMatchObject({ month: currentMonth(), paid: true, amountUzs: 300000 });
    expect(d.stats).toMatchObject({ testsTaken: 0, lessonsCompleted: 0 });
    expect((await req("GET", `/admin/students/${aziz.studentId}`, undefined, A)).json().billing).toBeNull();
    // To'lov tarixi bor o'quvchi: faqat ega, tasdiq (force) bilan; yordamchi o'chira olmaydi
    const del = await req("DELETE", `/admin/students/${aziz.studentId}`);
    expect(del.statusCode).toBe(409);
    expect(del.json().message).toMatch(/tasdiqlang/);
    expect((await req("DELETE", `/admin/students/${aziz.studentId}?force=1`, undefined, A)).statusCode).toBe(409);
  });

  it("o'quvchi botda telefonini ulashsa, qo'lda kiritilgan yozuv uning hisobiga o'tadi", async () => {
    const before = (await req("GET", `/admin/roster?q=${TAG}Aziz`)).json()[0];
    const r = await internal("user-phone", { from: { id: TG.phoneUser, first_name: "aziz_tg" }, contact: { phone_number: "998901110001", user_id: TG.phoneUser } });
    expect(r.json().status).toBe("merged");
    const after = (await req("GET", `/admin/roster?groupId=${groupId}`)).json().filter((x: { phone: string }) => x.phone === "+998901110001");
    expect(after).toHaveLength(1); // ikki nusxa emas
    expect(after[0]).toMatchObject({ name: `${TAG}Aziz Karimov`, telegramLinked: true, group: { id: groupId }, paidThisMonth: true });
    expect(after[0].studentId).not.toBe(before.studentId);
    const d = (await req("GET", `/admin/students/${after[0].studentId}`)).json();
    expect(d.attendance.counts.PRESENT).toBe(1);
    expect(d.inviteUrl).toBeNull();

    // Ustoz yozgan ism Telegram'dan kirganda o'zgarmaydi
    await login(app, TG.phoneUser, "aziz_tg");
    expect((await req("GET", `/admin/students/${after[0].studentId}`)).json().name).toBe(`${TAG}Aziz Karimov`);
  });

  it("shaxsiy havola: yangi Telegram hisobi bog'lanadi; ishlatilgan havola boshqaga ishlamaydi", async () => {
    const madina = (await req("GET", `/admin/roster?q=${TAG}Madina`)).json()[0];
    const code = (await req("GET", `/admin/students/${madina.studentId}`)).json().inviteUrl.split("s_")[1];
    expect((await internal("claim-student", { code, from: { id: TG.linkUser, first_name: "M" } })).json()).toMatchObject({ status: "claimed", groupName: `${TAG} 1-guruh` });
    expect((await internal("claim-student", { code, from: { id: TG.existing, first_name: "X" } })).json().status).toBe("invalid"); // kod o'chirildi
    const linked = (await req("GET", `/admin/students/${madina.studentId}`)).json();
    expect(linked).toMatchObject({ telegramLinked: true, studentId: madina.studentId });

    // Avval botga kirgan hisob havolani bossa: ikkalasi birlashadi
    await login(app, TG.existing, "Oldin");
    const jasur = (await req("GET", `/admin/roster?q=${TAG}Jasur`)).json()[0];
    const c2 = (await req("GET", `/admin/students/${jasur.studentId}`)).json().inviteUrl.split("s_")[1];
    expect((await internal("claim-student", { code: c2, from: { id: TG.existing, first_name: "Oldin" } })).json().status).toBe("claimed");
    const u = await prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(TG.existing) }, include: { student: true } });
    expect(u).toMatchObject({ firstName: `${TAG}Jasur`, student: { groupId } });
    expect(await prisma.studentProfile.count({ where: { id: jasur.studentId } })).toBe(0);
  });

  it("tahrirlash va o'chirish: botdan foydalanayotgan o'quvchini o'chirib bo'lmaydi", async () => {
    const t = (await req("GET", `/admin/roster?q=${TAG}Telefonsiz`)).json()[0];
    const upd = (await req("PATCH", `/admin/students/${t.studentId}`, { firstName: `${TAG}Yangi`, phone: "901110004", groupId: null })).json();
    expect(upd).toMatchObject({ name: `${TAG}Yangi`, phone: "+998901110004", group: null });
    expect((await req("GET", "/admin/roster?groupId=none")).json().some((r: { studentId: string }) => r.studentId === t.studentId)).toBe(true);
    expect((await req("DELETE", `/admin/students/${t.studentId}`)).statusCode).toBe(200);

    const linked = (await req("GET", `/admin/roster?q=${TAG}Madina`)).json()[0];
    expect((await req("DELETE", `/admin/students/${linked.studentId}`)).statusCode).toBe(409);
  });

  it("boshqaruv: kirish rejimi, bloklash (token darhol ishlamaydi), ota-onani bekor qilish/qayta tasdiqlash, o'chirish", async () => {
    const M = (await login(app, TG.managed, "Boshqariladigan")).headers;
    const sp = await prisma.studentProfile.findFirstOrThrow({ where: { user: { telegramId: BigInt(TG.managed) } } });
    const course = await prisma.course.create({ data: { title: `${TAG} kurs`, isPublished: true, topics: { create: { title: "M", lessons: { create: { title: "Pullik", isPublished: true, isFree: false } } } } }, include: { topics: { include: { lessons: true } } } });
    const lessonId = course.topics[0].lessons[0].id;
    try {
      // Kirish rejimi: faqat ega; FREE -> ochiq, CLOSED -> yopiq, AUTO -> obunasiz yopiq
      expect((await req("PATCH", `/admin/students/${sp.id}/access`, { mode: "FREE" }, A)).statusCode).toBe(403);
      expect((await req("GET", `/lessons/${lessonId}`, undefined, M)).statusCode).toBe(403);
      expect((await req("PATCH", `/admin/students/${sp.id}/access`, { mode: "FREE" })).json()).toMatchObject({ accessMode: "FREE", hasAccess: true });
      expect((await req("GET", `/lessons/${lessonId}`, undefined, M)).statusCode).toBe(200);
      expect((await req("GET", "/me", undefined, M)).json().accessMode).toBe("FREE");
      await req("PATCH", `/admin/students/${sp.id}/access`, { mode: "CLOSED" });
      expect((await req("GET", `/lessons/${lessonId}`, undefined, M)).statusCode).toBe(403);
      await req("PATCH", `/admin/students/${sp.id}/access`, { mode: "AUTO" });

      // Bloklash: mavjud token ham darhol ishlamaydi, sababi ko'rinadi; blokdan chiqarilsa qayta ishlaydi
      const b = (await req("POST", `/admin/students/${sp.id}/block`, { blocked: true, reason: "To'lov qilinmagan" })).json();
      expect(b).toMatchObject({ blocked: true, blockedReason: "To'lov qilinmagan" });
      const denied = await req("GET", "/me", undefined, M);
      expect(denied.statusCode).toBe(401);
      expect(denied.json()).toMatchObject({ code: "BLOCKED", message: "Hisob bloklangan: To'lov qilinmagan" });
      await req("POST", `/admin/students/${sp.id}/block`, { blocked: false });
      expect((await req("GET", "/me", undefined, M)).statusCode).toBe(200);

      // Ota-ona: tasdiqlash -> bekor qilish -> qayta tasdiqlash -> o'chirish
      const link = await prisma.parentLink.findFirstOrThrow({ where: { studentId: sp.id } });
      await prisma.parentLink.update({ where: { id: link.id }, data: { status: "PENDING" } });
      expect((await req("POST", `/admin/parent-links/${link.id}/approve`)).statusCode).toBe(200);
      expect((await req("POST", `/admin/parent-links/${link.id}/reject`, { reason: "Xato ulangan" })).statusCode).toBe(200);
      expect((await prisma.parentLink.findUniqueOrThrow({ where: { id: link.id } })).status).toBe("REJECTED");
      expect((await req("POST", `/admin/parent-links/${link.id}/approve`)).statusCode).toBe(200);
      expect(await prisma.parentLink.findUniqueOrThrow({ where: { id: link.id } })).toMatchObject({ status: "APPROVED", rejectReason: null });
      expect((await req("DELETE", `/admin/parent-links/${link.id}`, undefined, A)).statusCode).toBe(200);
      expect(await prisma.parentLink.count({ where: { id: link.id } })).toBe(0);

      // O'chirish: botdagi o'quvchini yordamchi o'chira olmaydi; ega tasdiq (force) bilan o'chiradi
      expect((await req("DELETE", `/admin/students/${sp.id}?force=1`, undefined, A)).statusCode).toBe(409);
      expect((await req("DELETE", `/admin/students/${sp.id}`)).statusCode).toBe(409);
      expect((await req("DELETE", `/admin/students/${sp.id}?force=1`)).statusCode).toBe(200);
      expect(await prisma.user.count({ where: { telegramId: BigInt(TG.managed) } })).toBe(0);
      expect((await req("GET", "/me", undefined, M)).statusCode).toBe(401); // o'chirilgan hisob tokeni ham ishlamaydi
    } finally {
      await prisma.course.delete({ where: { id: course.id } });
    }
  });
  it("to'lov tarixi bor o'quvchini ega tasdiq bilan o'chiradi; summa audit jurnalida qoladi", async () => {
    const st = (await req("POST", "/admin/students", { firstName: `${TAG}Pulli`, lastName: "O'quvchi", phone: "90 111 00 77", groupId })).json();
    await req("PUT", "/admin/offline-payments", { studentId: st.studentId, month: currentMonth(), amountUzs: 250000 });
    expect((await req("DELETE", `/admin/students/${st.studentId}?force=1`)).statusCode).toBe(200);
    expect(await prisma.studentProfile.count({ where: { id: st.studentId } })).toBe(0);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "student.delete", entityId: st.studentId } });
    expect(log.meta).toMatchObject({ payments: { offline: 1, offlineUzs: 250000 } });
  });
  it("botdan yangi kirganlar: ro'yxatda chiqadi; guruhga qo'shilsa yoki bloklansa ro'yxatdan chiqadi", async () => {
    const nb = await login(app, TG.newbie, "Yangi", undefined, { accepted: false });
    const st = await login(app, TG.stranger, "Begona", undefined, { accepted: false });
    const list = (await req("GET", "/admin/students/new")).json() as { userId: string; studentId: string }[];
    const mine = list.find((x) => x.userId === nb.userId)!;
    const other = list.find((x) => x.userId === st.userId)!;
    expect(mine).toBeTruthy();
    expect(other).toBeTruthy();
    expect((await req("GET", "/admin/dashboard")).json().newStudents).toBeGreaterThanOrEqual(2);

    // Yordamchi ham guruhga qo'sha oladi
    expect((await req("POST", `/admin/students/${mine.studentId}/accept`, { groupId }, A)).statusCode).toBe(200);
    expect((await prisma.studentProfile.findUniqueOrThrow({ where: { id: mine.studentId } })).groupId).toBe(groupId);
    expect((await req("POST", `/admin/students/${other.studentId}/block`, { blocked: true, reason: "Begona" })).statusCode).toBe(200);
    const after = (await req("GET", "/admin/students/new")).json() as { userId: string }[];
    expect(after.some((x) => x.userId === nb.userId || x.userId === st.userId)).toBe(false);
    // Qo'lda kiritilgan o'quvchi bu ro'yxatga tushmaydi
    expect(after.some((x) => x.userId.startsWith(TAG))).toBe(false);
    expect((await req("POST", `/admin/students/${mine.studentId}/accept`, { groupId: "yoq" })).statusCode).toBe(404);
  });

  describe("o'quvchi ismini yozadi, ustoz ro'yxatdagi yozuvga bog'laydi", () => {
    const TG2 = 900001020;
    const FIRST = "Testshahzoda"; // haqiqiy ism kabi: TAG'dagi raqam /me/name'dan o'tmaydi
    let S: Record<string, string>;
    let placeholderId = "";
    const myStudentId = async () => (await prisma.studentProfile.findFirstOrThrow({ where: { user: { telegramId: BigInt(TG2) } } })).id;

    beforeAll(async () => {
      await prisma.user.deleteMany({ where: { telegramId: BigInt(TG2) } });
      placeholderId = (await req("POST", "/admin/students", { firstName: FIRST, lastName: "Yusupova", groupId })).json().studentId;
      S = (await login(app, TG2, "💫 sh_z 💫", undefined, { withParent: false, accepted: false, paid: false })).headers;
    });
    afterAll(() => prisma.user.deleteMany({ where: { OR: [{ telegramId: BigInt(TG2) }, { firstName: FIRST }] } }));

    it("Telegram ismi bilan kirgan o'quvchidan ism so'raladi; noto'g'ri ism o'tmaydi", async () => {
      expect((await req("GET", "/me", undefined, S)).json().needsName).toBe(true);
      expect((await req("POST", "/me/name", { firstName: "1", lastName: "😀😀" }, S)).statusCode).toBe(400);
    });

    it("yozilgan ism saqlanadi, Telegram ismi uni almashtirmaydi, ikkinchi marta yozib bo'lmaydi", async () => {
      const me = (await req("POST", "/me/name", { firstName: `  ${FIRST}`, lastName: "Yusupova " }, S)).json();
      expect(me).toMatchObject({ firstName: FIRST, lastName: "Yusupova", needsName: false });
      await login(app, TG2, "💫 sh_z 💫", undefined, { withParent: false, accepted: false, paid: false });
      expect((await prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(TG2) } })).firstName).toBe(FIRST);
      expect((await req("POST", "/me/name", { firstName: "Boshqa", lastName: "Odam" }, S)).statusCode).toBe(409);
    });

    it("yangi kirganlar ro'yxatida mos yozuv taklif qilinadi", async () => {
      const id = await myStudentId();
      const row = (await req("GET", "/admin/students/new")).json().find((r: { studentId: string }) => r.studentId === id);
      expect(row.nameConfirmed).toBe(true);
      expect(row.matches[0]).toMatchObject({ studentId: placeholderId, groupName: `${TAG} 1-guruh` });
    });

    it("tasdiqlangan hisob va keyin qo'lda kiritilgan yozuv takroriy deb ko'rsatiladi", async () => {
      const id = await myStudentId();
      await req("POST", `/admin/students/${id}/accept`, { groupId: null });
      const rows = (await req("GET", "/admin/students/duplicates")).json();
      expect(rows.find((r: { student: { id: string } }) => r.student.id === id)?.placeholder.id).toBe(placeholderId);
      expect((await req("GET", "/admin/students/duplicates", undefined, A)).statusCode).toBe(403);
    });

    it("faqat ega bog'laydi; bog'langach guruh o'tadi va takror yozuv yo'qoladi", async () => {
      const id = await myStudentId();
      expect((await req("POST", `/admin/students/${id}/link`, { placeholderStudentId: placeholderId }, A)).statusCode).toBe(403);
      expect((await req("POST", `/admin/students/${placeholderId}/link`, { placeholderStudentId: id })).statusCode).toBe(400);
      expect((await req("POST", `/admin/students/${id}/link`, { placeholderStudentId: placeholderId })).statusCode).toBe(200);
      const sp = await prisma.studentProfile.findUniqueOrThrow({ where: { id }, include: { user: true } });
      expect(sp.groupId).toBe(groupId);
      expect(sp.acceptedAt).not.toBeNull();
      expect(sp.user.firstName).toBe(FIRST);
      expect(await prisma.studentProfile.findUnique({ where: { id: placeholderId } })).toBeNull();
      expect((await req("POST", `/admin/students/${id}/link`, { placeholderStudentId: placeholderId })).statusCode).toBe(404);
    });
  });

  describe("ustoz xabardagi tugmalar bilan hal qiladi", () => {
    const TG3 = { student: 900001030, stranger: 900001031, parent: 900001032, foreign: 900001033 };
    const ids = Object.values(TG3).map(BigInt);
    const notifyQ = new Queue<NotifyJob>(NOTIFY_QUEUE, { prefix: "onatili-e2e", connection: redisConnection(process.env.REDIS_URL!) });
    const jobs = async () => (await notifyQ.getJobs(["waiting", "delayed", "prioritized"])).map((j) => j.data);
    const tap = async (data: string, telegramId = TG.owner) => (await internal("review", { telegramId, data })).json();
    const studentId = async (tg: number) => (await prisma.studentProfile.findFirstOrThrow({ where: { user: { telegramId: BigInt(tg) } } })).id;
    const opts = { withParent: false, accepted: false, paid: false };

    beforeAll(async () => {
      await prisma.user.deleteMany({ where: { telegramId: { in: ids } } });
      await notifyQ.obliterate({ force: true });
    });
    afterAll(async () => {
      await prisma.user.deleteMany({ where: { telegramId: { in: ids } } });
      await notifyQ.close();
    });

    it("botga kirganda xabar kelmaydi; ism yozilgach kim ekani va tugmalar keladi", async () => {
      const S = (await login(app, TG3.student, "xX_nick_Xx", "nick_o10", opts)).headers;
      expect((await jobs()).some((j) => j.text.includes("Yangi o'quvchi"))).toBe(false);
      await req("POST", "/me/name", { firstName: "Daler", lastName: "Dilmurodov" }, S);
      const job = (await jobs()).find((j) => j.text.includes("Daler Dilmurodov"));
      expect(job?.text).toContain("@nick_o10");
      const data = job!.keyboard!.flat().map((b) => b.data);
      expect(data).toContain(`st:g:${await studentId(TG3.student)}:${groupId}`);
      expect(data.every((d) => Buffer.byteLength(d) <= 64)).toBe(true);
    });

    it("botning o'zida ism yoziladi: bezakli harflar oddiyga aylanadi, ikkinchi marta o'zgarmaydi", async () => {
      const from = { id: TG3.stranger, first_name: "✈️🛫" };
      expect((await internal("visit", from)).json()).toMatchObject({ needsName: true });
      expect((await internal("student-name", { from, firstName: ".", lastName: "て" })).json().status).toBe("invalid");
      expect((await internal("student-name", { from, firstName: "𝐘𝐚𝐬𝐦𝐢𝐧𝐚", lastName: "𝐗𝐨𝐥𝐢𝐪𝐨𝐯𝐚" })).json()).toMatchObject({ status: "saved", name: "Yasmina Xoliqova" });
      expect((await jobs()).some((j) => j.text.includes("Yangi o'quvchi: Yasmina Xoliqova"))).toBe(true);
      expect((await internal("visit", from)).json()).toMatchObject({ needsName: false });
      expect((await internal("student-name", { from, firstName: "Boshqa", lastName: "Odam" })).json().status).toBe("locked");
    });

    it("begona odam tugma bosa olmaydi", async () => {
      await login(app, TG3.foreign, "Begona", undefined, opts);
      const id = await studentId(TG3.student);
      expect(await tap(`st:g:${id}:${groupId}`, TG3.foreign)).toMatchObject({ alert: true });
      expect((await prisma.studentProfile.findUniqueOrThrow({ where: { id } })).acceptedAt).toBeNull();
      expect((await tap(`st:g:${id}:${groupId}`, TG.assistant)).alert).toBe(true);
    });

    it("guruhga qo'shadi; ikkinchi ustoz bossa, takrorlanmaydi", async () => {
      const id = await studentId(TG3.student);
      expect((await tap(`st:g:${id}:${groupId}`)).result).toContain("guruhiga qo'shildi");
      expect((await prisma.studentProfile.findUniqueOrThrow({ where: { id } })).groupId).toBe(groupId);
      expect(await tap(`st:o:${id}`)).toMatchObject({ toast: "Allaqachon ko'rib chiqilgan", result: "☑️ Allaqachon ko'rib chiqilgan" });
    });

    it("bloklash avval tasdiq so'raydi, Orqaga tugmalarni qaytaradi", async () => {
      await login(app, TG3.stranger, "Kimdir", undefined, opts);
      const id = await studentId(TG3.stranger);
      const ask = await tap(`c|st:b:${id}`);
      expect(ask.keyboard[0][0].data).toBe(`st:b:${id}`);
      expect((await prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(TG3.stranger) } })).isBlocked).toBe(false);
      expect((await tap(`st:v:${id}`)).keyboard.flat().some((b: { data: string }) => b.data === `c|st:b:${id}`)).toBe(true);
      expect((await tap(`st:b:${id}`)).result).toBe("🚫 Bloklandi");
      expect((await prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(TG3.stranger) } })).isBlocked).toBe(true);
    });

    it("ota-ona xabarida raqam, guruh bor; tugma bilan tasdiqlanadi", async () => {
      const sp = await prisma.studentProfile.findFirstOrThrow({ where: { user: { telegramId: BigInt(TG3.student) } } });
      const from = { id: TG3.parent, first_name: "Kamola", last_name: "Sodiqova" };
      await internal("parent-link", { code: sp.parentLinkCode, from, contact: { phone_number: "998901110099", user_id: TG3.parent }, relation: "ona" });
      const job = (await jobs()).find((j) => j.text.includes("Ota-ona so'rovi") && j.text.includes("Kamola"));
      expect(job?.text).toContain("+998901110099");
      expect(job?.text).toContain(`${TAG} 1-guruh`);
      expect(job?.text).not.toContain("⚠️");
      const approve = job!.keyboard![0]![0]!.data;
      expect((await tap(approve)).result).toBe("✅ Tasdiqlandi");
      expect((await prisma.parentLink.findFirstOrThrow({ where: { studentId: sp.id } })).status).toBe("APPROVED");
      expect(await tap(approve)).toMatchObject({ toast: "Allaqachon ko'rib chiqilgan" });
    });

    it("guruhdagi o'quvchi boshqa o'quvchining ota-onasi bo'la olmaydi", async () => {
      const sp = await prisma.studentProfile.findFirstOrThrow({ where: { user: { telegramId: BigInt(TG3.student) } } });
      const other = await prisma.studentProfile.findFirstOrThrow({ where: { user: { telegramId: BigInt(TG3.foreign) } } });
      const from = { id: TG3.student, first_name: "Daler" };
      const r = (await internal("parent-link", { code: other.parentLinkCode, from, contact: { phone_number: "998901110098", user_id: TG3.student } })).json();
      expect(r.status).toBe("is_student");
      expect((await prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(TG3.student) } })).role).toBe("STUDENT");
      expect(await prisma.studentProfile.findUniqueOrThrow({ where: { id: sp.id } })).toMatchObject({ groupId });
    });
  });
});
