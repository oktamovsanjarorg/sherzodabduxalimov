import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@onatili/db";
import {
  formatSum,
  type AdminPayment,
  type AdminPlan,
  type AdminSubscription,
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
    const [plans, card, sub, payments] = await Promise.all([
      this.prisma.plan.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { priceUzs: "asc" }] }),
      this.card(),
      this.prisma.subscription.findFirst({
        where: { userId, status: "ACTIVE", endsAt: { gt: now } },
        orderBy: { endsAt: "desc" },
        include: { plan: { select: { name: true } } },
      }),
      this.prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10, include: { plan: { select: { name: true } } } }),
    ]);
    const mine = payments.map(
      (p): MyPayment => ({
        id: p.id,
        planName: p.plan.name,
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
      pending: mine.find((p) => p.status === "PENDING") ?? null,
      history: mine,
    };
  }

  async submit(userId: string, planId: string, payerNote: string | null, body: unknown): Promise<MyPayment> {
    if (!Buffer.isBuffer(body) || !body.length) throw new BadRequestException("Chek rasmini yuboring");
    const ext = sniffImage(body);
    if (!ext) throw new BadRequestException("Faqat rasm (JPG, PNG, WEBP) qabul qilinadi");
    const plan = await this.prisma.plan.findFirst({ where: { id: planId, isActive: true } });
    if (!plan) throw new NotFoundException("Tarif topilmadi");
    if (await this.prisma.payment.count({ where: { userId, status: "PENDING" } }))
      throw new ConflictException("Avvalgi chekingiz hali tekshirilmoqda");

    const p = await this.prisma.payment.create({
      data: { userId, planId, method: "MANUAL", amountUzs: plan.priceUzs, payerNote: payerNote?.trim().slice(0, 300) || null },
      include: { user: { select: { firstName: true, lastName: true, username: true } } },
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
        this.notify.send(t.telegramId, `💳 <b>Yangi to'lov cheki</b>\n${who}\n${esc(plan.name)} · ${formatSum(plan.priceUzs)} so'm\n\nAdmin panel → Ko'proq → To'lovlar`),
      ),
    );
    return { id: p.id, planName: plan.name, amountUzs: p.amountUzs, status: "PENDING", reviewNote: null, createdAt: p.createdAt.toISOString() };
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
      const p = await tx.payment.findUniqueOrThrow({ where: { id }, include: { plan: true, user: { select: { telegramId: true } } } });
      const sub = await this.extend(tx, p.userId, p.planId, p.plan.durationDays);
      await tx.payment.update({ where: { id }, data: { subscriptionId: sub.id } });
      return { payment: p, sub };
    });
    await this.audit(actorId, "payment.approve", "Payment", id, { subscriptionId: sub.id, endsAt: sub.endsAt });
    await this.notify.send(
      payment.user.telegramId,
      `✅ <b>To'lovingiz tasdiqlandi</b>\n${esc(payment.plan.name)} · ${formatSum(payment.amountUzs)} so'm\nObuna <b>${fmtDate(sub.endsAt)}</b> gacha faol. Barcha darslar va testlar ochildi!`,
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
      `❌ <b>To'lov cheki qabul qilinmadi</b>\nSabab: ${esc(reason)}\n\nIlovada "Obuna" bo'limidan chekni qayta yuborishingiz mumkin.`,
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

  async subscriptions(): Promise<AdminSubscription[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { status: "ACTIVE", endsAt: { gt: new Date() } },
      orderBy: { endsAt: "asc" },
      include: { user: { select: { id: true, firstName: true, lastName: true, username: true, phone: true } }, plan: { select: { name: true } }, payment: { select: { method: true } } },
      take: 500,
    });
    return rows.map((s) => ({
      id: s.id,
      student: { id: s.user.id, name: fullName(s.user), username: s.user.username, phone: s.user.phone },
      planName: s.plan.name,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      status: s.status,
      method: s.payment?.method ?? null,
    }));
  }

  async cancelSubscription(actorId: string, id: string) {
    const { count } = await this.prisma.subscription.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "CANCELLED" } });
    if (!count) throw new NotFoundException("Faol obuna topilmadi");
    await this.audit(actorId, "subscription.cancel", "Subscription", id);
    return { ok: true };
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
