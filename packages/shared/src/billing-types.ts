import { z } from "zod";

// ===================== To'lov va obuna =====================

/** Chek rasmi hajmi chegarasi (klient rasmni siqib yuboradi, odatda 200–500 KB) */
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export type PaymentStatusName = "PENDING" | "APPROVED" | "REJECTED";
export type PaymentMethodName = "MANUAL" | "CLICK" | "PAYME";

export interface PlanView {
  id: string;
  name: string;
  priceUzs: number;
  durationDays: number;
  description: string | null;
}

export interface BillingCard {
  number: string;
  holder: string;
  /** Qo'shimcha ko'rsatma (masalan: "Izohga ismingizni yozing") */
  note: string | null;
}

export interface MyPayment {
  id: string;
  planName: string;
  amountUzs: number;
  status: PaymentStatusName;
  reviewNote: string | null;
  createdAt: string;
}

export interface BillingView {
  plans: PlanView[];
  /** Ustoz karta rekvizitlarini kiritmagan bo'lsa null */
  card: BillingCard | null;
  subscription: { planName: string; endsAt: string } | null;
  pending: MyPayment | null;
  history: MyPayment[];
  /** Offline guruh a'zosi bo'lsa: obuna kerak emas, oylik to'lov holati */
  offline: MyOfflineBilling | null;
}

export interface AdminPayment {
  id: string;
  student: { id: string; name: string; username: string | null; phone: string | null };
  /** Obuna to'lovi bo'lsa tarif, esse tekshiruvi bo'lsa esse */
  plan: { id: string; name: string; durationDays: number } | null;
  essay: { id: string; prompt: string } | null;
  method: PaymentMethodName;
  amountUzs: number;
  status: PaymentStatusName;
  payerNote: string | null;
  hasReceipt: boolean;
  reviewNote: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Tasdiqlangan bo'lsa: berilgan obuna muddati */
  subscription: { startsAt: string; endsAt: string } | null;
  /** O'quvchining hozirgi faol obunasi (tasdiqlansa shu sanadan uzaytiriladi) */
  activeUntil: string | null;
}

export interface AdminSubscriptions {
  active: AdminSubscription[];
  /** So'nggi 30 kunda tugagan va uzaytirilmagan */
  lapsed: AdminSubscription[];
}

export interface AdminSubscription {
  id: string;
  student: { id: string; name: string; username: string | null; phone: string | null };
  planName: string;
  startsAt: string;
  endsAt: string;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  method: PaymentMethodName | null;
}

export interface AdminPlan extends PlanView {
  isActive: boolean;
  sortOrder: number;
  activeSubscribers: number;
}

export const planInput = z.object({
  name: z.string().trim().min(2, "Nomi kamida 2 harf").max(80),
  priceUzs: z.coerce.number().int().min(1000, "Narx kamida 1 000 so'm").max(100_000_000),
  durationDays: z.coerce.number().int().min(1).max(730),
  description: z.string().trim().max(300).nullable().default(null),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type PlanInput = z.infer<typeof planInput>;

export const billingSettingsInput = z.object({
  // Bo'shliqlar olib tashlanadi: 16 xonali karta raqami (Uzcard/Humo/Visa)
  number: z
    .string()
    .transform((s) => s.replace(/\D/g, ""))
    .refine((s) => s.length === 16, "Karta raqami 16 ta raqamdan iborat bo'lishi kerak"),
  holder: z.string().trim().min(3, "Karta egasining ismini kiriting").max(80),
  note: z.string().trim().max(300).nullable().default(null),
});
export type BillingSettingsInput = z.infer<typeof billingSettingsInput>;

export const paymentRejectInput = z.object({ reason: z.string().trim().min(3, "Sababini yozing").max(300) });

export const grantSubscriptionInput = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
  /** Naqd to'lov va h.k. uchun izoh */
  note: z.string().trim().max(300).nullable().default(null),
});

/** "8600 1234 5678 9012" */
export const formatCard = (n: string) => n.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
/** 150000 -> "150 000" */
export const formatSum = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Davomiylik: 45 soniya · 10 daqiqa · 3 soat · 1 soat 30 daqiqa. Ilova va admin panelda bir xil */
export function formatDuration(sec: number | null | undefined): string | null {
  if (!sec) return null;
  if (sec < 60) return `${Math.round(sec)} soniya`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} daqiqa`;
  return `${Math.floor(m / 60)} soat${m % 60 ? ` ${m % 60} daqiqa` : ""}`;
}

/** Ball: 0,1 aniqlikda, o'nlik vergul bilan (17,5). Ilova, admin panel va bot xabarlarida bir xil */
export const formatScore = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

// ===================== Offline guruh to'lovlari =====================

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
/** "2026-11" -> "noyabr 2026" */
export const monthLabel = (m: string) => `${UZ_MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
/** Toshkent vaqti bo'yicha joriy oy: "2026-11" */
export const currentMonth = (now = new Date()) => new Date(now.getTime() + 5 * 3600_000).toISOString().slice(0, 7);

export interface OfflineLedgerRow {
  studentId: string;
  name: string;
  username: string | null;
  phone: string | null;
  /** Xabar yuboriladigan (tasdiqlangan) ota-onalar soni */
  approvedParents: number;
  paid: { amountUzs: number; note: string | null; paidAt: string; markedBy: string | null } | null;
}

export interface OfflineLedger {
  group: { id: string; name: string; monthlyFeeUzs: number | null };
  month: string;
  rows: OfflineLedgerRow[];
  totals: { students: number; paid: number; debtors: number; sumUzs: number };
  /** Shu oy uchun qarzdorlarga oxirgi eslatma qachon yuborilgan */
  lastReminderAt: string | null;
}

export const offlinePaymentInput = z.object({
  studentId: z.string().min(1),
  month: z.string().regex(MONTH_RE, "Oy YYYY-MM ko'rinishida bo'lishi kerak"),
  amountUzs: z.coerce.number().int().min(0).max(100_000_000).optional(),
  note: z.string().trim().max(300).nullable().default(null),
});

export const groupFeeInput = z.object({ monthlyFeeUzs: z.coerce.number().int().min(0).max(100_000_000).nullable() });

/** O'quvchi o'zining offline to'lov holatini ko'radi */
export interface MyOfflineBilling {
  groupName: string;
  monthlyFeeUzs: number | null;
  months: { month: string; paid: boolean; amountUzs: number | null }[];
}
