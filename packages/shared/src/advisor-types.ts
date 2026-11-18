/**
 * Ustoz yordamchisi: bazadagi faktlardan chiqarilgan tavsiyalar. Har tavsiyada «nega» (aniq raqam)
 * va «nima qilish» (sahifaga havola) bor: umumiy maslahat emas, aniq ish.
 */
export type AdviceLevel = "urgent" | "important" | "idea";
export type AdviceArea = "content" | "learning" | "attendance" | "essays" | "payments" | "parents" | "activity";

export const ADVICE_AREA_LABELS: Record<AdviceArea, string> = {
  content: "Kontent",
  learning: "O'zlashtirish",
  attendance: "Davomat",
  essays: "Esse",
  payments: "To'lov",
  parents: "Ota-onalar",
  activity: "Faollik",
};

export interface Advice {
  /** Barqaror kalit: yashirish shu bo'yicha (son oshsa qaytadi) */
  key: string;
  level: AdviceLevel;
  area: AdviceArea;
  title: string;
  /** Faktlar: nimaga asoslangan */
  why: string;
  /** Yashirish uchun son (o'quvchilar, esselar...) */
  count: number;
  action?: { label: string; to: string };
}

export interface PlatformAdvice {
  generatedAt: string;
  /** Qisqa ko'rsatkichlar: AI va ekran uchun */
  pulse: { label: string; value: string; hint?: string }[];
  advice: Advice[];
}

export interface StudentAdvice {
  generatedAt: string;
  /** Kuchli va zaif tomonlar: bo'lim/mavzu/mezon bo'yicha foiz */
  strengths: { label: string; percent: number; source: string }[];
  weaknesses: { label: string; percent: number; source: string }[];
  advice: Advice[];
  /** Keyingi qadamlar: aniq dars/test */
  next: { label: string; to?: string }[];
}

export const ADVICE_LEVEL_ORDER: Record<AdviceLevel, number> = { urgent: 0, important: 1, idea: 2 };
export const sortAdvice = (a: Advice[]) => [...a].sort((x, y) => ADVICE_LEVEL_ORDER[x.level] - ADVICE_LEVEL_ORDER[y.level]);
