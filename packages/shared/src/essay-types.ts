import { z } from "zod";
import type { BillingCard, MyPayment } from "./billing-types";

// ===================== Erkin esse (AI yoki ustoz tekshiradi) =====================

export type EssayModeName = "AI" | "TEACHER";
export type EssayStatusName = "DRAFT" | "AWAITING_PAYMENT" | "SUBMITTED" | "AI_CHECKING" | "AI_CHECKED" | "AI_FAILED" | "REVIEWED";

/**
 * Rasmiy mezon: "Ona tili va adabiyot fanidan yozma ish (esse)ni baholash mezoni" (BBA).
 * 12 ta band, har biri 2 / 1,5 / 1 / 0,5 / 0 ball, jami 24. `levels` — shu ballarga mos tavsif (2 balldan boshlab).
 */
export const ESSAY_RUBRIC = [
  {
    key: "style", group: "Topshiriq talablarining bajarilganligi", label: "Publitsistik uslub", max: 2,
    levels: ["Esse to'liq publitsistik uslubda yozilgan", "Ayrim o'rinlarda publitsistik uslubdan chekinilgan", "Esse qisman publitsistik uslubda yozilgan", "Esse to'liq badiiy uslubda yozilgan", "Esse to'liq so'zlashuv uslubida yozilgan"],
  },
  {
    key: "views", group: "Topshiriq talablarining bajarilganligi", label: "Qarashlar va shaxsiy fikr", max: 2,
    levels: ["Har ikkala qarash hamda shaxsiy qarash to'la yoritilgan", "Har ikkala qarash yoritilgan, shaxsiy fikr yoritilmagan", "Qarashlarning bittasi to'la yoritilgan", "Qarashlarning faqat bittasi qisman yoritilgan", "Qarashlar yoritilmagan"],
  },
  {
    key: "evidence", group: "Topshiriq talablarining bajarilganligi", label: "Dalillar", max: 2,
    levels: ["Har ikkala qarash dalillar bilan asoslangan", "Faqat bitta qarash dalillangan", "Har ikkala qarash uchun ayrim dalillar vaziyatga mos emas", "Har ikkala qarash uchun dalillar vaziyatga mos emas", "Har ikkala qarash dalillanmagan"],
  },
  {
    key: "parts", group: "Matn yaxlitligi", label: "Kirish, asosiy qism, xulosa", max: 2,
    levels: ["Kirish, asosiy qism va xulosa to'la yoritilgan", "Qismlardan faqat ikkitasi to'la yoritilgan", "Qismlardan ikkitasi yuza yoritilgan", "Qismlardan faqat bittasi to'la yoritilgan", "Qismlardan faqat bittasi yuza yoritilgan"],
  },
  {
    key: "structure", group: "Matn yaxlitligi", label: "Mantiqiy qurilish va xatboshilar", max: 2,
    levels: ["Xatolik yo'q, xatboshilarga to'g'ri ajratilgan", "1–2 o'rinda xatolik", "3–4 o'rinda xatolik", "5–6 o'rinda xatolik", "7 va undan ko'p o'rinda xatolik yoki xatboshilarga umuman ajratilmagan"],
  },
  {
    key: "coherence", group: "Matn yaxlitligi", label: "Mantiqiy-mazmuniy izchillik", max: 2,
    levels: ["Izchillikka to'liq rioya qilingan, fikr takrori yo'q", "Fikr takrori 1–2 o'rinda, izchillik buzilmagan", "Fikr takrori 3–4 o'rinda, izchillik buzilgan", "Fikr takrori 5–6 o'rinda, izchillik buzilgan", "Fikr takrori 7 va undan ortiq o'rinda, izchillik buzilgan"],
  },
  {
    key: "spelling", group: "Savodxonlik", label: "Imlo", max: 2,
    levels: ["Imlo xatosi umuman yo'q", "Imlo xatosi 1–2 o'rinda", "Imlo xatosi 3–4 o'rinda", "Imlo xatosi 5–6 o'rinda", "Imlo xatosi 7 va undan ortiq o'rinda"],
  },
  {
    key: "punctuation", group: "Savodxonlik", label: "Punktuatsiya", max: 2,
    levels: ["Punktuatsion xato umuman yo'q", "Punktuatsion xato 1–2 o'rinda", "Punktuatsion xato 3–4 o'rinda", "Punktuatsion xato 5–6 o'rinda", "Punktuatsion xato 7 va undan ortiq o'rinda"],
  },
  {
    key: "affixes", group: "Til birliklari uslubiyati", label: "Qo'shimcha qo'llash", max: 2,
    levels: ["Qo'shimcha qo'llash xatosi yo'q", "1–2 o'rinda", "3–4 o'rinda", "5–6 o'rinda", "7 va undan ortiq o'rinda"],
  },
  {
    key: "wordUsage", group: "Til birliklari uslubiyati", label: "So'z qo'llash (uslubiy)", max: 2,
    levels: ["So'z qo'llash bilan bog'liq uslubiy xato yo'q", "1–2 o'rinda", "3–4 o'rinda", "5–6 o'rinda", "7 va undan ko'p o'rinda"],
  },
  {
    key: "lexicon", group: "Lug'at boyligi", label: "Leksik xilma-xillik", max: 2,
    levels: [
      "Tasviriy ifodalar, maxsus leksik birliklar, barqaror birikmalardan unumli foydalanilgan",
      "Ulardan ayrim o'rinlarda foydalanilgan",
      "Foydalanilgan, ayrim o'rinlarda noo'rin",
      "Leksik xilma-xillik yo'q: noo'rin foydalanilgan",
      "Leksik xilma-xillik yo'q: foydalanilmagan",
    ],
  },
  {
    key: "purity", group: "Lug'at boyligi", label: "Sheva, vulgarizm, varvarizm, parazit so'zlar", max: 2,
    levels: ["Uchramaydi", "1–2 o'rinda, uslubiy g'alizlik yo'q", "3–4 o'rinda, uslubiy g'alizlik bor", "5–6 o'rinda, uslubiy g'alizlik bor", "7 va undan ko'p o'rinda, uslubiy g'alizlik bor"],
  },
] as const;
export const ESSAY_MAX_SCORE = ESSAY_RUBRIC.reduce((s, c) => s + c.max, 0); // 24
export type EssayCriterionKey = (typeof ESSAY_RUBRIC)[number]["key"];
/** Har bir band uchun mumkin bo'lgan ballar (levels tartibida) */
export const RUBRIC_STEPS = [2, 1.5, 1, 0.5, 0] as const;

