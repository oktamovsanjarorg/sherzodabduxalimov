/**
 * Boshqaruv tavsiyalari: pul va tartib (qarzdorlar, tugayotgan obunalar, to'liq kiritilmagan ma'lumot).
 * Har biri aniq ismlar va to'g'ridan-to'g'ri sahifa bilan. Yordamchi (ASSISTANT) payments'ni ko'rmaydi.
 */
import { addDays, daysBetween, tashkentToday, type Advice } from "@onatili/shared";
import { coverage, dateCol, ymdOf } from "../billing/offline-period";
import type { PrismaService } from "../prisma/prisma.service";
import { fullName, names } from "./facts";

/** To'lov kuni o'tib, shuncha kundan keyin qarzdor deb ko'rsatiladi (darsda olishga ulgurilmagan bo'lishi mumkin) */
const GRACE_DAYS = 3;

export async function manageAdvice(prisma: PrismaService, add: (a: Advice) => void) {
  const today = tashkentToday();
  const groups = await prisma.group.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true,
      students: {
        where: { user: { isBlocked: false, role: "STUDENT" } },
        select: { id: true, startedOn: true, user: { select: { firstName: true, lastName: true } }, offlinePayments: { orderBy: { month: "desc" }, take: 24, select: { month: true, periodStart: true, periodEnd: true, paidOn: true, createdAt: true } } },
      },
    },
  });

  // ---- Offline guruhlar: qarzdorlar (guruh bo'yicha) va boshlash sanasi yo'qlar ----
  const noStart: { id: string; name: string }[] = [];
  for (const g of groups) {
    const debtors: { name: string; days: number }[] = [];
    for (const s of g.students) {
      const started = s.startedOn ? ymdOf(s.startedOn) : null;
      if (!started && !s.offlinePayments.length) {
        noStart.push({ id: s.id, name: fullName(s.user) });
        continue;
      }
      const cov = coverage(s.offlinePayments, today, started);
      // Hech to'lamagan: birinchi davr boshlanganidan beri; to'lagan: davri tugaganidan beri
      const days = cov.overdueDays ?? (cov.coveredUntil ? 0 : daysBetween(cov.nextPeriodStart, today));
      if (days >= GRACE_DAYS) debtors.push({ name: fullName(s.user), days });
    }
    if (!debtors.length) continue;
    debtors.sort((a, b) => b.days - a.days);
    add({
      key: `payments:debtors:${g.id}`, level: debtors[0].days >= 10 ? "urgent" : "important", area: "payments", count: debtors.length,
      title: `${g.name}: ${debtors.length} o'quvchi oylik to'lovni to'lamagan`,
      why: `${names(debtors.map((d) => `${d.name} (${d.days} kun)`), 5)}. Qavsda: to'lov kunidan beri o'tgan kun. To'lovlar sahifasidan ota-onalarga bir bosishda eslatma yuborish mumkin.`,
      action: { label: "Qarzdorlar ro'yxati", to: `/payments?tab=OFFLINE&group=${g.id}` },
    });
  }
  if (noStart.length)
    add({
      key: "payments:no-start", level: "important", area: "payments", count: noStart.length,
      title: `${noStart.length} offline o'quvchining o'qishni boshlagan sanasi kiritilmagan`,
      why: `${names(noStart.map((s) => s.name))}. Sana bo'lmasa to'lov davri va qarz hisoblanmaydi: o'quvchi sahifasi → Sozlamalar → «O'qishni boshlagan sana».`,
      action: { label: noStart.length === 1 ? "O'quvchini ochish" : "Birinchisini ochish", to: `/students/${noStart[0].id}?tab=settings` },
    });

  // ---- Online obunalar: 3 kun ichida tugaydiganlar ----
  const ending = await prisma.subscription.findMany({
    where: { status: "ACTIVE", endsAt: { gte: new Date(), lte: dateCol(addDays(today, 4)) }, user: { role: "STUDENT", isBlocked: false } },
    orderBy: { endsAt: "asc" },
    select: { endsAt: true, user: { select: { firstName: true, lastName: true } } },
  });
  if (ending.length)
    add({
      key: "payments:subs-ending", level: "idea", area: "payments", count: ending.length,
      title: `${ending.length} o'quvchining obunasi 3 kun ichida tugaydi`,
      why: `${names(ending.map((e) => `${fullName(e.user)} (${ymdOf(e.endsAt).slice(8)}.${ymdOf(e.endsAt).slice(5, 7)})`))}. Bot ularga o'zi eslatadi; uzaytirmasa darslar yopiladi.`,
      action: { label: "Obunalar", to: "/payments?tab=SUBS" },
    });
}
