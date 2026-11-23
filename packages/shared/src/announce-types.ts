import { z } from "zod";

/** E'lon kimlarga boradi. TEACHER: ega va o'qituvchilar ham olishi mumkin (masalan, xodimlar uchun e'lon) */
export const ANNOUNCE_ROLES = ["STUDENT", "PARENT", "ASSISTANT"] as const;
export type AnnounceRole = (typeof ANNOUNCE_ROLES)[number];
export const ANNOUNCE_ROLE_LABELS: Record<AnnounceRole | "TEACHER", string> = {
  STUDENT: "O'quvchilar",
  PARENT: "Ota-onalar",
  ASSISTANT: "Xodimlar",
  TEACHER: "Ustozlar",
};

/** Telegram chegaralari: oddiy xabar 4096, rasm osti matni 1024 belgi */
export const ANNOUNCE_TEXT_MAX = 4000;
export const ANNOUNCE_CAPTION_MAX = 1000;

export const announceAudience = z
  .object({
    roles: z.array(z.enum(ANNOUNCE_ROLES)).max(3).default([]),
    /** Bo'sh: hamma guruhlar (va guruhsizlar ham) */
    groupIds: z.array(z.string().min(1)).max(100).default([]),
    /** Bo'sh: online ham, offline ham */
    modes: z
      .array(z.enum(["ONLINE", "OFFLINE"]))
      .max(2)
      .default([]),
    /** Faqat ustoz qabul qilgan o'quvchilar (botdan o'zi kirgan yangilar kirmaydi) */
    onlyAccepted: z.boolean().default(true),
    /** Qo'lda tanlangan odamlar (filtrdan tashqari qo'shiladi) */
    userIds: z.array(z.string().min(1)).max(1000).default([]),
  })
  .refine((a) => a.roles.length > 0 || a.userIds.length > 0, { message: "Kimga yuborilishini tanlang", path: ["roles"] });
export type AnnounceAudience = z.infer<typeof announceAudience>;

const buttonUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => /^app:\/[\w\-/?=&.]*$/.test(u) || /^https:\/\/[^\s]+$/.test(u), "Havola https:// bilan boshlanishi kerak");

export const announceInput = z
  .object({
    title: z.string().trim().max(120).nullable().optional(),
    text: z.string().trim().min(1, "Xabar matnini yozing").max(ANNOUNCE_TEXT_MAX, `Matn ${ANNOUNCE_TEXT_MAX} belgidan oshmasin`),
    photoFileId: z.string().max(300).nullable().optional(),
    buttonText: z.string().trim().max(40).nullable().optional(),
    buttonUrl: buttonUrl.nullable().optional(),
    silent: z.boolean().default(false),
    audience: announceAudience,
  })
  .refine((a) => !a.photoFileId || a.text.length <= ANNOUNCE_CAPTION_MAX, {
    message: `Rasm bilan matn ${ANNOUNCE_CAPTION_MAX} belgidan oshmasin (Telegram chegarasi)`,
    path: ["text"],
  })
  .refine((a) => !a.buttonText === !a.buttonUrl, { message: "Tugma uchun nom ham, havola ham kerak", path: ["buttonUrl"] });
export type AnnounceInput = z.infer<typeof announceInput>;

export const announceSendInput = z.object({
  /** ISO vaqt: kelajakda bo'lsa, rejalashtiriladi. null: hozir */
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export type AnnounceStatus = "DRAFT" | "SCHEDULED" | "SENT";
export type DeliveryStatusName = "PENDING" | "SENT" | "FAILED" | "BLOCKED";

export interface AnnounceStats {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  blocked: number;
  deleted: number;
}

export interface AnnounceRow {
  id: string;
  title: string | null;
  text: string;
  hasPhoto: boolean;
  buttonText: string | null;
  status: AnnounceStatus;
  audience: AnnounceAudience;
  audienceLabel: string;
  scheduledAt: string | null;
  sentAt: string | null;
  recalledAt: string | null;
  createdAt: string;
  author: string | null;
  stats: AnnounceStats;
}

export interface AnnounceDetail extends AnnounceRow {
  photoFileId: string | null;
  buttonUrl: string | null;
  silent: boolean;
  /** Telegram'dan qaytarib olsa bo'ladimi (48 soat ichida) */
  canRecall: boolean;
  recipients: {
    id: string;
    userId: string;
    name: string;
    username: string | null;
    role: string;
    status: DeliveryStatusName;
    error: string | null;
    sentAt: string | null;
    deleted: boolean;
  }[];
}

export interface AnnouncePreview {
  /** Telegram'i ulangan, xabar boradiganlar */
  reachable: number;
  /** Mos keladi, lekin botga hali kirmagan: xabar bormaydi */
  noTelegram: number;
  byRole: Partial<Record<AnnounceRole | "TEACHER", number>>;
  sample: string[];
}

/** Telegram'dan qaytarib olish oynasi (Bot API: 48 soat) */
export const ANNOUNCE_RECALL_MS = 47 * 3600_000;

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * E'lon matnini Telegram HTML'ga aylantiradi: **qalin**, __kursiv__, ~~o'chirilgan~~, `kod`, {ism}.
 * Foydalanuvchi matni avval to'liq escape qilinadi, shuning uchun HTML kiritib bo'lmaydi.
 */
export function renderAnnounce(text: string, vars: { name?: string } = {}): string {
  let s = escHtml(text);
  s = s.replace(/\*\*([^*\n][^\n]*?)\*\*/g, "<b>$1</b>");
  s = s.replace(/__([^_\n][^\n]*?)__/g, "<i>$1</i>");
  s = s.replace(/~~([^~\n][^\n]*?)~~/g, "<s>$1</s>");
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/\{ism\}/gi, escHtml(vars.name ?? ""));
  return s;
}
