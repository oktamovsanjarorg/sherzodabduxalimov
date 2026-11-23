import { ONA_TILI_MILLIY_CELLS, ONA_TILI_MILLIY_SECTIONS, sectionScore } from "./external-milliy";
import { splitCsv, type ExternalRowInput, type ExternalSection } from "./external-types";

/**
 * Skaner (OMR) eksporti: "Экзамен, …, Имя, Общая оценка, …, Sertifikat -1-32, …, Q 1 Options, Q 1 Key, Q 1 Marks, …".
 * Har savol uchun Marks: 1 to'g'ri, 0 xato; Options bo'sh bo'lsa javob berilmagan.
 * "Sertifikat -a-b" ustunlari savol turlari bo'yicha bo'limlar (yozma savollar ikki qismli bo'lsa
 * oxirgisi fayldagi yig'indi bilan tekshirilib oxirgi katakkacha cho'ziladi). Ona tili formati (49 katak)
 * bo'lsa ular o'rniga sertifikatdagi mazmun bo'limlari olinadi (ONA_TILI_MILLIY_SECTIONS).
 */
export interface OmrParsed {
  /** "Экзамен" ustuni (masalan Mock22) */
  exam: string | null;
  questionCount: number;
  sections: ExternalSection[];
  /** Sertifikat bo'limlari bor: Milliy sertifikat shkalasida baholanadi */
  milliy: boolean;
  rows: ExternalRowInput[];
}

const MARKS = /^Q\s*(\d+)\s*Marks$/i;
const SECTION = /^Sertifikat\s*-\s*(\d+)\s*-\s*(\d+)$/i;

export function isOmrExport(text: string): boolean {
  const head = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  return /(^|[,;\t])\s*Q\s*1\s*Marks\s*([,;\t]|$)/i.test(head);
}

export function parseOmrExport(text: string, takenAt: string | null): OmrParsed {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) throw new Error("Faylda natija yo'q");
  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const head = splitCsv(lines[0], sep).map((h) => h.trim());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));

  const marks = head
    .map((h, i) => [Number(MARKS.exec(h)?.[1]), i] as const)
    .filter(([q]) => q > 0)
    .sort((a, b) => a[0] - b[0]);
  if (!marks.length) throw new Error("Q 1 Marks ustunlari topilmadi");
  const N = marks.length;
  const options = new Map(head.map((h, i) => [h.toLowerCase().replace(/\s+/g, " "), i]));
  const optCol = marks.map(([q]) => options.get(`q ${q} options`) ?? -1);
  const nameCol = col(/^(имя|ism|name|f\.?i\.?sh|фио)$/i);
  const examCol = col(/^(экзамен|exam)$/i);
  const secCols = head.map((h, i) => [SECTION.exec(h), i] as const).filter(([m]) => m) as [RegExpExecArray, number][];

  const cells = lines.slice(1).map((l) => splitCsv(l, sep));
  const answersOf = (c: string[]) => marks.map(([, i], k) => (Number(c[i]?.trim()) > 0 ? "c" : optCol[k] >= 0 && !c[optCol[k]]?.trim() ? "b" : "w")).join("");
  const all = cells.map((c) => ({ c, answers: answersOf(c) }));

  // Bo'limlar: oraliqni fayldagi yig'indi bilan tasdiqlaymiz, mos kelmasa oxirgisini cho'zamiz
  const correctIn = (a: string, from: number, to: number) => [...a.slice(from - 1, to)].filter((x) => x === "c").length;
  const typeSections: ExternalSection[] = secCols.map(([m, i], k) => {
    const from = Number(m[1]);
    const to = Number(m[2]);
    const fits = (t: number) => all.every(({ c, answers }) => !c[i]?.trim() || Number(c[i]) === correctIn(answers, from, t));
    const toQ = !fits(to) && k === secCols.length - 1 && fits(N) ? N : to;
    return { title: `${from}–${to}`, fromQ: from, toQ: Math.min(toQ, N) };
  });
  // Ona tili Milliy sertifikati: sertifikatdagi mazmun bo'limlari (skaner ustunlari faqat savol turlari)
  const sections = typeSections.length && N === ONA_TILI_MILLIY_CELLS ? ONA_TILI_MILLIY_SECTIONS : typeSections;

  const seen = new Map<string, number>();
  const rows: ExternalRowInput[] = all.map(({ c, answers }) => {
    const name = (c[nameCol >= 0 ? nameCol : 0] ?? "").trim() || "Noma'lum";
    const correct = [...answers].filter((x) => x === "c").length;
    const blank = [...answers].filter((x) => x === "b").length;
    const base = `name:${name.toLowerCase()}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return {
      key: n > 1 ? `${base}#${n}` : base,
      telegramId: null,
      name,
      username: null,
      correct,
      wrong: N - correct - blank,
      blank,
      score: correct,
      maxScore: N,
      percent: Math.round((correct / N) * 1000) / 10,
      scaledScore: null,
      grade: null,
      testScore: null,
      sections: sections.map((s) => sectionScore(s, answers)),
      answers,
      submittedAt: takenAt,
      durationSec: null,
    };
  });
  const exam = examCol >= 0 ? (cells.find((c) => c[examCol]?.trim())?.[examCol].trim() ?? null) : null;
  return { exam, questionCount: N, sections, milliy: sections.length > 0, rows };
}
