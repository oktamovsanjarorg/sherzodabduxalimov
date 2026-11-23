import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordDelivery, runAnnouncement } from "../src/announce/announce-runner";
import type { NotifyJob } from "../src/notify/notify.service";
import { OWNER, createApp, login, parentTgId } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900003001, assistant: 900003002, s1: 900003003, s2: 900003004 };
const TAG = "E2E-elon";

async function cleanup() {
  await prisma.announcement.deleteMany({ where: { text: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { telegramId: { in: [...Object.values(TG).map(BigInt), parentTgId(TG.s1), parentTgId(TG.s2)] } } });
  await prisma.user.deleteMany({ where: { firstName: `${TAG} qo'lda` } });
  await prisma.group.deleteMany({ where: { name: { startsWith: TAG } } });
}

describe("E'lonlar (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let A: Record<string, string>;
  let groupId: string;
  const req = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object, headers = H) =>
    app.inject({ method, url: `/api${url}`, headers, payload });
  const audience = () => ({ roles: ["STUDENT", "PARENT"], groupIds: [groupId] });

  beforeAll(async () => {
    await cleanup();
    app = await createApp();
    H = (await login(app, TG.owner, "Ega", OWNER)).headers;
    await login(app, TG.assistant, "Yordamchi");
    await prisma.user.update({ where: { telegramId: BigInt(TG.assistant) }, data: { role: "ASSISTANT" } });
    A = (await login(app, TG.assistant, "Yordamchi")).headers;
    groupId = (await req("POST", "/admin/groups", { name: `${TAG} guruh` })).json().id;
    const ids: string[] = [];
    for (const [tg, name] of [
      [TG.s1, "Ali"],
      [TG.s2, "Vali"],
    ] as const) {
      const s = await login(app, tg, name);
      ids.push((await prisma.studentProfile.findUniqueOrThrow({ where: { userId: s.userId } })).id);
    }
    // Botga hali kirmagan (ustoz qo'lda kiritgan) o'quvchi: unga xabar bormaydi
    const manual = await prisma.user.create({
      data: { firstName: `${TAG} qo'lda`, student: { create: { parentLinkCode: `${TAG}-pl`, acceptedAt: new Date() } } },
      include: { student: true },
    });
    ids.push(manual.student!.id);
    await req("POST", `/admin/groups/${groupId}/students`, { studentIds: ids });
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app?.close();
  });

  it("faqat ustoz ishlata oladi", async () => {
    expect((await req("GET", "/admin/announcements", undefined, A)).statusCode).toBe(403);
    expect((await req("POST", "/admin/announcements/preview", { audience: audience() }, A)).statusCode).toBe(403);
  });

  it("auditoriyani oldindan sanaydi: guruh o'quvchilari va ota-onalari, botga kirmaganlar alohida", async () => {
    const p = (await req("POST", "/admin/announcements/preview", { audience: audience() })).json();
    expect(p).toMatchObject({ reachable: 4, noTelegram: 1, byRole: { STUDENT: 2, PARENT: 2 } });
    const onlyParents = (await req("POST", "/admin/announcements/preview", { audience: { roles: ["PARENT"], groupIds: [groupId] } })).json();
    expect(onlyParents.reachable).toBe(2);
    expect((await req("POST", "/admin/announcements/preview", { audience: { roles: [] } })).statusCode).toBe(400);
  });

  it("noto'g'ri ma'lumotni rad etadi", async () => {
    expect((await req("POST", "/admin/announcements", { text: "", audience: audience() })).statusCode).toBe(400);
    expect(
      (await req("POST", "/admin/announcements", { text: `${TAG} x`, audience: audience(), buttonText: "Ochish", buttonUrl: "javascript:1" })).statusCode,
    ).toBe(400);
  });

  it("yuboradi, har kimga ismi bilan, ikki marta ishlasa ham bir marta; natijalarni sanaydi", async () => {
    const a = (
      await req("POST", "/admin/announcements", { text: `${TAG} **Salom**, {ism}!`, audience: audience(), buttonText: "Testlar", buttonUrl: "app:/tests" })
    ).json();
    expect(a).toMatchObject({ status: "DRAFT", audienceLabel: `O'quvchilar, Ota-onalar · ${TAG} guruh` });
    expect((await req("POST", `/admin/announcements/${a.id}/send`, {})).json().status).toBe("SCHEDULED");

    const jobs: NotifyJob[] = [];
    const fake = { addBulk: async (b: { data: NotifyJob }[]) => (jobs.push(...b.map((x) => x.data)), []) };
    expect(await runAnnouncement(prisma, fake as never, "https://app.test", a.id)).toBe(4);
    expect(await runAnnouncement(prisma, fake as never, "https://app.test", a.id)).toBe(0);
    expect(jobs).toHaveLength(4);
    const ali = jobs.find((j) => j.chatId === String(TG.s1))!;
    expect(ali.text).toBe(`${TAG} <b>Salom</b>, Ali!`);
    expect(ali.button).toEqual({ text: "Testlar", webAppUrl: "https://app.test/tests" });

    const [j1, j2, j3] = jobs;
    await recordDelivery(prisma, { data: j1 }, { ok: true, status: 200, messageId: 77 });
    await recordDelivery(prisma, { data: j2 }, { ok: false, status: 403, description: "Forbidden: bot was blocked by the user" });
    await recordDelivery(prisma, { data: j3 }, { ok: false, status: 400, description: "Bad Request: chat not found" });
    const d = (await req("GET", `/admin/announcements/${a.id}`)).json();
    expect(d.status).toBe("SENT");
    expect(d.stats).toMatchObject({ total: 4, sent: 1, blocked: 1, failed: 1, pending: 1 });
    expect(d.canRecall).toBe(true);
    expect(d.recipients.find((r: { status: string }) => r.status === "BLOCKED").error).toContain("blocked");

    // Yuborilganni o'zgartirib bo'lmaydi; qayta urinish faqat xatolarga; qaytarib olish faqat yetib borganlarga
    expect((await req("PATCH", `/admin/announcements/${a.id}`, { text: `${TAG} yangi`, audience: audience() })).statusCode).toBe(409);
    expect((await req("POST", `/admin/announcements/${a.id}/retry`)).json()).toEqual({ queued: 2 }); // xato + hali navbatdagi
    expect((await req("POST", `/admin/announcements/${a.id}/recall`)).json()).toEqual({ queued: 1 });
    await recordDelivery(prisma, { data: { ...j1, deleteMessageId: 77 } }, { ok: true, status: 200 });
    const after = (await req("GET", `/admin/announcements/${a.id}`)).json();
    expect(after.stats.deleted).toBe(1);
    expect(after.canRecall).toBe(false);

    const copy = (await req("POST", `/admin/announcements/${a.id}/duplicate`)).json();
    expect(copy).toMatchObject({ status: "DRAFT", text: a.text, buttonUrl: "app:/tests", stats: { total: 0 } });
  });

  it("rejalashtiradi, bekor qiladi (qoralamaga qaytadi) va o'chiradi", async () => {
    const a = (await req("POST", "/admin/announcements", { text: `${TAG} ertaga`, audience: audience(), silent: true })).json();
    const at = new Date(Date.now() + 86_400_000).toISOString();
    const s = (await req("POST", `/admin/announcements/${a.id}/send`, { scheduledAt: at })).json();
    expect(s).toMatchObject({ status: "SCHEDULED", scheduledAt: at, silent: true });
    expect((await req("PATCH", `/admin/announcements/${a.id}`, { text: `${TAG} ertaga 10:00`, audience: audience() })).json().text).toBe(`${TAG} ertaga 10:00`);
    expect((await req("POST", `/admin/announcements/${a.id}/cancel`)).json()).toMatchObject({ status: "DRAFT", scheduledAt: null });
    expect((await req("POST", `/admin/announcements/${a.id}/cancel`)).statusCode).toBe(409);
    expect((await req("DELETE", `/admin/announcements/${a.id}`)).statusCode).toBe(200);
    expect((await req("GET", `/admin/announcements/${a.id}`)).statusCode).toBe(404);
  });

  it("botga ulangan hech kim bo'lmasa yubormaydi", async () => {
    const g = (await req("POST", "/admin/groups", { name: `${TAG} bo'sh` })).json();
    const a = (await req("POST", "/admin/announcements", { text: `${TAG} bo'sh`, audience: { roles: ["STUDENT"], groupIds: [g.id] } })).json();
    expect((await req("POST", `/admin/announcements/${a.id}/send`, {})).statusCode).toBe(400);
  });
});
