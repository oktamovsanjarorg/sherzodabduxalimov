import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { defaultMonthlyFee, effectiveFee } from "./fee";
import { currentMonth, formatSum, monthLabel, MONTH_RE, type MyOfflineBilling, type OfflineLedger } from "@onatili/shared";
import { NotifyService } from "../notify/notify.service";
import { esc } from "../notify/telegram";
import { PrismaService } from "../prisma/prisma.service";

const fullName = (u: { firstName: string; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ");
/** Bir guruh-oy uchun eslatmalar orasidagi eng kam vaqt: ota-onalarni bezovta qilmaslik uchun */
const REMIND_COOLDOWN_MS = 20 * 3600_000;

const studentSelect = {
  id: true,
  user: { select: { firstName: true, lastName: true, username: true, phone: true, telegramId: true } },
  parents: { where: { status: "APPROVED" as const }, select: { parent: { select: { telegramId: true } } } },
};

/** Offline guruh o'quvchilarining oylik to'lovlari (darsda naqd yoki kartaga olinadi, ustoz belgilaydi) */
@Injectable()
export class OfflineBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  private checkMonth(month: string) {
    if (!MONTH_RE.test(month)) throw new BadRequestException("Oy YYYY-MM ko'rinishida bo'lishi kerak");
  }

  async ledger(groupId: string, month: string): Promise<OfflineLedger> {
    this.checkMonth(month);
    const g = await this.prisma.group.findUnique({ where: { id: groupId }, select: { id: true, name: true, monthlyFeeUzs: true } });
    if (!g) throw new NotFoundException("Guruh topilmadi");
    const defaultFee = await defaultMonthlyFee(this.prisma);
    // monthlyFeeUzs: amaldagi narx (guruhniki yoki umumiy); ownFeeUzs: faqat shu guruhga yozilgan narx
    const group = { id: g.id, name: g.name, monthlyFeeUzs: effectiveFee(g.monthlyFeeUzs, defaultFee), ownFeeUzs: g.monthlyFeeUzs, defaultFeeUzs: defaultFee };
    // Hozirgi a'zolar + shu oyda shu guruhda to'lagan, keyin chiqib ketganlar
    const students = await this.prisma.studentProfile.findMany({
      where: { OR: [{ groupId }, { offlinePayments: { some: { groupId, month } } }] },
      select: { ...studentSelect, offlinePayments: { where: { month }, include: { markedBy: { select: { firstName: true, lastName: true } } } } },
    });
    const rows = students
      .map((s) => {
        const p = s.offlinePayments[0];
        return {
          studentId: s.id,
          name: fullName(s.user),
          username: s.user.username,
          phone: s.user.phone,
          approvedParents: s.parents.length,
          paid: p ? { amountUzs: p.amountUzs, note: p.note, paidAt: p.createdAt.toISOString(), markedBy: p.markedBy ? fullName(p.markedBy) : null } : null,
        };
      })
      .sort((a, b) => Number(!!a.paid) - Number(!!b.paid) || a.name.localeCompare(b.name));
    const paid = rows.filter((r) => r.paid);
    // Yig'ilgan summa: faqat shu guruhda olingan to'lovlar (boshqa guruhdan o'tgan o'quvchi to'lagan bo'lsa ham "to'lagan" ko'rinadi, lekin ikki marta qo'shilmaydi)
    const sumHere = students.reduce((sum, st) => sum + (st.offlinePayments[0]?.groupId === groupId ? st.offlinePayments[0].amountUzs : 0), 0);
    const last = await this.prisma.auditLog.findFirst({ where: { action: "offline.remind", entityId: `${groupId}:${month}` }, orderBy: { createdAt: "desc" } });
    return {
      group,
      month,
      rows,
      totals: { students: rows.length, paid: paid.length, debtors: rows.length - paid.length, sumUzs: sumHere },
      lastReminderAt: last?.createdAt.toISOString() ?? null,
    };
  }

  async setFee(actorId: string, groupId: string, monthlyFeeUzs: number | null) {
    const { count } = await this.prisma.group.updateMany({ where: { id: groupId }, data: { monthlyFeeUzs } });
    if (!count) throw new NotFoundException("Guruh topilmadi");
    await this.prisma.auditLog.create({ data: { actorId, action: "group.fee", entity: "Group", entityId: groupId, meta: { monthlyFeeUzs } } });
    return { ok: true };
  }

  async mark(actorId: string, d: { studentId: string; month: string; amountUzs?: number; note: string | null }) {
    const s = await this.prisma.studentProfile.findUnique({ where: { id: d.studentId }, select: { ...studentSelect, group: { select: { id: true, monthlyFeeUzs: true } } } });
    if (!s) throw new NotFoundException("O'quvchi topilmadi");
    const existing = await this.prisma.offlinePayment.findUnique({ where: { studentId_month: { studentId: d.studentId, month: d.month } } });
    if (!existing && !s.group) throw new ConflictException("O'quvchi hech qaysi guruhda emas");
    const amountUzs = d.amountUzs ?? existing?.amountUzs ?? effectiveFee(s.group?.monthlyFeeUzs, await defaultMonthlyFee(this.prisma));
    // Summa noma'lum (guruhga oylik summa kiritilmagan): 0 so'm deb saqlanmaydi, aks holda hisobotlar buziladi
    if (amountUzs === null) throw new BadRequestException("Oylik narx noma'lum: Tariflarda oylik tarif yo'q. To'lov summasini yozing");
    const p = await this.prisma.offlinePayment.upsert({
      where: { studentId_month: { studentId: d.studentId, month: d.month } },
      // Guruhdan chiqqan o'quvchining eski to'lovini tahrirlash ham mumkin: unda create ishlamaydi (existing bor)
      create: { studentId: d.studentId, groupId: s.group?.id ?? null, month: d.month, amountUzs, note: d.note, markedById: actorId },
      update: { amountUzs, note: d.note, markedById: actorId },
    });
    await this.prisma.auditLog.create({ data: { actorId, action: "offline.paid", entity: "OfflinePayment", entityId: p.id, meta: { month: d.month, amountUzs } } });
    // Faqat birinchi belgilashda: ota-onaga "to'lov qabul qilindi"
    if (!existing) {
      const text = `✅ <b>${esc(fullName(s.user))}</b>ning ${monthLabel(d.month)} oyi uchun to'lovi qabul qilindi${amountUzs ? ` (${formatSum(amountUzs)} so'm)` : ""}. Rahmat!`;
      await Promise.all(s.parents.map((l) => this.notify.send(l.parent.telegramId, text)));
    }
    return { ok: true };
  }

  async unmark(actorId: string, studentId: string, month: string) {
    this.checkMonth(month);
    const { count } = await this.prisma.offlinePayment.deleteMany({ where: { studentId, month } });
    if (!count) throw new NotFoundException("To'lov belgisi topilmadi");
    await this.prisma.auditLog.create({ data: { actorId, action: "offline.unpaid", entity: "StudentProfile", entityId: studentId, meta: { month } } });
    return { ok: true };
  }

  /** Qarzdorlarning ota-onalariga (va o'ziga) bot orqali eslatma */
  async remind(actorId: string, groupId: string, month: string) {
    const l = await this.ledger(groupId, month);
    if (l.lastReminderAt && Date.now() - new Date(l.lastReminderAt).getTime() < REMIND_COOLDOWN_MS)
      throw new ConflictException("Bu oy uchun eslatma yaqinda yuborilgan. Ertaga qayta yuborish mumkin.");
    const debtorIds = l.rows.filter((r) => !r.paid).map((r) => r.studentId);
    if (!debtorIds.length) throw new ConflictException("Qarzdor yo'q");
    const debtors = await this.prisma.studentProfile.findMany({ where: { id: { in: debtorIds }, groupId }, select: studentSelect });
    const fee = l.group.monthlyFeeUzs ? ` (${formatSum(l.group.monthlyFeeUzs)} so'm)` : "";
    let messages = 0;
    for (const s of debtors) {
      const name = esc(fullName(s.user));
      for (const p of s.parents) {
        await this.notify.send(
          p.parent.telegramId,
          `🔔 Assalomu alaykum! Farzandingiz <b>${name}</b>ning ${monthLabel(month)} oyi uchun to'lovi${fee} hali qabul qilinmagan. Iltimos, to'lovni amalga oshiring.`,
        );
        messages++;
      }
      await this.notify.send(s.user.telegramId, `🔔 ${monthLabel(month)} oyi uchun to'lov${fee} hali qabul qilinmagan. Iltimos, keyingi darsda to'lovni amalga oshiring.`);
      messages++;
      // Qarzdor bilan ishlash tarixiga: kimga yuborildi
      await this.prisma.paymentFollowUp.create({
        data: {
          studentId: s.id,
          month,
          kind: "BOT",
          note: s.parents.length ? `Ota-onaga (${s.parents.length}) va o'quvchiga eslatma yuborildi` : "O'quvchiga eslatma yuborildi (ota-ona ulanmagan)",
          createdById: actorId,
        },
      });
    }
    await this.prisma.auditLog.create({ data: { actorId, action: "offline.remind", entity: "Group", entityId: `${groupId}:${month}`, meta: { students: debtors.length, messages } } });
    return { students: debtors.length, messages };
  }

  /** O'quvchining o'zi uchun: oxirgi 3 oy */
  async mine(userId: string): Promise<MyOfflineBilling | null> {
    const s = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { id: true, group: { select: { name: true, isActive: true, monthlyFeeUzs: true } } },
    });
    if (!s?.group?.isActive) return null;
    const now = currentMonth();
    const months = [0, 1, 2].map((i) => {
      const d = new Date(`${now}-15T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - i);
      return d.toISOString().slice(0, 7);
    });
    const paid = await this.prisma.offlinePayment.findMany({ where: { studentId: s.id, month: { in: months } } });
    return {
      groupName: s.group.name,
      monthlyFeeUzs: effectiveFee(s.group.monthlyFeeUzs, await defaultMonthlyFee(this.prisma)),
      months: months.map((m) => {
        const p = paid.find((x) => x.month === m);
        return { month: m, paid: !!p, amountUzs: p?.amountUzs ?? null };
      }),
    };
  }
}