/**
 * Esse tekshirilmaydigan holatlar (mezon va "Talablar" 31–32-bandlari).
 * Bunda 12 band baholanmaydi, umumiy ball qat'iy belgilanadi.
 */
export const ESSAY_SPECIAL = {
  OFF_TOPIC: { score: 2, label: "Mavzuga mos emas" },
  TOO_SHORT: { score: 2, label: "100 ta so'zdan kam" },
  COPIED: { score: 2, label: "Boshqa manbadan ko'chirilgan" },
  ONLY_INTRO: { score: 0, label: "Faqat kirish qismi yozilgan" },
  CYRILLIC: { score: 0, label: "To'liq kirill alifbosida yozilgan" },
  BLANK: { score: 0, label: "Esse yozilmagan" },
} as const;
export type EssaySpecialKey = keyof typeof ESSAY_SPECIAL;

/** O'quvchiga ko'rsatiladigan talablar ("Esse yozilishiga qo'yiladigan talablar") */
export const ESSAY_REQUIREMENTS = [
  "Fikr-mulohazalaringizni publitsistik uslubda bayon qiling.",
  "Fikrlaringizni mantiqiy izchillikda, adabiy til me'yorlariga amal qilgan holda ifodalang.",
  "Berilgan vaziyat matnini aynan ko'chirmang.",
  "Esse uch qismdan iborat bo'lsin: kirish, asosiy qism va xulosa.",
  "Reja tuzilmaydi, epigraf qo'yilmaydi. Kamida 100 ta so'z, faqat lotin yozuvida.",
] as const;

