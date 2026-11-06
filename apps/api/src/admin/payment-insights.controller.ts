import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Post, Query, ServiceUnavailableException } from "@nestjs/common";
import { FOLLOW_UP_LABELS, formatSum, monthLabel, type DebtorRow, type FollowUpKindName, type PaymentInsights } from "@onatili/shared";
import { z } from "zod";
import { deepseekText } from "../ai/deepseek";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { parse } from "./zod";

const TZ = 5 * 3600_000;
const DAY = 86_400_000;
const name = (u: { firstName: string; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ");
const monthOf = (d: Date) => new Date(d.getTime() + TZ).toISOString().slice(0, 7);
const shiftMonth = (m: string, k: number) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + k, 1)).toISOString().slice(0, 7);
};
const monthStart = (m: string) => new Date(Date.parse(`${m}-01T00:00:00Z`) - TZ);
const monthDate = (m: string) => new Date(`${m}-01T00:00:00Z`);
const daysIn = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();

const followUpInput = z.object({
  studentId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  kind: z.enum(["CALL", "MESSAGE", "PROMISE", "REASON"]),
  note: z.string().trim().max(500).nullish(),
  promisedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
});

/**
 * To'lovlar tahlili (faqat ega): shu oy kim to'lashi kerak edi, qancha tushdi, prognoz, kim to'lamayapti va
 * ular bilan qanday ishlanganini (qo'ng'iroq, va'da, sabab, bot eslatmasi). AI xulosa: DeepSeek, ismlarsiz.
 */
