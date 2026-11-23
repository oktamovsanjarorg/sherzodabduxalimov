// ===================== Offline test natijalari =====================

export type ExternalSourceName = "CSV";

export interface ExternalSection {
  title: string | null;
  fromQ: number;
  toQ: number;
  /** Bo'lim savollari ketma-ket bo'lmasa (masalan 1–12 va 33–35): oraliq o'rniga shular */
  questions?: number[];
}

/** Bo'limdagi savol raqamlari (1 dan) */
export const sectionQuestions = (s: ExternalSection) => s.questions ?? Array.from({ length: s.toQ - s.fromQ + 1 }, (_, i) => s.fromQ + i);

/** Milliy sertifikat: Rasch tahlili (har savol qiyinligi va og'irligi) */
export interface ExternalRasch {
  /** Savol qiyinliklari shu natijalardan hisoblandimi (kamida RASCH_MIN_SAMPLE qatnashchi) */
  calibrated: boolean;
  n: number;
  /** q: savol, b: qiyinlik (logit, o'rtachasi 0; katta = qiyin), w: ball og'irligi, correctPct: to'g'ri yechganlar % */
  items: { q: number; b: number; w: number; correctPct: number }[];
}
export interface ExternalSectionScore extends ExternalSection {
  correct: number;
  wrong: number;
  blank: number;
  raw: number;
  max: number;
  percent: number;
  /** Milliy sertifikat: test balidan shu bo'limga to'g'ri keladigan qism (bo'limlar yig'indisi = test bali) */
  points?: number | null;
}

/** Import qilinadigan bitta natija (CSV dan) */
export interface ExternalRowInput {
  key: string;
  telegramId: string | null;
  name: string;
  username: string | null;
  correct: number;
  wrong: number;
  blank: number;
  score: number;
  maxScore: number;
  percent: number;
  scaledScore: number | null;
  grade: string | null;
  /** Milliy sertifikat: test qismi T-ball (0..75) */
  testScore: number | null;
  sections: ExternalSectionScore[];
  /** Har savol bitta harf: c to'g'ri, w xato, b bo'sh, v bekor, p qisman, - yo'q */
  answers: string;
  submittedAt: string | null;
  durationSec: number | null;
}

export interface ExternalTestInput {
  source: ExternalSourceName;
  code: string;
  title: string;
  subject: string | null;
  questionCount: number;
  sections: ExternalSection[];
  rasch: ExternalRasch | null;
  rows: ExternalRowInput[];
}

/** Import oldidan ko'rinish: kim topildi, kim yo'q */
export interface ExternalPreview {
  test: Omit<ExternalTestInput, "rows"> & { participants: number; alreadyImported: boolean };
  rows: {
    key: string;
    name: string;
    username: string | null;
    percent: number;
    scaledScore: number | null;
    grade: string | null;
    match: { studentId: string; name: string; how: "username" | "name" } | null;
  }[];
}

export interface ExternalTestSummary {
  id: string;
  source: ExternalSourceName;
  code: string;
  title: string;
  subject: string | null;
  questionCount: number;
  participants: number;
  matched: number;
  avgPercent: number | null;
  takenAt: string | null;
  importedAt: string;
  notifiedAt: string | null;
}

export interface ExternalTestDetail extends ExternalTestSummary {
  sections: ExternalSection[];
  rasch: ExternalRasch | null;
  stats: {
    median: number | null;
    /** 0–9, 10–19, ... 90–100 foiz */
    buckets: { label: string; count: number }[];
    /** Har savol: to'g'ri javob ulushi (0..100), eng qiyini birinchi emas — tartib 1..N */
    questions: { q: number; correctPct: number; blankPct: number }[];
    sections: { title: string | null; fromQ: number; toQ: number; avgPercent: number }[];
  };
  rows: {
    id: string;
    rank: number;
    name: string;
    username: string | null;
    student: { id: string; name: string } | null;
    manualMatch: boolean;
    correct: number;
    wrong: number;
    blank: number;
    score: number;
    maxScore: number;
    percent: number;
    scaledScore: number | null;
    grade: string | null;
    testScore: number | null;
    essayScore: number | null;
    sectionScores: ExternalSectionScore[];
    answers: string;
    submittedAt: string | null;
    notifiedAt: string | null;
  }[];
}

/** Bir nechta tashqi test bo'yicha reyting */
export interface ExternalRankingRow {
  studentId: string;
  name: string;
  groupName: string | null;
  tests: number;
  avgPercent: number;
  best: number;
  last: number;
}

/** O'quvchi va ota-ona ilovasida: faqat natijasi ochiq testlar */
export interface MyExternalResult {
  id: string;
  title: string;
  subject: string | null;
  takenAt: string | null;
  correct: number;
  questionCount: number;
  score: number;
  maxScore: number;
  percent: number;
  scaledScore: number | null;
  grade: string | null;
  rank: number;
  participants: number;
}
export interface MyExternalResultDetail extends MyExternalResult {
  testScore: number | null;
  /** Yozma ish 24 ballik mezon bo'yicha (kiritilmagan bo'lsa null) */
  essayScore: number | null;
  /** Milliy sertifikat: har savoldan olingan ball (test bali taqsimoti) va bo'lim nomi */
  questions: { points: number; section: string | null }[] | null;
  wrong: number;
  blank: number;
  sections: ExternalSectionScore[];
  answers: string;
  avgPercent: number;
}

/**
 * Test matrix.csv: "Ism;Username;Q1..Qn;Jami" (ajratgich ";", BOM bo'lishi mumkin).
 * Kataklar: 1 to'g'ri, 0 xato yoki bo'sh, bo'sh katak: savol yo'q.
 */
export function parseTestMatrix(text: string): { questionCount: number; rows: ExternalRowInput[] } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) throw new Error("Faylda natija yo'q");
  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const head = splitCsv(lines[0], sep);
  const qCols = head.map((h, i) => [h.trim(), i] as const).filter(([h]) => /^Q\d+$/i.test(h));
  if (!qCols.length) throw new Error("Bu test matritsa fayli emas: Q1, Q2 ... ustunlari topilmadi");
  const nameCol = head.findIndex((h) => /ism|name/i.test(h));
  const userCol = head.findIndex((h) => /username/i.test(h));
  const seen = new Map<string, number>();
  const rows = lines.slice(1).map((line) => {
    const c = splitCsv(line, sep);
    const name = (c[nameCol >= 0 ? nameCol : 0] ?? "").replace(/^'/, "").trim() || "Noma'lum";
    const username = (userCol >= 0 ? c[userCol] : "")?.replace(/^'?@?/, "").trim() || null;
    const answers = qCols.map(([, i]) => (c[i]?.trim() === "1" ? "c" : c[i]?.trim() === "0" ? "w" : "-")).join("");
    const correct = [...answers].filter((x) => x === "c").length;
    const wrong = [...answers].filter((x) => x === "w").length;
    // Bir xil ismli ikki o'quvchi bo'lsa kalit takrorlanmasin
    const base = `name:${(username ?? name).toLowerCase()}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return {
      key: n > 1 ? `${base}#${n}` : base,
      telegramId: null,
      name,
      username,
      correct,
      wrong,
      blank: qCols.length - correct - wrong,
      score: correct,
      maxScore: qCols.length,
      percent: Math.round((correct / qCols.length) * 1000) / 10,
      scaledScore: null,
      grade: null,
      testScore: null,
      sections: [],
      answers,
      submittedAt: null,
      durationSec: null,
    };
  });
  return { questionCount: qCols.length, rows };
}

export function splitCsv(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