const CYR = /[\u0400-\u04FF]/g;
const LAT = /[A-Za-z\u02BB\u02BC'`ʻʼ]/g;
/** Matn (deyarli) to'liq kirillchami: harflarning 80% dan ko'pi kirill */
export function isMostlyCyrillic(text: string) {
  const c = (text.match(CYR) ?? []).length;
  const l = (text.match(LAT) ?? []).length;
  return c > 20 && c / (c + l) > 0.8;
}
export const countWords = (t: string) => (t.trim().match(/[\p{L}\p{N}'ʻʼ`-]+/gu) ?? []).length;

export const MAX_ESSAY_PAGES = 4;
/** AI varoq rasmida esse matnini topmadi (boshqa narsaning rasmi, xira yoki bo'sh varoq). Limitga hisoblanmaydi */
export const NO_ESSAY_ERROR = "Rasmda esse matni topilmadi. Varoqni yorug' joyda, tekis va aniq qilib suratga oling.";
export const AI_ESSAY_DAILY_LIMIT = 2;
export const ESSAY_STATUS_LABELS: Record<EssayStatusName, string> = {
  DRAFT: "Qoralama",
  AWAITING_PAYMENT: "To'lov kutilmoqda",
  SUBMITTED: "Ustoz tekshirmoqda",
  AI_CHECKING: "AI tekshirmoqda",
  AI_CHECKED: "AI tekshirdi",
  AI_FAILED: "AI tekshira olmadi",
  REVIEWED: "Ustoz tekshirdi",
};

export interface EssayReviewView {
  source: "AI" | "TEACHER";
  reviewer: string | null;
  criteria: { key: string; label: string; score: number; max: number; comment: string | null }[];
  totalScore: number;
  maxScore: number;
  feedback: string | null;
  /** Faqat AI: topilgan xatolar */
  mistakes: { wrong: string; right: string; note: string | null }[];
  /** Esse tekshirilmaydigan holat (2 yoki 0 ball) */
  special: { key: string; label: string } | null;
  createdAt: string;
}

/** Ustozning ovozli izohi */
export interface VoiceView {
  id: string;
  status: "PROCESSING" | "READY" | "FAILED";
  durationSec: number | null;
}
/** Ovozli izoh: ko'pi bilan 12 MB (taxminan 10 daqiqa) */
export const MAX_VOICE_BYTES = 12 * 1024 * 1024;

export interface MyEssaySummary {
  id: string;
  mode: EssayModeName;
  prompt: string;
  status: EssayStatusName;
  score: { total: number; max: number } | null;
  createdAt: string;
}

export interface MyEssayDetail extends MyEssaySummary {
  text: string | null;
  pages: number;
  priceUzs: number | null;
  error: string | null;
  /** To'lov (faqat ustoz tekshiruvi) */
  payment: MyPayment | null;
  reviews: EssayReviewView[];
  voice: VoiceView | null;
}

export interface EssayConfig {
  /** AI yozilgan matnni tekshira oladi */
  aiEnabled: boolean;
  /** AI qo'lyozma rasmini o'qiy oladi */
  aiPhotoEnabled: boolean;
  aiDailyLimit: number;
  aiUsedToday: number;
  /** Ustoz tekshiruvi narxi; null bo'lsa hali yoqilmagan */
  teacherPriceUzs: number | null;
  card: BillingCard | null;
  /** Xodim sinab ko'rmoqda: ustoz tekshiruvi to'lovsiz */
  staffPreview: boolean;
}

export const createEssayInput = z
  .object({
    mode: z.enum(["AI", "TEACHER"]),
    prompt: z.string().trim().min(3, "Esse mavzusini yozing").max(300),
    text: z.string().trim().max(20_000).nullable().default(null),
  })
  // AI: matn yozilsa kamida 30 so'z; matnsiz bo'lsa varoq rasmlari yuklanadi
  .refine((d) => d.mode !== "AI" || !d.text || (d.text.match(/\S+/g)?.length ?? 0) >= 30, { message: "AI tekshiruvi uchun kamida 30 so'zli matn kerak", path: ["text"] });
export type CreateEssayInput = z.infer<typeof createEssayInput>;

export const teacherEssayReviewInput = z.object({
  /** Maxsus holat tanlansa criteria e'tiborga olinmaydi */
  special: z.enum(["OFF_TOPIC", "TOO_SHORT", "COPIED", "ONLY_INTRO", "CYRILLIC", "BLANK"]).nullable().default(null),
  criteria: z.array(z.object({ key: z.string(), score: z.coerce.number().min(0).max(2), comment: z.string().trim().max(1000).nullable().default(null) })).default([]),
  feedback: z.string().trim().max(5000).nullable().default(null),
});
export type TeacherEssayReviewInput = z.infer<typeof teacherEssayReviewInput>;

export interface AdminHwEssay {
  id: string;
  student: { id: string; name: string; username: string | null; phone: string | null };
  mode: EssayModeName;
  prompt: string;
  text: string | null;
  pages: number;
  status: EssayStatusName;
  createdAt: string;
  reviews: EssayReviewView[];
  voice: VoiceView | null;
}

/** Rubrika bo'yicha umumiy ball: maxsus holat bo'lsa uning bali, aks holda 12 band (har biri 0..2, 0,5 qadam) yig'indisi */
export function rubricScore(special: EssaySpecialKey | null, criteria: { key: string; score: number }[]) {
  if (special) return { total: ESSAY_SPECIAL[special].score, criteria: [] as { key: string; label: string; max: number; score: number }[] };
  const items = ESSAY_RUBRIC.map((c) => {
    const got = criteria.find((x) => x.key === c.key)?.score ?? 0;
    return { key: c.key as string, label: c.label as string, max: c.max as number, score: Math.max(0, Math.min(c.max, Math.round(got * 2) / 2)) };
  });
  return { total: items.reduce((s, c) => s + c.score, 0), criteria: items };
}