@Roles("TEACHER")
@Controller("admin")
export class PaymentInsightsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("stats/payments") get(@Query("month") month?: string) {
    return this.build(this.month(month));
  }

  /** AI xulosa: raqamlar va qarzdorlar ro'yxati (ismlar o'rnida S1, S2...) asosida ustoz uchun qisqa hisobot */
  @Post("stats/payments/ai") @HttpCode(200) async ai(@Query("month") monthQ?: string) {
    if (!this.env.DEEPSEEK_API_KEY) throw new ServiceUnavailableException("AI sozlanmagan");
    const d = await this.build(this.month(monthQ));
    const alias = new Map<string, string>();
    const debtors = d.debtors.slice(0, 40).map((x, i) => {
      alias.set(`S${i + 1}`, x.name);
      return {
        id: `S${i + 1}`,
        turi: x.kind === "OFFLINE" ? `offline (${x.where ?? "guruh"})` : `online (${x.where ?? "obuna"})`,
        summa: x.amountUzs,
        kechikish: x.overdue.months ? `${x.overdue.months} oy` : x.overdue.days !== undefined ? `obuna tugaganiga ${x.overdue.days} kun` : null,
        shu_oy_darsga_keldi: x.attended,
        ilovada_faol_emas_kun: x.idleDays,
        ota_ona_bor: Boolean(x.parent),
        chek_kutilmoqda: x.pendingReceipt,
        ishlangan: x.followUps.map((f) => `${FOLLOW_UP_LABELS[f.kind]}${f.promisedAt ? ` (${f.promisedAt} gacha)` : ""}${f.note ? `: ${f.note}` : ""}`),
      };
    });
    const facts = {
      oy: monthLabel(d.month),
      bugun: `${d.day}/${d.daysInMonth}-kun`,
      offline: d.offline,
      online: d.online,
      jami: d.total,
      prognoz: d.forecast,
      oxirgi_oylar: d.history,
      qarzdorlar: debtors,
    };
    const system = `Siz o'quv markazi ustoziga moliyaviy yordamchisiz. Faqat berilgan raqamlarga tayaning, o'ylab topmang.
Javob o'zbek tilida (lotin), qisqa va aniq, oddiy so'zlar bilan. Tuzilishi:
1. **Umumiy holat** — 2–3 gap: kutilgan va tushgan summa, foiz, oyning nechanchi kuni ekanini hisobga olib baho bering.
2. **Prognoz** — oy oxirigacha taxminan qancha tushadi va nimaga asoslanib.
3. **Birinchi navbatda bog'lanish kerak** — 3–6 ta o'quvchi (id bilan, masalan S3), har biriga bir qator: nima uchun (necha oy qarz, darsga kelyaptimi, ota-ona bilan gaplashilganmi) va nima qilish (ota-onaga qo'ng'iroq, eslatma, va'da muddatini so'rash).
4. **Tavsiya** — 2–3 ta amaliy maslahat (masalan, to'lov kunini belgilash, ota-onalarga oy boshida eslatma).
Markdown: faqat **qalin** va ro'yxat. 1200 belgidan oshmasin.`;
    const text = await deepseekText({ apiKey: this.env.DEEPSEEK_API_KEY, model: this.env.DEEPSEEK_MODEL, system, user: JSON.stringify(facts) });
    // S1, S2 ... o'rniga ismlar (AI'ga ismlar yuborilmaydi)
    return { text: text.replace(/\bS(\d{1,2})\b/g, (m) => alias.get(m) ?? m), generatedAt: new Date().toISOString() };
  }

  @Post("payment-followups") async addFollowUp(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    const d = parse(followUpInput, b);
    if (d.kind === "PROMISE" && !d.promisedAt) throw new BadRequestException("Va'da qilingan sanani tanlang");
    const sp = await this.prisma.studentProfile.count({ where: { id: d.studentId } });
    if (!sp) throw new NotFoundException("O'quvchi topilmadi");
    const f = await this.prisma.paymentFollowUp.create({
      data: { studentId: d.studentId, month: d.month, kind: d.kind, note: d.note || null, promisedAt: d.promisedAt ? new Date(`${d.promisedAt}T00:00:00Z`) : null, createdById: u.sub },
    });
    return { id: f.id };
  }

  @Delete("payment-followups/:id") async removeFollowUp(@Param("id") id: string) {
    const { count } = await this.prisma.paymentFollowUp.deleteMany({ where: { id, kind: { not: "BOT" } } });
    if (!count) throw new NotFoundException("Yozuv topilmadi");
    return { ok: true };
  }

  private month(m?: string) {
    const month = m || monthOf(new Date());
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException("Oy noto'g'ri (YYYY-MM)");
    return month;
  }

  private async build(month: string): Promise<PaymentInsights> {
    const p = this.prisma;
    const now = new Date();
    const from = monthStart(month);
    const to = monthStart(shiftMonth(month, 1));
    const isCurrent = month === monthOf(now);
    const day = isCurrent ? new Date(now.getTime() + TZ).getUTCDate() : daysIn(month);
    const months6 = Array.from({ length: 6 }, (_, i) => shiftMonth(month, -i)); // shu oy va oldingi 5

    // ---------- offline ----------
    const groups = await p.group.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, monthlyFeeUzs: true } });
    const offStudents = await p.studentProfile.findMany({
      where: { groupId: { in: groups.map((g) => g.id) }, user: { role: "STUDENT", isBlocked: false, createdAt: { lt: to } } },
      select: {
        id: true,
        groupId: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, phone: true } },
        parents: { where: { status: "APPROVED" }, take: 1, select: { phone: true, parent: { select: { firstName: true, lastName: true, phone: true } } } },
      },
    });
    const offPays = await p.offlinePayment.findMany({ where: { studentId: { in: offStudents.map((s) => s.id) }, month: { in: [...months6, shiftMonth(month, -6)] } }, select: { studentId: true, month: true, amountUzs: true } });
    const paidKey = new Set(offPays.map((x) => `${x.studentId}|${x.month}`));
    const attendance = await p.attendance.groupBy({
      by: ["studentId"],
      where: { studentId: { in: offStudents.map((s) => s.id) }, date: { gte: monthDate(month), lt: monthDate(shiftMonth(month, 1)) }, status: { in: ["PRESENT", "LATE"] } },
      _count: true,
    });
    const came = new Map(attendance.map((a) => [a.studentId, a._count]));
    const fee = new Map(groups.map((g) => [g.id, g.monthlyFeeUzs]));
    const groupRows = groups.map((g) => {
      const list = offStudents.filter((s) => s.groupId === g.id);
      const paid = list.filter((s) => paidKey.has(`${s.id}|${month}`));
      return {
        groupId: g.id,
        name: g.name,
        feeUzs: g.monthlyFeeUzs,
        students: list.length,
        paid: paid.length,
        expectedUzs: (g.monthlyFeeUzs ?? 0) * list.length,
        collectedUzs: offPays.filter((x) => x.month === month && list.some((s) => s.id === x.studentId)).reduce((s, x) => s + x.amountUzs, 0),
      };
    });
    const off = {
      groups: groupRows.filter((g) => g.students > 0),
      students: offStudents.length,
      paid: groupRows.reduce((s, g) => s + g.paid, 0),
      expectedUzs: groupRows.reduce((s, g) => s + g.expectedUzs, 0),
      collectedUzs: groupRows.reduce((s, g) => s + g.collectedUzs, 0),
      feeMissing: groupRows.filter((g) => !g.feeUzs).reduce((s, g) => s + g.students, 0),
    };

    // ---------- online ----------
    const offUserIds = new Set(offStudents.map((s) => s.user.id));
    const subs = await p.subscription.findMany({
      where: { status: { not: "CANCELLED" }, endsAt: { gte: from, lt: to }, user: { role: "STUDENT", isBlocked: false } },
      select: { id: true, userId: true, endsAt: true, plan: { select: { name: true, priceUzs: true } }, user: { select: { id: true, firstName: true, lastName: true, phone: true, student: { select: { id: true, parents: { where: { status: "APPROVED" }, take: 1, select: { phone: true, parent: { select: { firstName: true, lastName: true, phone: true } } } } } } } } },
      orderBy: { endsAt: "asc" },
    });
    const dueSubs = subs.filter((s) => !offUserIds.has(s.userId));
    const later = await p.subscription.findMany({ where: { userId: { in: dueSubs.map((s) => s.userId) }, status: "ACTIVE", endsAt: { gte: to } }, select: { userId: true, endsAt: true } });
    const renewedUsers = new Set(later.map((l) => l.userId));
    const lastPerUser = new Map<string, (typeof dueSubs)[number]>();
    for (const s of dueSubs) if (!lastPerUser.has(s.userId) || lastPerUser.get(s.userId)!.endsAt < s.endsAt) lastPerUser.set(s.userId, s);
    const due = [...lastPerUser.values()];
    const [onlinePaid, pending] = await Promise.all([
      p.payment.aggregate({ where: { status: "APPROVED", planId: { not: null }, createdAt: { gte: from, lt: to } }, _sum: { amountUzs: true } }),
      p.payment.findMany({ where: { status: "PENDING", planId: { not: null } }, select: { userId: true, amountUzs: true } }),
    ]);
    const pendingUsers = new Set(pending.map((x) => x.userId));
    const lapsed = due.filter((s) => !renewedUsers.has(s.userId) && s.endsAt < now);
    const online = {
      due: due.length,
      renewed: due.filter((s) => renewedUsers.has(s.userId)).length,
      lapsed: lapsed.length,
      expectedUzs: due.reduce((s, x) => s + x.plan.priceUzs, 0),
      collectedUzs: onlinePaid._sum.amountUzs ?? 0,
      pendingReceipts: pending.length,
      pendingUzs: pending.reduce((s, x) => s + x.amountUzs, 0),
    };

    // ---------- qarzdorlar ----------
    const offDebtors = offStudents.filter((s) => !paidKey.has(`${s.id}|${month}`));
    const studentIds = [...offDebtors.map((s) => s.id), ...lapsed.map((s) => s.user.student?.id).filter((x): x is string => Boolean(x))];
    const followUps = await p.paymentFollowUp.findMany({
      where: { studentId: { in: studentIds }, month },
      orderBy: { createdAt: "desc" },
      select: { id: true, studentId: true, kind: true, note: true, promisedAt: true, createdAt: true, createdBy: { select: { firstName: true } } },
    });
    const fuOf = (id: string) =>
      followUps
        .filter((f) => f.studentId === id)
        .map((f) => ({ id: f.id, kind: f.kind as FollowUpKindName, note: f.note, promisedAt: f.promisedAt?.toISOString().slice(0, 10) ?? null, by: f.createdBy?.firstName ?? null, createdAt: f.createdAt.toISOString() }));
    const lastSeen = await this.lastActivity(lapsed.map((s) => s.userId));
    const parentOf = (ps: { phone: string | null; parent: { firstName: string; lastName: string | null; phone: string | null } }[] | undefined) =>
      ps?.[0] ? { name: name(ps[0].parent), phone: ps[0].phone ?? ps[0].parent.phone } : null;

    const debtors: DebtorRow[] = [
      ...offDebtors.map((s) => {
        // Ketma-ket to'lanmagan oylar (o'quvchi qo'shilgan oydan oldingisi hisoblanmaydi)
        let months = 0;
        for (const m of months6) {
          if (m < monthOf(s.createdAt) || paidKey.has(`${s.id}|${m}`)) break;
          months++;
        }
        return {
          studentId: s.id,
          userId: s.user.id,
          name: name(s.user),
          phone: s.user.phone,
          kind: "OFFLINE" as const,
          where: groups.find((g) => g.id === s.groupId)?.name ?? null,
          amountUzs: fee.get(s.groupId!) ?? 0,
          overdue: { months },
          attended: came.get(s.id) ?? 0,
          idleDays: null,
          parent: parentOf(s.parents),
          pendingReceipt: false,
          followUps: fuOf(s.id),
        };
      }),
      ...lapsed.map((s) => ({
        studentId: s.user.student?.id ?? s.userId,
        userId: s.userId,
        name: name(s.user),
        phone: s.user.phone,
        kind: "ONLINE" as const,
        where: s.plan.name,
        amountUzs: s.plan.priceUzs,
        overdue: { days: Math.max(0, Math.floor((now.getTime() - s.endsAt.getTime()) / DAY)) },
        attended: null,
        idleDays: lastSeen.has(s.userId) ? Math.floor((now.getTime() - lastSeen.get(s.userId)!.getTime()) / DAY) : null,
        parent: parentOf(s.user.student?.parents),
        pendingReceipt: pendingUsers.has(s.userId),
        followUps: s.user.student ? fuOf(s.user.student.id) : [],
      })),
    ].sort((a: DebtorRow, b: DebtorRow) => (b.overdue.months ?? 0) - (a.overdue.months ?? 0) || b.amountUzs - a.amountUzs || a.name.localeCompare(b.name));

    // ---------- jami, tarix, prognoz ----------
    const expectedUzs = off.expectedUzs + online.expectedUzs;
    const collectedUzs = off.collectedUzs + online.collectedUzs;
    const history = [3, 2, 1].map((k) => {
      const m = shiftMonth(month, -k);
      const exp = offStudents.filter((s) => monthOf(s.createdAt) <= m).reduce((sum, s) => sum + (fee.get(s.groupId!) ?? 0), 0);
      const got = offPays.filter((x) => x.month === m).reduce((sum, x) => sum + x.amountUzs, 0);
      return { month: m, expectedUzs: exp, collectedUzs: got };
    });
    const withData = history.filter((h) => h.expectedUzs > 0);
    const rate = withData.length ? Math.min(1, withData.reduce((s, h) => s + h.collectedUzs, 0) / withData.reduce((s, h) => s + h.expectedUzs, 0)) : null;
    const offlineLeft = Math.max(0, off.expectedUzs - off.collectedUzs);
    const usedRate = rate ?? 0.8;
    const endOfMonthUzs = isCurrent ? Math.round(collectedUzs + online.pendingUzs + offlineLeft * usedRate) : collectedUzs;
    const basis = isCurrent
      ? `Hozir tushgan ${formatSum(collectedUzs)} so'm + kutilayotgan cheklar ${formatSum(online.pendingUzs)} so'm + offline qarzning ${Math.round(usedRate * 100)}% i (${rate === null ? "taxminiy ulush: oldingi oylar ma'lumoti yo'q" : "oxirgi 3 oyda shuncha undirilgan"})`
      : "O'tgan oy: haqiqatda tushgan summa";
    const nextFrom = to;
    const nextTo = monthStart(shiftMonth(month, 2));
    const nextOnline = await p.subscription.findMany({
      where: { status: "ACTIVE", endsAt: { gte: nextFrom, lt: nextTo }, user: { role: "STUDENT", isBlocked: false } },
      select: { userId: true, plan: { select: { priceUzs: true } } },
    });
    const nextMonthExpectedUzs =
      offStudents.reduce((s, x) => s + (fee.get(x.groupId!) ?? 0), 0) +
      nextOnline.filter((x) => !offUserIds.has(x.userId) && !renewedUsers.has(x.userId)).reduce((s, x) => s + x.plan.priceUzs, 0);

    return {
      month,
      day,
      daysInMonth: daysIn(month),
      offline: off,
      online,
      total: { expectedUzs, collectedUzs, percent: expectedUzs ? Math.round((collectedUzs / expectedUzs) * 100) : null },
      forecast: { endOfMonthUzs, basis, nextMonthExpectedUzs },
      history,
      debtors,
    };
  }

  private async lastActivity(userIds: string[]) {
    if (!userIds.length) return new Map<string, Date>();
    const [l, a, e] = await Promise.all([
      this.prisma.lessonProgress.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _max: { updatedAt: true } }),
      this.prisma.attempt.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _max: { startedAt: true } }),
      this.prisma.essay.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _max: { createdAt: true } }),
    ]);
    const m = new Map<string, Date>();
    const put = (id: string, d: Date | null) => d && (!m.has(id) || m.get(id)! < d) && m.set(id, d);
    l.forEach((x) => put(x.userId, x._max.updatedAt));
    a.forEach((x) => put(x.userId, x._max.startedAt));
    e.forEach((x) => put(x.userId, x._max.createdAt));
    return m;
  }
}
