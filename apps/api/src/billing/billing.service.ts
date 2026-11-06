import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@onatili/db";
import {
  formatSum,
  type AdminPayment,
  type AdminPlan,
  type AdminSubscription,
  type AdminSubscriptions,
  type BillingCard,
  type BillingSettingsInput,
  type BillingView,
  type MyPayment,
  type PaymentStatusName,
  type PlanInput,
} from "@onatili/shared";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ENV, type Env } from "../config/env";
import { NotifyService } from "../notify/notify.service";
import { esc } from "../notify/telegram";
import { PrismaService } from "../prisma/prisma.service";
import { OfflineBillingService } from "./offline.service";

const DAY = 86_400_000;
const BILLING_KEY = "billing";
const fullName = (u: { firstName: string; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ");
/** Toshkent vaqti bo'yicha "05.12.2026" */
const fmtDate = (d: Date) => new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10).split("-").reverse().join(".");

/** Rasm turini baytlardan aniqlaydi (Content-Type sarlavhasiga ishonilmaydi) */
export function sniffImage(buf: Buffer): "jpg" | "png" | "webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}
const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

const paymentInclude = {
  user: { select: { id: true, firstName: true, lastName: true, username: true, phone: true } },
  plan: { select: { id: true, name: true, durationDays: true } },
  essay: { select: { id: true, prompt: true } },
  reviewedBy: { select: { firstName: true, lastName: true } },
  subscription: { select: { startsAt: true, endsAt: true } },
} satisfies Prisma.PaymentInclude;

type Tx = Prisma.TransactionClient;

/**
 * Qo'lda to'lov: o'quvchi kartaga pul o'tkazib chek rasmini yuboradi, ustoz tasdiqlaydi,
 * obuna avtomatik ochiladi (faol obuna bo'lsa, uning oxiridan uzaytiriladi).
 */
@Injectable()
export class BillingService {
  private readonly mediaRoot: string;
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly offline: OfflineBillingService,
    @Inject(ENV) env: Env,
  ) {
    this.mediaRoot = resolve(env.MEDIA_DIR);
  }

  // ---------------- Sozlamalar ----------------

  async card(): Promise<BillingCard | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: BILLING_KEY } });
    const v = row?.value as Partial<BillingCard> | undefined;
    return v?.number && v.holder ? { number: v.number, holder: v.holder, note: v.note ?? null } : null;
  }

  async saveCard(actorId: string, d: BillingSettingsInput): Promise<BillingCard> {
    const value = { number: d.number, holder: d.holder, note: d.note };
    await this.prisma.appSetting.upsert({ where: { key: BILLING_KEY }, create: { key: BILLING_KEY, value }, update: { value } });
    await this.audit(actorId, "billing.card", "AppSetting", BILLING_KEY, { last4: d.number.slice(-4) });
    return value;
  }

  // ---------------- Tariflar ----------------

  async adminPlans(): Promise<AdminPlan[]> {
    const now = new Date();
    const plans = await this.prisma.plan.findMany({
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { priceUzs: "asc" }],
      include: { _count: { select: { subscriptions: { where: { status: "ACTIVE", endsAt: { gt: now } } } } } },
    });
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      priceUzs: p.priceUzs,
      durationDays: p.durationDays,
      description: p.description,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
      activeSubscribers: p._count.subscriptions,
    }));
  }

  async createPlan(actorId: string, d: PlanInput) {
    const p = await this.prisma.plan.create({ data: d });
    await this.audit(actorId, "plan.create", "Plan", p.id, d);
    return p;
  }

  async updatePlan(actorId: string, id: string, d: Partial<PlanInput>) {
    if (!(await this.prisma.plan.findUnique({ where: { id } }))) throw new NotFoundException("Tarif topilmadi");
    // Narx o'zgarsa, kutilayotgan to'lovlar eski narxda qoladi (o'quvchi shu summani o'tkazgan)
    const p = await this.prisma.plan.update({ where: { id }, data: d });
    await this.audit(actorId, "plan.update", "Plan", id, d);
    return p;
  }

  // ---------------- O'quvchi ----------------

  async view(userId: string): Promise<BillingView> {
    const now = new Date();
    const [plans, card, sub, payments, offline] = await Promise.all([
      this.prisma.plan.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { priceUzs: "asc" }] }),
      this.card(),
      this.prisma.subscription.findFirst({
        where: { userId, status: "ACTIVE", endsAt: { gt: now } },
        orderBy: { endsAt: "desc" },
        include: { plan: { select: { name: true } } },
      }),
      this.prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10, include: { plan: { select: { name: true } } } }),
      this.offline.mine(userId),
    ]);
    const mine = payments.map(
      (p): MyPayment => ({
        id: p.id,
        planName: p.plan?.name ?? "Esse tekshiruvi",
        amountUzs: p.amountUzs,
        status: p.status,
        reviewNote: p.reviewNote,
        createdAt: p.createdAt.toISOString(),
      }),
    );
    return {
      plans: plans.map((p) => ({ id: p.id, name: p.name, priceUzs: p.priceUzs, durationDays: p.durationDays, description: p.description })),
      card,
      subscription: sub ? { planName: sub.plan.name, endsAt: sub.endsAt.toISOString() } : null,
      // Obuna sahifasida faqat obuna to'lovi kutilayotgani ko'rsatiladi (esse to'lovi esse sahifasida)
      pending: mine.find((p, i) => p.status === "PENDING" && payments[i].planId) ?? null,
      history: mine,
      offline,
    };
  }

  async submit(userId: string, target: { planId?: string; essayId?: string }, payerNote: string | null, body: unknown): Promise<MyPayment> {
    if (!Buffer.isBuffer(body) || !body.length) throw new BadRequestException("Chek rasmini yuboring");
    const ext = sniffImage(body);
    if (!ext) throw new BadRequestException("Faqat rasm (JPG, PNG, WEBP) qabul qilinadi");

    let item: { planId: string | null; essayId: string | null; title: string; amountUzs: number };
    if (target.essayId) {
      const e = await this.prisma.essay.findFirst({ where: { id: target.essayId, userId } });
      if (!e || e.mode !== "TEACHER") throw new NotFoundException("Esse topilmadi");
      if (e.status !== "AWAITING_PAYMENT" || !e.priceUzs) throw new ConflictException("Bu esse uchun to'lov kerak emas");
      // Rad etilgan chek bo'lsa, uni yangisi bilan almashtiramiz (essayId unique)
      const prev = await this.prisma.payment.findUnique({ where: { essayId: e.id } });
      if (prev?.status === "PENDING") throw new ConflictException("Avvalgi chekingiz hali tekshirilmoqda");
      if (prev?.status === "APPROVED") throw new ConflictException("Bu esse allaqachon to'langan");
      if (prev) {
        await this.prisma.payment.delete({ where: { id: prev.id } });
        await this.removeReceipt(prev.receiptUrl);
      }
      item = { planId: null, essayId: e.id, title: "Esse tekshiruvi", amountUzs: e.priceUzs };
    } else {
      const plan = await this.prisma.plan.findFirst({ where: { id: target.planId ?? "", isActive: true } });
      if (!plan) throw new NotFoundException("Tarif topilmadi");
      if (await this.offline.mine(userId)) throw new ConflictException("Siz offline guruhdasiz: obuna kerak emas, to'lov darsda olinadi");
      if (await this.prisma.payment.count({ where: { userId, status: "PENDING", planId: { not: null } } }))
        throw new ConflictException("Avvalgi chekingiz hali tekshirilmoqda");
      item = { planId: plan.id, essayId: null, title: plan.name, amountUzs: plan.priceUzs };
    }

    // Bir vaqtda ikki so'rov kelsa (ikki marta bosilsa) ikkita chek yaratilmasin: o'quvchi bo'yicha qulf
    const p = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment:${userId}`}))`;
      const dup = item.essayId
        ? await tx.payment.count({ where: { essayId: item.essayId } })
        : await tx.payment.count({ where: { userId, status: "PENDING", planId: { not: null } } });
      if (dup) throw new ConflictException("Avvalgi chekingiz hali tekshirilmoqda");
      return tx.payment.create({
        data: { userId, planId: item.planId, essayId: item.essayId, method: "MANUAL", amountUzs: item.amountUzs, payerNote: payerNote?.trim().slice(0, 300) || null },
        include: { user: { select: { firstName: true, lastName: true, username: true } } },
      });
    });
    const rel = `receipts/${p.id}.${ext}`;
    try {
      await mkdir(dirname(this.abs(rel)), { recursive: true });
      await writeFile(this.abs(rel), body);
      await this.prisma.payment.update({ where: { id: p.id }, data: { receiptUrl: rel } });
    } catch (e) {
      await this.prisma.payment.delete({ where: { id: p.id } });
      throw e;
    }

    // Ustoz(lar)ga xabar
    const teachers = await this.prisma.user.findMany({ where: { role: "TEACHER", isBlocked: false }, select: { telegramId: true } });
    const who = esc(fullName(p.user)) + (p.user.username ? ` (@${esc(p.user.username)})` : "");
    await Promise.all(
      teachers.map((t) =>
        this.notify.send(t.telegramId, `💳 <b>Yangi to'lov cheki</b>\n${who}\n${esc(item.title)} · ${formatSum(item.amountUzs)} so'm\n\nAdmin panel → Ko'proq → To'lovlar`),
      ),
    );
    return { id: p.id, planName: item.title, amountUzs: p.amountUzs, status: "PENDING", reviewNote: null, createdAt: p.createdAt.toISOString() };
  }

  /** O'quvchi kutilayotgan chekini bekor qiladi (noto'g'ri rasm yuborgan bo'lsa) */
  async cancel(userId: string, id: string) {
    const p = await this.prisma.payment.findFirst({ where: { id, userId } });
    if (!p) throw new NotFoundException("To'lov topilmadi");
    const { count } = await this.prisma.payment.deleteMany({ where: { id, status: "PENDING" } });
    if (!count) throw new ConflictException("Chek allaqachon tekshirilgan");
    await this.removeReceipt(p.receiptUrl);
    return { ok: true };
  }

  // ---------------- Ustoz: to'lovlar ----------------

  async list(status: PaymentStatusName): Promise<AdminPayment[]> {
    const now = new Date();
    const rows = await this.prisma.payment.findMany({
      where: { status },
      include: paymentInclude,
      orderBy: status === "PENDING" ? { createdAt: "asc" } : { updatedAt: "desc" },
      take: 200,
    });
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const active = await this.prisma.subscription.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, status: "ACTIVE", endsAt: { gt: now } },
      _max: { endsAt: true },
    });
    const until = new Map(active.map((a) => [a.userId, a._max.endsAt]));
    return rows.map((p) => ({
      id: p.id,
      student: { id: p.user.id, name: fullName(p.user), username: p.user.username, phone: p.user.phone },
      plan: p.plan,
      essay: p.essay ? { id: p.essay.id, prompt: p.essay.prompt } : null,
      method: p.method,
      amountUzs: p.amountUzs,
      status: p.status,
      payerNote: p.payerNote,
      hasReceipt: !!p.receiptUrl,
      reviewNote: p.reviewNote,
      reviewedBy: p.reviewedBy ? fullName(p.reviewedBy) : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      subscription: p.subscription ? { startsAt: p.subscription.startsAt.toISOString(), endsAt: p.subscription.endsAt.toISOString() } : null,
      activeUntil: until.get(p.userId)?.toISOString() ?? null,
    }));
  }

  async receipt(id: string): Promise<{ mime: string; data: Buffer }> {
    const p = await this.prisma.payment.findUnique({ where: { id }, select: { receiptUrl: true } });
    if (!p?.receiptUrl) throw new NotFoundException("Chek yo'q");
    const data = await readFile(this.abs(p.receiptUrl)).catch(() => null);
    if (!data) throw new NotFoundException("Chek fayli topilmadi");
    return { mime: MIME[sniffImage(data) ?? "jpg"], data };
  }

  async approve(actorId: string, id: string) {
    const { payment, sub } = await this.prisma.$transaction(async (tx) => {
      // Ikki kishi bir vaqtda bossa ham faqat bittasi o'tadi
      const claimed = await tx.payment.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED", reviewedById: actorId } });
      if (!claimed.count) {
        const exists = await tx.payment.count({ where: { id } });
        throw exists ? new ConflictException("To'lov allaqachon ko'rib chiqilgan") : new NotFoundException("To'lov topilmadi");
      }
      const p = await tx.payment.findUniqueOrThrow({ where: { id }, include: { plan: true, essay: { select: { id: true, prompt: true } }, user: { select: { telegramId: true } } } });
      if (p.essayId) {
        // Esse tekshiruvi: esse ustoz navbatiga tushadi
        await tx.essay.updateMany({ where: { id: p.essayId, status: "AWAITING_PAYMENT" }, data: { status: "SUBMITTED" } });
        return { payment: p, sub: null };
      }
      const sub = await this.extend(tx, p.userId, p.planId!, p.plan!.durationDays);
      await tx.payment.update({ where: { id }, data: { subscriptionId: sub.id } });
      return { payment: p, sub };
    });
    await this.audit(actorId, "payment.approve", "Payment", id, sub ? { subscriptionId: sub.id, endsAt: sub.endsAt } : { essayId: payment.essayId });
    if (!sub) {
      await this.notify.send(
        payment.user.telegramId,
        `✅ <b>To'lovingiz tasdiqlandi</b>\nEsse «${esc(payment.essay?.prompt.slice(0, 80) ?? "")}» ustozga yuborildi. Tekshirilgach bot orqali xabar keladi.`,
      );
      return { ok: true, endsAt: null };
    }
    await this.notify.send(
      payment.user.telegramId,
      `✅ <b>To'lovingiz tasdiqlandi</b>\n${esc(payment.plan!.name)} · ${formatSum(payment.amountUzs)} so'm\nObuna <b>${fmtDate(sub.endsAt)}</b> gacha faol. Barcha darslar va testlar ochildi!`,
    );
    return { ok: true, endsAt: sub.endsAt.toISOString() };
  }

  async reject(actorId: string, id: string, reason: string) {
    const { count } = await this.prisma.payment.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", reviewedById: actorId, reviewNote: reason } });
    if (!count) {
      throw (await this.prisma.payment.count({ where: { id } }))
        ? new ConflictException("To'lov allaqachon ko'rib chiqilgan")
        : new NotFoundException("To'lov topilmadi");
    }
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id }, include: { user: { select: { telegramId: true } } } });
    await this.audit(actorId, "payment.reject", "Payment", id, { reason });
    await this.notify.send(
      p.user.telegramId,
      `❌ <b>To'lov cheki qabul qilinmadi</b>\nSabab: ${esc(reason)}\n\n${p.essayId ? "Ilovada «Esselarim» bo'limidan" : "Ilovada «Obuna» bo'limidan"} chekni qayta yuborishingiz mumkin.`,
    );
    return { ok: true };
  }

  // ---------------- Ustoz: obunalar ----------------

  /** Naqd to'lov yoki sovg'a: chek talab qilinmaydi */
  async grant(actorId: string, userId: string, planId: string, note: string | null) {
    const [user, plan] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, telegramId: true } }),
      this.prisma.plan.findUnique({ where: { id: planId } }),
    ]);
    if (!user || user.role !== "STUDENT") throw new NotFoundException("O'quvchi topilmadi");
    if (!plan) throw new NotFoundException("Tarif topilmadi");
    const sub = await this.prisma.$transaction(async (tx) => {
      const sub = await this.extend(tx, userId, planId, plan.durationDays);
      await tx.payment.create({
        data: { userId, planId, method: "MANUAL", amountUzs: plan.priceUzs, status: "APPROVED", reviewedById: actorId, reviewNote: note ?? "Qo'lda berildi", subscriptionId: sub.id },
      });
      return sub;
    });
    await this.audit(actorId, "subscription.grant", "Subscription", sub.id, { userId, planId, note });
    await this.notify.send(user.telegramId, `✅ <b>Obuna faollashtirildi</b>\n${esc(plan.name)} · <b>${fmtDate(sub.endsAt)}</b> gacha. Barcha darslar va testlar ochildi!`);
    return { ok: true, endsAt: sub.endsAt.toISOString() };
  }

  async subscriptions(): Promise<AdminSubscriptions> {
    const now = new Date();
    const include = {
      user: { select: { id: true, firstName: true, lastName: true, username: true, phone: true } },
      plan: { select: { name: true } },
      payment: { select: { method: true } },
    } satisfies Prisma.SubscriptionInclude;
    const [active, ended] = await Promise.all([
      this.prisma.subscription.findMany({ where: { status: "ACTIVE", endsAt: { gt: now } }, orderBy: { endsAt: "asc" }, include, take: 500 }),
      this.prisma.subscription.findMany({
        where: { status: "ACTIVE", endsAt: { lte: now, gt: new Date(now.getTime() - 30 * DAY) } },
        orderBy: { endsAt: "desc" },
        include,
        take: 500,
      }),
    ]);
    const activeUsers = new Set(active.map((s) => s.userId));
    const seen = new Set<string>();
    // Uzaytirmaganlar: hozir faol obunasi yo'q, har o'quvchi bir marta
    const lapsed = ended.filter((s) => !activeUsers.has(s.userId) && !seen.has(s.userId) && seen.add(s.userId));
    const map = (s: (typeof active)[number]): AdminSubscription => ({
      id: s.id,
      student: { id: s.user.id, name: fullName(s.user), username: s.user.username, phone: s.user.phone },
      planName: s.plan.name,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      status: s.status,
      method: s.payment?.method ?? null,
    });
    return { active: active.map(map), lapsed: lapsed.map(map) };
  }

  /**
   * Obunani bekor qiladi. Undan keyin navbatda turgan (uzaytirilgan, to'langan) obunalar bekor qilingan
   * qismning qolgan muddatiga oldinga suriladi: aks holda o'quvchi to'lagan obunasi boshlanguncha kirolmay qoladi.
   */
  async cancelSubscription(actorId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.cancelSubTx(tx, id))) throw new NotFoundException("Faol obuna topilmadi");
    });
    await this.audit(actorId, "subscription.cancel", "Subscription", id);
    return { ok: true };
  }

  /**
   * Tasdiqlangan to'lovni bekor qiladi (xato tasdiqlangan yoki pul qaytarilgan).
   * Obuna to'lovi: unga bog'langan obuna yopiladi. Esse to'lovi: esse hali tekshirilmagan bo'lsa navbatdan chiqadi.
   */
  async revoke(actorId: string, id: string, reason: string) {
    const p = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({
        where: { id, status: "APPROVED" },
        data: { status: "REJECTED", reviewedById: actorId, reviewNote: `Bekor qilindi: ${reason}` },
      });
      if (!count) {
        throw (await tx.payment.count({ where: { id } })) ? new ConflictException("Faqat tasdiqlangan to'lovni bekor qilish mumkin") : new NotFoundException("To'lov topilmadi");
      }
      const p = await tx.payment.findUniqueOrThrow({ where: { id }, include: { plan: true, user: { select: { telegramId: true } } } });
      if (p.subscriptionId) await this.cancelSubTx(tx, p.subscriptionId);
      if (p.essayId) await tx.essay.updateMany({ where: { id: p.essayId, status: "SUBMITTED" }, data: { status: "AWAITING_PAYMENT" } });
      return p;
    });
    await this.audit(actorId, "payment.revoke", "Payment", id, { reason, subscriptionId: p.subscriptionId, essayId: p.essayId });
    await this.notify.send(
      p.user.telegramId,
      `↩️ <b>To'lov bekor qilindi</b>\n${p.plan ? esc(p.plan.name) : "Esse tekshiruvi"} · ${formatSum(p.amountUzs)} so'm\nSabab: ${esc(reason)}\n\nSavol bo'lsa, ustozga murojaat qiling.`,
    );
    return { ok: true };
  }

  /**
   * Obunani yopadi. Undan keyin navbatda turgan (uzaytirilgan) obunalar bekor qilingan qismning
   * qolgan muddatiga oldinga suriladi. Faol obuna bo'lmasa false.
   */
  private async cancelSubTx(tx: Tx, id: string) {
    const sub = await tx.subscription.findUnique({ where: { id } });
    if (!sub || sub.status !== "ACTIVE") return false;
    await tx.subscription.update({ where: { id }, data: { status: "CANCELLED" } });
    const shift = sub.endsAt.getTime() - Math.max(sub.startsAt.getTime(), Date.now());
    if (shift <= 0) return true;
    const later = await tx.subscription.findMany({ where: { userId: sub.userId, status: "ACTIVE", id: { not: id }, startsAt: { gte: sub.endsAt } } });
    for (const l of later)
      await tx.subscription.update({
        where: { id: l.id },
        data: { startsAt: new Date(l.startsAt.getTime() - shift), endsAt: new Date(l.endsAt.getTime() - shift) },
      });
    return true;
  }

  // ---------------- Yordamchilar ----------------

  /** Yangi obuna: faol obuna bo'lsa, uning oxiridan boshlanadi (kunlar yo'qolmaydi) */
  private async extend(tx: Tx, userId: string, planId: string, days: number) {
    const now = new Date();
    const last = await tx.subscription.findFirst({
      where: { userId, status: "ACTIVE", endsAt: { gt: now } },
      orderBy: { endsAt: "desc" },
      select: { endsAt: true },
    });
    const startsAt = last ? last.endsAt : now;
    return tx.subscription.create({ data: { userId, planId, startsAt, endsAt: new Date(startsAt.getTime() + days * DAY) } });
  }

  private abs(rel: string) {
    const p = resolve(join(this.mediaRoot, rel));
    if (!p.startsWith(join(this.mediaRoot, "receipts") + "/")) throw new Error("bad receipt path");
    return p;
  }

  private async removeReceipt(rel: string | null) {
    if (rel) await rm(this.abs(rel), { force: true });
  }

  private audit(actorId: string, action: string, entity: string, entityId: string, meta?: object) {
    return this.prisma.auditLog.create({ data: { actorId, action, entity, entityId, meta: meta as Prisma.InputJsonValue } });
  }
}
