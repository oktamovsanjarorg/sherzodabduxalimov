// Ustoz statistikasi va dars jadvali

/** Oy bo'yicha statistika: GET /admin/stats?month=2026-11 */
export interface TeacherStats {
  month: string; // "2026-11"
  students: {
    total: number;
    online: number;
    offline: number;
    /** Shu oyda qo'shilganlar */
    newThisMonth: number;
    /** Shu oyda dars ko'rgan, test ishlagan yoki esse yuborganlar */
    active: number;
  };
  attendance: {
    /** Kelgan + kechikkan / belgilangan, foiz. Davomat olinmagan bo'lsa null */
    rate: number | null;
    lessons: number; // davomat olingan dars kunlari (guruhlar bo'yicha yig'indi)
    present: number;
    late: number;
    absent: number;
    excused: number;
    byGroup: { groupId: string; name: string; lessons: number; rate: number | null; absent: number; students: number }[];
  };
  tests: {
    /** Shu oyda yakunlangan urinishlar */
    attempts: number;
    avgPercent: number | null;
    /** Eng ko'p xato qilinayotgan mavzular (kamida 5 ta javob), past natijadan yuqoriga */
    weakTopics: { topicId: string; title: string; correctPercent: number; answers: number }[];
  };
  mocks: {
    attempts: number;
    /** Milliy sertifikat: umumiy ball (0..75) o'rtachasi */
    avgTotal: number | null;
    /** Darajalar bo'yicha: A+, A, B+, B, C+, C, "—" (46 dan kam) */
    levels: { code: string; count: number }[];
  };
  essays: { submitted: number; checkedByTeacher: number; checkedByAi: number; avgScore: number | null; waiting: number };
  /** E'tibor kerak bo'lgan o'quvchilar (eng muhimlari birinchi) */
  attention: {
    userId: string;
    /** O'quvchi sahifasi /students/:studentId */ studentId: string | null;
    name: string;
    group: string | null;
    reasons: string[];
  }[];
  /** Shu oyning eng yaxshilari (kamida 2 ta test) */
  top: { userId: string; studentId: string | null; name: string; group: string | null; avgPercent: number; tests: number }[];
  /** Oxirgi 8 hafta faolligi (eskidan yangiga) */
  weeks: { start: string; lessons: number; tests: number; essays: number }[];
  /** Faqat egaga (yordamchiga null): oxirgi 6 oy daromadi, so'm */
  income: { months: { month: string; online: number; offline: number; essays: number }[]; offlineDebtors: number; feeMissing: number } | null;
}

const DAY_PREFIX: [string, number][] = [
  ["yak", 0],
  ["du", 1],
  ["se", 2],
  ["ch", 3],
  ["pa", 4],
  ["ju", 5],
  ["sh", 6],
];
export const WEEKDAY_NAMES = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

const CYRILLIC: Record<string, string> = Object.fromEntries(
  "а:a б:b в:v г:g ғ:g д:d е:e ё:yo ж:j з:z и:i й:y к:k қ:q л:l м:m н:n о:o п:p р:r с:s т:t у:u ў:o ф:f х:x ҳ:h ч:ch ш:sh ъ: ь: э:e ю:yu я:ya"
    .split(" ")
    .map((x) => x.split(":") as [string, string]),
);
const toLatin = (s: string) => s.replace(/[\u0400-\u04ff]/g, (c) => CYRILLIC[c] ?? c);

const ODD_DAYS = [1, 3, 5];
const EVEN_DAYS = [2, 4, 6];

/** "Du-Sha", "Dushanbadan jumagacha": hafta oralig'i bo'lsa kunlari, oddiy ro'yxat bo'lsa null */
function rangeDays(text: string, found: number[]): number[] | null {
  if (found.length !== 2) return null;
  const [from, to] = found;
  const spoken = /[a-z]dan\b.*[a-z]gacha\b/.test(text);
  // "Se-Pay" odatda ikki alohida kun. Tire faqat dushanbadan juma/shanba/yakshanbagacha bo'lsa oraliq deb olinadi
  const dashed = from === 1 && [5, 6, 0].includes(to) && /[a-z]\s*[-–—]\s*[a-z]/.test(text);
  if (!spoken && !dashed) return null;
  const length = ((to - from + 7) % 7) + 1;
  return Array.from({ length }, (_, i) => (from + i) % 7);
}

/**
 * Guruh jadvali matnidan dars kunlari va vaqtini ajratadi: "Du/Chor/Ju 14:00", "Se, Pay, Sha 16:30", "Har kuni 9:00",
 * "Toq kunlar" (du-chor-ju), "Juft kunlar" (se-pay-sha), "Du-Shan 9:00", kirillcha yozuv ham.
 * Kunlar tushunilmasa days = null (ya'ni har kuni dars bo'lishi mumkin deb hisoblanadi).
 */
