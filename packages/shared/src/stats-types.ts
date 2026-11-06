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
  attention: { userId: string; name: string; group: string | null; reasons: string[] }[];
  /** Shu oyning eng yaxshilari (kamida 2 ta test) */
  top: { userId: string; name: string; group: string | null; avgPercent: number; tests: number }[];
  /** Oxirgi 8 hafta faolligi (eskidan yangiga) */
  weeks: { start: string; lessons: number; tests: number; essays: number }[];
  /** Faqat egaga (yordamchiga null): oxirgi 6 oy daromadi, so'm */
  income: { months: { month: string; online: number; offline: number }[]; offlineDebtors: number } | null;
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

/**
 * Guruh jadvali matnidan dars kunlari va vaqtini ajratadi: "Du/Chor/Ju 14:00", "Se, Pay, Sha 16:30", "Har kuni 9:00".
 * Kunlar tushunilmasa days = null (ya'ni har kuni dars bo'lishi mumkin deb hisoblanadi).
 */
export function parseSchedule(schedule: string | null | undefined): { days: number[] | null; minutes: number | null } {
  if (!schedule) return { days: null, minutes: null };
  const t = /(\d{1,2})[:.](\d{2})/.exec(schedule);
  const minutes = t ? Number(t[1]) * 60 + Number(t[2]) : null;
  const text = schedule.toLowerCase().replace(/[ʻ'`’]/g, "");
  if (/har\s*kun/.test(text)) return { days: [0, 1, 2, 3, 4, 5, 6], minutes };
  const days = new Set<number>();
  for (const w of text.split(/[^a-z]+/).filter(Boolean)) {
    const hit = DAY_PREFIX.find(([p]) => w.startsWith(p));
    if (hit) days.add(hit[1]);
  }
  return { days: days.size ? [...days].sort() : null, minutes };
}

/** "4-noyabr, chorshanba" */
export function dayLabel(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  const months = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
  return `${d.getUTCDate()}-${months[d.getUTCMonth()]}, ${WEEKDAY_NAMES[d.getUTCDay()]}`;
}
