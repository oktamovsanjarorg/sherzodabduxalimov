import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res } from "@nestjs/common";
import { billingSettingsInput, grantSubscriptionInput, paymentRejectInput, planInput, type PaymentStatusName } from "@onatili/shared";
import type { FastifyReply } from "fastify";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { parse } from "../admin/zod";
import { BillingService } from "./billing.service";

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
  submit(@CurrentUser() u: JwtUser, @Query("planId") planId = "", @Query("note") note: string | undefined, @Body() body: unknown) {
    return this.svc.submit(u.sub, planId, note ?? null, body);
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
