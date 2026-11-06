import { z } from "zod";
import type { AttendanceStatusName } from "./attendance-types";
import type { PaymentStatusName } from "./billing-types";

// ===================== O'quvchilar (admin: hammasi bitta joyda) =====================

export interface RosterRow {
  studentId: string;
  userId: string;
  name: string;
  username: string | null;
  phone: string | null;
  group: { id: string; name: string } | null;
  /** Botga kirganmi (Telegram hisobi bog'langan) */
  telegramLinked: boolean;
  parents: { approved: number; pending: number };
  /** Online obuna tugash sanasi */
  subscriptionEndsAt: string | null;
  /** Offline: joriy oy to'langanmi (faqat egaga; guruhsizlarda null) */
  paidThisMonth: boolean | null;
  /** Oxirgi 30 kun davomati */
  attendance30: { present: number; absent: number; total: number };
  lastActiveAt: string | null;
  /** AUTO — obuna/guruh bo'yicha; FREE — ustoz bepul ochgan; CLOSED — ustoz yopgan */
  accessMode: "AUTO" | "FREE" | "CLOSED";
  /** Pullik kontent hozir ochiqmi (rejim, obuna va guruh hisobga olingan) */
  hasAccess: boolean;
  blocked: boolean;
}

export interface StudentDetail extends RosterRow {
  createdAt: string;
  blockedReason: string | null;
  /** Qo'lda kiritilgan va hali botga kirmagan o'quvchi uchun shaxsiy havola */
  inviteUrl: string | null;
  /** Ota-onaga yuboriladigan havola */
  parentInviteUrl: string;
  parentList: { id: string; name: string; phone: string | null; relation: string | null; status: "PENDING" | "APPROVED" | "REJECTED" }[];
  attendance: {
    counts: Record<AttendanceStatusName, number>;
    recent: { date: string; status: AttendanceStatusName; note: string | null; groupName: string | null }[];
  };
  /** Faqat egaga (yordamchiga null) */
  billing: {
    offlineMonths: { month: string; paid: boolean; amountUzs: number | null; note: string | null }[];
    subscription: { planName: string; endsAt: string } | null;
    payments: { id: string; title: string; amountUzs: number; status: PaymentStatusName; createdAt: string }[];
  } | null;
  stats: {
    lessonsCompleted: number;
    testsTaken: number;
    averagePercent: number | null;
    recentAttempts: { id: string; title: string; type: "TOPIC" | "MOCK"; percent: number; score: number; maxScore: number; finishedAt: string }[];
    essays: { id: string; prompt: string; mode: "AI" | "TEACHER"; status: string; score: number | null; createdAt: string }[];
  };
}

const phone = z
  .string()
  .trim()
  .max(30)
  .nullish()
  .transform((v) => v || null);

export const studentCreateInput = z.object({
  firstName: z.string().trim().min(2, "Ismini yozing").max(60),
  lastName: z.string().trim().max(60).nullish().transform((v) => v || null),
  phone,
  groupId: z.string().nullish().transform((v) => v || null),
});
export type StudentCreateInput = z.infer<typeof studentCreateInput>;

export const studentUpdateInput = studentCreateInput.partial();

/** Ro'yxatni bir yo'la kiritish: har qatorda "Ism Familiya, telefon" */
export const studentBulkInput = z.object({
  groupId: z.string().nullish().transform((v) => v || null),
  text: z.string().max(20_000),
});

/** "Aziz Karimov, 90 123 45 67" -> { firstName, lastName, phone } */
export function parseStudentLine(line: string): { firstName: string; lastName: string | null; phone: string | null } | null {
  const t = line.replace(/^\s*\d+[.)]\s*/, "").trim(); // "1. Aziz ..." raqamlarini olib tashlash
  if (!t) return null;
  const m = t.match(/(\+?\d[\d\s()-]{6,}\d)/);
  const phone = m ? m[1] : null;
  const name = (m ? t.replace(m[1], "") : t).replace(/[,;\t|]+/g, " ").replace(/\s+/g, " ").trim();
  if (name.length < 2) return null;
  const [firstName, ...rest] = name.split(" ");
  return { firstName, lastName: rest.join(" ") || null, phone };
}

/** O'zbekiston raqami: "90 123 45 67" -> "+998901234567" */
export function normUzPhone(p: string | null | undefined): string | null {
  const d = (p ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 9) return `+998${d}`;
  if (d.length === 12 && d.startsWith("998")) return `+${d}`;
  return `+${d}`;
}

export const studentAccessInput = z.object({ mode: z.enum(["AUTO", "FREE", "CLOSED"]) });
export const studentBlockInput = z.object({ blocked: z.boolean(), reason: z.string().trim().max(300).nullish().transform((v) => v || null) });

/** Botdan o'zi kirgan, ustoz hali ko'rib chiqmagan o'quvchi */
export interface NewcomerRow {
  studentId: string;
  userId: string;
  name: string;
  username: string | null;
  phone: string | null;
  photoUrl: string | null;
  createdAt: string;
  /** Ota-ona ulash so'rovi bor-yo'qligi */
  parentStatus: "NONE" | "PENDING" | "APPROVED";
  /** Ilovada nimadir qilganmi (dars, test, esse) */
  activity: { lessons: number; tests: number; essays: number };
}
