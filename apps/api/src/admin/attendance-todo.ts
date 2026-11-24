import { parseSchedule } from "@onatili/shared";
import type { PrismaClient } from "@onatili/db";
import type { AdminDashboard } from "./dashboard.controller";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

type AttendanceTodo = Pick<AdminDashboard, "attendanceToday" | "attendanceMissed">;

/**
 * Davomat eslatmalari: bugun dars bo'lgan (jadval bo'yicha, dars vaqti boshlangan) guruhlar va oxirgi 7 kunda
 * davomati olinmay qolgan dars kunlari. Faqat guruhning hozirgi o'quvchilari sanaladi: guruhdan chiqqan
 * o'quvchining belgisi hisobga kirmaydi.
 */
export async function attendanceTodo(prisma: PrismaClient, now = new Date()): Promise<AttendanceTodo> {
  // Toshkent vaqti: bugungi hafta kuni va daqiqasi
  const local = new Date(now.getTime() + 5 * 3600_000);
  const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes();
  const today = new Date(`${iso(local)}T00:00:00.000Z`);
  const weekAgo = new Date(today.getTime() - 7 * DAY);

  const groups = await prisma.group.findMany({
    where: { isActive: true, students: { some: {} } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      schedule: true,
      createdAt: true,
      students: { select: { createdAt: true, startedOn: true, attendance: { where: { date: { gte: weekAgo, lte: today } }, select: { date: true } } } },
    },
  });

  const todayGroups: AttendanceTodo["attendanceToday"]["groups"] = [];
  const missed: AttendanceTodo["attendanceMissed"] = [];
  for (const g of groups) {
    const s = parseSchedule(g.schedule);
    const students = g.students.map((x) => ({ since: iso(x.startedOn ?? x.createdAt), days: new Set(x.attendance.map((a) => iso(a.date))) }));
    const markedOn = (list: typeof students, day: string) => list.filter((x) => x.days.has(day)).length;

    // Dars hali boshlanmagan bo'lsa eslatmaymiz
    const lessonToday = !s.days || s.days.includes(today.getUTCDay());
    if (lessonToday && (s.minutes === null || nowMin >= s.minutes))
      todayGroups.push({ id: g.id, name: g.name, schedule: g.schedule, marked: markedOn(students, iso(today)), total: students.length });

    // O'tgan kunlar: faqat kunlari aniq jadvallar uchun
    if (!s.days) continue;
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today.getTime() - i * DAY);
      const day = iso(d);
      if (!s.days.includes(d.getUTCDay()) || day < iso(g.createdAt)) continue;
      // Keyin qo'shilgan o'quvchi o'sha kuni belgilanmagani xato emas
      const then = students.filter((x) => x.since <= day || x.days.has(day));
      // Yarmidan kami belgilangan bo'lsa (masalan, bitta o'quvchi), davomat olinmagan hisoblanadi
      if (then.length && markedOn(then, day) * 2 < then.length) missed.push({ groupId: g.id, name: g.name, date: day });
    }
  }
  missed.sort((a, b) => b.date.localeCompare(a.date));
  return { attendanceToday: { date: iso(today), groups: todayGroups }, attendanceMissed: missed };
}
