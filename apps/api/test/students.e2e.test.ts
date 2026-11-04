import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { currentMonth, parseStudentLine } from "@onatili/shared";
import { internalKey } from "@onatili/shared/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BOT_TOKEN, OWNER, createApp, login } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900001001, assistant: 900001002, phoneUser: 900001003, linkUser: 900001004, existing: 900001005 };
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
});
