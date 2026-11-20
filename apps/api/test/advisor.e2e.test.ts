import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OWNER, createApp, login, parentTgId } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900001201, assistant: 900001202, student: 900001203 };
const TAG = "E2E-advisor";
const CODE = "E2EADV_2026-10-01";

async function cleanup() {
  const tg = Object.values(TG).map(BigInt);
  await prisma.user.deleteMany({ where: { telegramId: { in: [...tg, ...Object.values(TG).map(parentTgId)] } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.externalTest.deleteMany({ where: { code: CODE } });
}

/** Ustoz yordamchisi: tavsiyalar faktlardan chiqadi va aniq sahifaga olib boradi */
describe("Ustoz yordamchisi (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let A: Record<string, string>;
  let studentId = "";
  let testId = "";
  const get = (url: string, headers = H) => app.inject({ method: "GET", url: `/api${url}`, headers });

  beforeAll(async () => {
    await cleanup();
    app = await createApp();
    H = (await login(app, TG.owner, "Ega", OWNER)).headers;
    await login(app, TG.assistant, "Yordamchi");
    await prisma.user.update({ where: { telegramId: BigInt(TG.assistant) }, data: { role: "ASSISTANT" } });
    A = (await login(app, TG.assistant, "Yordamchi")).headers;
    const st = await login(app, TG.student, `${TAG} Qoldiruvchi`, undefined, { withParent: false });
    studentId = (await prisma.studentProfile.findUniqueOrThrow({ where: { userId: st.userId } })).id;

    // 3 marta kelmagan (oxirgi 30 kun ichida)
    const group = await prisma.group.create({ data: { name: `${TAG} guruh` } });
    await prisma.studentProfile.update({ where: { id: studentId }, data: { groupId: group.id, mode: "OFFLINE" } });
    const day = (n: number) => new Date(`${new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)}T00:00:00Z`);
    for (const n of [2, 5, 9]) await prisma.attendance.create({ data: { groupId: group.id, studentId, date: day(n), status: "ABSENT" } });

    // Offline test: 1-bo'lim hammasi xato, 2-bo'lim hammasi to'g'ri; 3-savolni hech kim yecholmagan
    const sections = [
      { title: "Tilshunoslik", fromQ: 1, toQ: 3 },
      { title: "O'qish savodxonligi", fromQ: 4, toQ: 6 },
    ];
    const items = [1, 2, 3, 4, 5, 6].map((q) => ({ q, b: 0, w: 1, correctPct: q === 3 ? 0 : 50 }));
    testId = (
      await prisma.externalTest.create({
        data: {
          source: "CSV", code: CODE, title: `${TAG} mock`, questionCount: 6, takenAt: new Date(), sections, rasch: { calibrated: false, n: 1, items },
          results: { create: { key: "name:e2e", name: `${TAG} Qoldiruvchi`, studentId, correct: 3, wrong: 3, blank: 0, score: 3, maxScore: 6, percent: 50, scaledScore: 48, testScore: 48, answers: "wwwccc" } },
        },
      })
    ).id;
    await prisma.payment.create({ data: { userId: st.userId, method: "MANUAL", amountUzs: 100000, receiptUrl: "receipts/e2e.jpg" } });
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app?.close();
  });

  it("platforma: davomat, offline test bo'limi, yecholmagan savol, esse va chek — har biri havola bilan", async () => {
    const d = (await get("/admin/advisor")).json();
    const by = (k: string) => d.advice.find((a: { key: string }) => a.key === k);
    expect(by("attendance:chronic").why).toContain(`${TAG} Qoldiruvchi (3)`);
    expect(by("attendance:chronic")).toMatchObject({ level: "urgent", action: { to: "/attendance" } });
    expect(by(`learning:external:${testId}:hard`).why).toContain("Savollar: 3 ");
    expect(by(`learning:external:${testId}:essay`)).toMatchObject({ count: 1, action: { to: `/external/${testId}` } });
    expect(by("payments:receipts")).toBeTruthy();
    // Shoshilinchlari birinchi
    expect(d.advice[0].level).toBe("urgent");
  });

  it("boshqaruv: boshlash sanasi yo'q → sozlamalarga; sana kiritilsa → guruh qarzdorlari ismi va kuni bilan", async () => {
    const by = async (k: string) => (await get("/admin/advisor")).json().advice.find((a: { key: string }) => a.key === k);
    const noStart = await by("payments:no-start");
    expect(noStart.why).toContain(`${TAG} Qoldiruvchi`);
    expect(noStart.action.to).toBe(`/students/${studentId}?tab=settings`);

    const sp = await prisma.studentProfile.update({ where: { id: studentId }, data: { startedOn: new Date(Date.now() - 20 * 86_400_000) }, select: { groupId: true } });
    const debt = await by(`payments:debtors:${sp.groupId}`);
    expect(debt).toMatchObject({ level: "urgent", area: "payments", action: { to: `/payments?tab=OFFLINE&group=${sp.groupId}` } });
    expect(debt.why).toMatch(new RegExp(`${TAG} Qoldiruvchi \\(\\d+ kun\\)`));
    expect((await by("payments:no-start"))?.why ?? "").not.toContain(TAG);
  });

  it("yordamchi (ASSISTANT) to'lov tavsiyasini ko'rmaydi", async () => {
    const d = (await get("/admin/advisor", A)).json();
    expect(d.advice.some((a: { area: string }) => a.area === "payments")).toBe(false);
    expect(d.advice.some((a: { key: string }) => a.key === "attendance:chronic")).toBe(true);
  });

  it("o'quvchi: zaif/kuchli bo'lim, keyingi darajagacha ball, davomat, ota-ona", async () => {
    const d = (await get(`/admin/students/${studentId}/advisor`)).json();
    expect(d.weaknesses[0]).toMatchObject({ label: "Tilshunoslik", percent: 0 });
    expect(d.strengths[0]).toMatchObject({ label: "O'qish savodxonligi", percent: 100 });
    const keys = d.advice.map((a: { key: string }) => a.key);
    expect(keys).toEqual(expect.arrayContaining(["s:milliy-next", "s:absent", "s:no-parent", "s:no-essay"]));
    expect(d.advice.find((a: { key: string }) => a.key === "s:milliy-next").title).toBe("C+ darajagacha 2 ball yetmaydi");
    expect(d.advice[0].level).toBe("urgent");
    expect((await get("/admin/students/yoq/advisor")).statusCode).toBe(404);
  });
});
