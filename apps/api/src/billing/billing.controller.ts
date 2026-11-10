import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res } from "@nestjs/common";
import {
  billingSettingsInput,
  currentMonth,
  grantSubscriptionInput,
  groupFeeInput,
  offlinePaymentInput,
  paymentRejectInput,
  planInput,
  type PaymentStatusName,
} from "@onatili/shared";
import type { FastifyReply } from "fastify";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { parse } from "../admin/zod";
import { BillingService } from "./billing.service";
import { OfflineBillingService } from "./offline.service";

/** O'quvchi: tariflar, karta, chek yuborish */
@Controller("billing")
export class BillingController {
  constructor(private readonly svc: BillingService) {}

  @Get() view(@CurrentUser() u: JwtUser) {
    return this.svc.view(u.sub);
  }

  /** Tana: xom rasm baytlari (image/jpeg | image/png | image/webp) */
  @Roles("STUDENT")
  @Post("payments")
  submit(
    @CurrentUser() u: JwtUser,
    @Query("planId") planId: string | undefined,
    @Query("essayId") essayId: string | undefined,
    @Query("note") note: string | undefined,
    @Body() body: unknown,
  ) {
    return this.svc.submit(u.sub, essayId ? { essayId } : { planId }, note ?? null, body);
  }

  @Delete("payments/:id") cancel(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.cancel(u.sub, id);
  }
}

/** Ustoz (ega): to'lovlar, obunalar, tariflar, karta. Yordamchilar kira olmaydi. */
@Roles("TEACHER")
@Controller("admin")
export class AdminBillingController {
  constructor(private readonly svc: BillingService) {}

  @Get("payments") list(@Query("status") status?: string) {
    const s: PaymentStatusName = status === "APPROVED" || status === "REJECTED" ? status : "PENDING";
    return this.svc.list(s);
  }

  @Get("payments/:id/receipt") async receipt(@Param("id") id: string, @Res() res: FastifyReply) {
    const r = await this.svc.receipt(id);
    return res.header("Content-Type", r.mime).header("Cache-Control", "private, no-store").send(r.data);
  }

  @Post("payments/:id/approve") @HttpCode(200) approve(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.approve(u.sub, id);
  }

  @Post("payments/:id/reject") @HttpCode(200) reject(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.reject(u.sub, id, parse(paymentRejectInput, b).reason);
  }

  /** Tasdiqlangan to'lovni bekor qilish (xato tasdiqlangan, pul qaytarilgan): obuna yopiladi, esse navbatdan chiqadi */
  @Post("payments/:id/revoke") @HttpCode(200) revoke(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.revoke(u.sub, id, parse(paymentRejectInput, b).reason);
  }

  @Get("subscriptions") subscriptions() {
    return this.svc.subscriptions();
  }

  @Post("subscriptions") grant(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    const d = parse(grantSubscriptionInput, b);
    return this.svc.grant(u.sub, d.userId, d.planId, d.note);
  }

  @Post("subscriptions/:id/cancel") @HttpCode(200) cancelSub(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.svc.cancelSubscription(u.sub, id);
  }

  @Get("plans") plans() {
    return this.svc.adminPlans();
  }

  @Post("plans") createPlan(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    return this.svc.createPlan(u.sub, parse(planInput, b));
  }

  @Patch("plans/:id") updatePlan(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.updatePlan(u.sub, id, parse(planInput.partial(), b));
  }

  @Get("billing-settings") async card() {
    return { card: await this.svc.card() };
  }

  @Put("billing-settings") saveCard(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    return this.svc.saveCard(u.sub, parse(billingSettingsInput, b));
  }
}

/** Ustoz (ega): offline guruhlarning oylik to'lovlari */
@Roles("TEACHER")
@Controller("admin/offline-payments")
export class AdminOfflineBillingController {
  constructor(private readonly svc: OfflineBillingService) {}

  @Get() ledger(@Query("groupId") groupId = "", @Query("month") month?: string) {
    return this.svc.ledger(groupId, month || currentMonth());
  }

  /** To'lov oynasi: o'quvchining oxirgi davri va keyingi davr boshlanishi */
  @Get("student/:studentId") nextPeriod(@Param("studentId") studentId: string) {
    return this.svc.nextPeriod(studentId);
  }

  @Put() mark(@CurrentUser() u: JwtUser, @Body() b: unknown) {
    return this.svc.mark(u.sub, parse(offlinePaymentInput, b));
  }

  @Delete(":studentId/:month") unmark(@CurrentUser() u: JwtUser, @Param("studentId") studentId: string, @Param("month") month: string) {
    return this.svc.unmark(u.sub, studentId, month);
  }

  @Patch("groups/:id/fee") fee(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: unknown) {
    return this.svc.setFee(u.sub, id, parse(groupFeeInput, b).monthlyFeeUzs);
  }

  @Post("remind") @HttpCode(200) remind(@CurrentUser() u: JwtUser, @Body() b: { groupId?: string; month?: string }) {
    return this.svc.remind(u.sub, b?.groupId ?? "", b?.month || currentMonth());
  }
}