export function parseSchedule(schedule: string | null | undefined): { days: number[] | null; minutes: number | null } {
  if (!schedule) return { days: null, minutes: null };
  const t = /(\d{1,2})[:.](\d{2})/.exec(schedule);
  const minutes = t ? Number(t[1]) * 60 + Number(t[2]) : null;
  const text = toLatin(schedule.toLowerCase()).replace(/[ʻʼ'`’‘]/g, "");
  if (/har\s*kun/.test(text)) return { days: [0, 1, 2, 3, 4, 5, 6], minutes };
  const found: number[] = [];
  const days = new Set<number>();
  for (const w of text.split(/[^a-z]+/).filter(Boolean)) {
    // "juft" — "ju" (juma) bilan boshlanadi, shuning uchun kun nomlaridan oldin tekshiriladi
    if (w.startsWith("juft")) EVEN_DAYS.forEach((d) => days.add(d));
    else if (w.startsWith("toq")) ODD_DAYS.forEach((d) => days.add(d));
    else {
      const hit = DAY_PREFIX.find(([p]) => w.startsWith(p));
      if (hit) found.push(hit[1]);
    }
  }
  (rangeDays(text, found) ?? found).forEach((d) => days.add(d));
  return { days: days.size ? [...days].sort() : null, minutes };
}

/** "4-noyabr, chorshanba" */
export function dayLabel(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  const months = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
  return `${d.getUTCDate()}-${months[d.getUTCMonth()]}, ${WEEKDAY_NAMES[d.getUTCDay()]}`;
}

// ---------------- To'lovlar tahlili (faqat ega) ----------------

export type FollowUpKindName = "CALL" | "MESSAGE" | "PROMISE" | "REASON" | "BOT";
export const FOLLOW_UP_LABELS: Record<FollowUpKindName, string> = {
  CALL: "Qo'ng'iroq qilindi",
  MESSAGE: "Yozildi",
  PROMISE: "To'lashga va'da berdi",
  REASON: "Sababi",
  BOT: "Bot eslatdi",
};

export interface FollowUpView {
  id: string;
  kind: FollowUpKindName;
  note: string | null;
  promisedAt: string | null;
  by: string | null;
  createdAt: string;
}

/** To'lamagan o'quvchi: kim, qancha, qachondan beri, kim bilan gaplashildi */
export interface DebtorRow {
  studentId: string;
  userId: string;
  name: string;
  phone: string | null;
  kind: "OFFLINE" | "ONLINE";
  /** Offline: guruh nomi; online: tarif nomi */
  where: string | null;
  amountUzs: number;
  /** Offline: ketma-ket necha oy to'lamagan (shu oy bilan); online: obuna tugaganiga necha kun */
  overdue: { months?: number; days?: number };
  /** Offline: shu oy darsga necha marta kelgan (keladi-yu to'lamayaptimi?) */
  attended: number | null;
  /** Online: oxirgi marta ilovada nimadir qilganiga necha kun */
  idleDays: number | null;
  parent: { name: string; phone: string | null } | null;
  /** Kutilayotgan chek (o'quvchi yuborgan, siz hali tasdiqlamagansiz) */
  pendingReceipt: boolean;
  followUps: FollowUpView[];
}

export interface PaymentInsights {
  month: string;
  /** Oyning nechanchi kuni (joriy oy bo'lsa), aks holda oyning oxirgi kuni */
  day: number;
  daysInMonth: number;
  offline: {
    groups: { groupId: string; name: string; feeUzs: number | null; students: number; paid: number; expectedUzs: number; collectedUzs: number }[];
    students: number;
    paid: number;
    expectedUzs: number;
    collectedUzs: number;
    /** Guruhlarning oylik summasi kiritilmagan bo'lsa, kutilgan summani hisoblab bo'lmaydi */
    feeMissing: number;
    /** Summa yozilmay "to'ladi" deb belgilanganlar (eski yozuvlar): summasini tuzatish kerak */
    paidNoAmount: number;
  };
  /** Esse tekshiruvi uchun to'lovlar (rejalashtirilmaydi, faqat tushum) */
  essays: { count: number; collectedUzs: number };
  online: {
    /** Shu oyda obunasi tugaydigan/tugagan o'quvchilar */
    due: number;
    renewed: number;
    /** Tugagan va uzaytirilmagan */
    lapsed: number;
    expectedUzs: number;
    collectedUzs: number;
    pendingReceipts: number;
    pendingUzs: number;
  };
  /** collectedUzs = offline + online obuna + esse. percent: faqat rejadagi qism (offline + obuna) bo'yicha */
  total: { expectedUzs: number; collectedUzs: number; plannedCollectedUzs: number; percent: number | null; complete: boolean };
  /** Oy oxirigacha prognoz: hozirgi tushum + kutilayotgan cheklar + qolgan qarzning odatdagi undirilish ulushi */
  forecast: { endOfMonthUzs: number; basis: string; nextMonthExpectedUzs: number };
  /** Oxirgi 3 oy: kutilgan va tushgan (offline guruhlar bo'yicha) */
  history: { month: string; expectedUzs: number; collectedUzs: number }[];
  debtors: DebtorRow[];
}
