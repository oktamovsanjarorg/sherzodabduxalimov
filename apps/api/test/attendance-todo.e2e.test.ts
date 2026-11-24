import { PrismaClient } from "@onatili/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attendanceTodo } from "../src/admin/attendance-todo";

const prisma = new PrismaClient();
const TAG = "E2E-att-todo";
// 2026-11-24, seshanba, Toshkent vaqti 15:00
const NOW = new Date("2026-11-24T10:00:00Z");
const date = (d: string) => new Date(`${d}T00:00:00Z`);
const OLD = date("2026-10-01");

async function cleanup() {
  await prisma.user.deleteMany({ where: { firstName: { startsWith: TAG } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: TAG } } });
}
const group = (name: string, schedule: string | null) => prisma.group.create({ data: { name: `${TAG} ${name}`, schedule, createdAt: OLD } });
async function student(groupId: string | null, startedOn = OLD) {
  const u = await prisma.user.create({
    data: {
      firstName: `${TAG} o'quvchi`,
      role: "STUDENT",
      student: { create: { parentLinkCode: `${TAG}-${Math.random()}`, groupId, startedOn, createdAt: startedOn } },
    },
    include: { student: true },
  });
  return u.student?.id ?? "";
}
const mark = (groupId: string, studentId: string, d: string) => prisma.attendance.create({ data: { groupId, studentId, date: date(d), status: "PRESENT" } });
const missedOf = async (id: string) => (await attendanceTodo(prisma, NOW)).attendanceMissed.filter((m) => m.groupId === id).map((m) => m.date);
const todayOf = async (id: string) => (await attendanceTodo(prisma, NOW)).attendanceToday.groups.find((g) => g.id === id);

describe("Davomat eslatmalari (e2e)", () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("juft kunlar: seshanba, payshanba, shanba", async () => {
    const g = await group("juft", "Juft kunlar 14:00");
    await student(g.id);
    expect(await missedOf(g.id)).toEqual(["2026-11-21", "2026-11-19", "2026-11-17"]);
    expect(await todayOf(g.id)).toMatchObject({ marked: 0, total: 1 });
  });

  it("dars vaqti boshlanmagan bo'lsa bugun eslatilmaydi", async () => {
    const g = await group("kech", "Har kuni 18:00");
    await student(g.id);
    expect(await todayOf(g.id)).toBeUndefined();
  });

  it("guruhdan chiqqan o'quvchining belgisi hisobga kirmaydi", async () => {
    const g = await group("chiqqan", "Har kuni 09:00");
    const left = await student(g.id);
    await student(g.id);
    await mark(g.id, left, "2026-11-24");
    await mark(g.id, left, "2026-11-23");
    await prisma.studentProfile.update({ where: { id: left }, data: { groupId: null } });
    expect(await todayOf(g.id)).toMatchObject({ marked: 0, total: 1 });
    expect(await missedOf(g.id)).toContain("2026-11-23");
  });

  it("o'tgan kun: uchtadan bittasi belgilangan — olinmagan; ikkitasi — olingan", async () => {
    const g = await group("qisman", "Har kuni 09:00");
    const [a, b] = [await student(g.id), await student(g.id), await student(g.id)];
    await mark(g.id, a, "2026-11-23");
    await mark(g.id, a, "2026-11-22");
    await mark(g.id, b, "2026-11-22");
    const missed = await missedOf(g.id);
    expect(missed).toContain("2026-11-23");
    expect(missed).not.toContain("2026-11-22");
  });

  it("keyin qo'shilgan o'quvchilar eski kunni «olinmagan» qilmaydi", async () => {
    const g = await group("yangi", "Har kuni 09:00");
    const a = await student(g.id);
    for (let i = 0; i < 3; i++) await student(g.id, date("2026-11-23"));
    await mark(g.id, a, "2026-11-20");
    const missed = await missedOf(g.id);
    expect(missed).not.toContain("2026-11-20");
    expect(missed).toContain("2026-11-23");
  });
});
