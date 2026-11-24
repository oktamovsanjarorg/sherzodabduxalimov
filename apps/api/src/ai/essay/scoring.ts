import { ESSAY_RUBRIC, RUBRIC_STEPS } from "@onatili/shared";
import { type Analysis, type LiteracyError, PUNCT_RULES } from "./schemas";
import { norm, quoteFound, type Segmented } from "./text";

/** Mezondagi "N o'rinda" bandlari: 0 → 2; 1–2 → 1,5; 3–4 → 1; 5–6 → 0,5; 7+ → 0 */
export const countScore = (n: number) => (n <= 0 ? 2 : n <= 2 ? 1.5 : n <= 4 ? 1 : n <= 6 ? 0.5 : 0);

export interface Candidate {
  kind: "literacy" | "style" | "purity";
  s: string | null;
  type: string;
  wrong: string;
  right: string;
  note: string | null;
  rule?: string | null;
}

/** AI topgan, lekin matnda yo'q (to'qib chiqarilgan) iqtiboslarni va o'qilmagan [?] so'zlarni olib tashlaydi */
export function verifiedQuotes(a: Analysis, lit: LiteracyError[], seg: Segmented) {
  const ok = (q: string | null | undefined, s?: string | null) => !!q && !q.includes("[?]") && quoteFound(q, seg, s);
  const errors = lit.filter((e) => ok(e.wrong, e.s) && norm(e.wrong) !== norm(e.right));
  const styleIssues = a.styleIssues.filter((x) => ok(x.quote, x.s));
  const purity = a.purity.filter((x) => ok(x.quote, x.s));
  const repetitions = a.repetitions.filter((x) => ok(x.quote));
  const good = a.lexicon.good.filter((q) => ok(q));
  return { errors, styleIssues, purity, repetitions, good };
}

export const uniqBy = <T>(xs: T[], key: (x: T) => string) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Rasmiy talablar bo'yicha xatolar soni:
 * - imlo: bir so'zdagi xato bir necha joyda takrorlansa — bitta;
 * - punktuatsiya: bitta qoida bo'yicha takrorlangan xatolar — bitta, turli qoidalar — alohida;
 * - qo'shimcha va so'z qo'llash: bir xil xato juftligi — bitta.
 */
export function countErrors(errors: LiteracyError[]) {
  const of = (t: LiteracyError["type"]) => errors.filter((e) => e.type === t);
  const spelling = uniqBy(of("spelling"), (e) => norm(e.wrong)).length;
  const punct = of("punctuation");
  const known = new Set(punct.map((e) => e.rule ?? "boshqa").filter((r) => r !== "boshqa" && r in PUNCT_RULES));
  const other = uniqBy(
    punct.filter((e) => !known.has(e.rule ?? "boshqa")),
    (e) => norm(e.wrong),
  ).length;
  const affixes = uniqBy(of("affix"), (e) => `${norm(e.wrong)}|${norm(e.right)}`).length;
  const wordUsage = uniqBy(of("word"), (e) => `${norm(e.wrong)}|${norm(e.right)}`).length;
  return { spelling, punctuation: known.size + other, affixes, wordUsage };
}

type Lvl = "full" | "shallow" | "missing";
/** Kirish, asosiy qism, xulosa: 3 to'la → 2; 2 to'la → 1,5; 1 to'la + 2 yuza → 1; 1 to'la → 0,5; faqat yuza → 0,5/0 */
export function partsScore(intro: Lvl, body: Lvl, conclusion: Lvl) {
  const ls = [intro, body, conclusion];
  const full = ls.filter((l) => l === "full").length;
  const shallow = ls.filter((l) => l === "shallow").length;
  if (full === 3) return 2;
  if (full === 2) return 1.5;
  if (full === 1) return shallow === 2 ? 1 : 0.5;
  return shallow >= 2 ? 0.5 : 0;
}

type Cov = "full" | "partial" | "none";
/** Ikki qarash + shaxsiy fikr to'la → 2; ikki qarash to'la, shaxsiy fikr yo'q → 1,5; bittasi to'la → 1; qisman → 0,5; yo'q → 0 */
export function viewsScore(pro: Cov, con: Cov, personal: Cov) {
  const full = [pro, con].filter((c) => c === "full").length;
  if (full === 2) return personal === "full" ? 2 : 1.5;
  if (full === 1) return 1;
  return pro === "partial" || con === "partial" ? 0.5 : 0;
}

type Fit = "fit" | "partlyUnfit" | "unfit" | "none";
/** Har ikki qarash dalillangan → 2; bittasi → 1,5; ayrim dalillar mos emas → 1; dalillar mos emas → 0,5; dalil yo'q → 0 */
export function evidenceScore(pro: Fit, con: Fit) {
  const f = [pro, con];
  if (f.every((x) => x === "fit")) return 2;
  if (f.every((x) => x === "none")) return 0;
  if (f.includes("fit") && f.includes("none")) return 1.5;
  if (f.every((x) => x === "unfit" || x === "none")) return 0.5;
  return 1;
}

/**
 * Uslub: publitsistik bo'lmagan gaplar ulushi bo'yicha (rasmiy talab):
 * yo'q → 2; uchdan birigacha → 1,5; uchdan ikkigacha → 1; undan ko'p: badiiy/rasmiy → 0,5, so'zlashuv → 0.
 */
export function styleScore(flagged: { s?: string | null; register: string }[], sentenceCount: number) {
  const ids = new Set(flagged.map((x, i) => x.s ?? `?${i}`));
  if (!ids.size) return 2;
  const share = ids.size / Math.max(1, sentenceCount);
  if (share <= 1 / 3) return 1.5;
  if (share <= 2 / 3) return 1;
  const colloquial = flagged.filter((x) => x.register === "colloquial").length;
  return colloquial > flagged.length / 2 ? 0 : 0.5;
}

/** Leksika: AI darajasi, lekin server cheklovlari bilan (qalashtirilgan iboralar → ko'pi bilan 1; birorta ham yo'q → 0) */
export function lexiconScore(lex: Analysis["lexicon"], goodVerified: number) {
  let s = RUBRIC_STEPS.reduce((best, x) => (Math.abs(x - lex.level) < Math.abs(best - lex.level) ? x : best), 1 as number);
  if (lex.overloadedParagraphs.length) s = Math.min(s, 1);
  if (!goodVerified) s = lex.misused.length ? Math.min(s, 0.5) : 0;
  return s;
}

export interface Scored {
  scores: Record<string, number>;
  /** Har band uchun server hisoblagan aniq dalil (izoh shu asosda yoziladi) */
  facts: Record<string, string>;
}

export function scoreAll(a: Analysis, v: ReturnType<typeof verifiedQuotes>, seg: Segmented, handwritten: boolean): Scored {
  const counts = countErrors(v.errors);
  // Xatboshilarga umuman ajratilmagan (yozilgan matnda aniq ko'rinadi; qo'lyozmada AI varoqqa qarab aytadi)
  const notSplit = seg.paragraphs.length < 2 && (!handwritten || !a.paragraphsSplit);
  const structureN = uniqBy(a.structureIssues, (x) => norm(x.issue)).length;
  const repetitionsN = uniqBy(v.repetitions, (x) => norm(x.quote)).length;
  const purityN = uniqBy(v.purity, (x) => norm(x.quote)).length;
  const styleIds = new Set(v.styleIssues.map((x) => x.s).filter(Boolean)).size;
  // Kirish vaziyatdan ko'chirilgan yoki tezissiz bo'lsa "to'la" emas
  const intro: Lvl = a.intro.level === "full" && (a.intro.copiedFromPrompt || !a.intro.thesis) ? "shallow" : a.intro.level;
  // Xulosa faqat takror bo'lsa yoki jamiyatga ta'siri yoritilmasa — yuza (yo'riqnomaning maxsus talabi)
  const conclusion: Lvl = a.conclusion.level === "full" && (a.conclusion.repeatsOnly || !a.conclusion.societyImpact) ? "shallow" : a.conclusion.level;
  // Shaxsiy fikr: qat'iy pozitsiya va yechim bo'lmasa — to'la emas
  const personal: Cov = a.personal.coverage === "full" && !(a.personal.stance && a.personal.solution) ? "partial" : a.personal.coverage;
  // Dalilsiz yoki tahlilsiz qarash "to'la yoritilgan" emas
  const cov = (x: Analysis["pro"]): Cov => (x.coverage === "full" && (!x.evidence || x.evidenceFit === "none") ? "partial" : x.coverage);
  const lvl = { full: "to'la", shallow: "yuza", missing: "yo'q" } as const;
  const cv = { full: "to'la", partial: "qisman", none: "yoritilmagan" } as const;
  const ft = { fit: "mos dalil bor", partlyUnfit: "dalillarning bir qismi mos emas", unfit: "dalil mos emas", none: "dalil yo'q" } as const;

  const scores: Record<string, number> = {
    style: styleScore(v.styleIssues, seg.sentences.length),
    views: viewsScore(cov(a.pro), cov(a.con), personal),
    evidence: evidenceScore(a.pro.evidenceFit, a.con.evidenceFit),
    parts: partsScore(intro, a.body.level, conclusion),
    structure: notSplit ? 0 : countScore(structureN),
    coherence: countScore(repetitionsN),
    spelling: countScore(counts.spelling),
    punctuation: countScore(counts.punctuation),
    affixes: countScore(counts.affixes),
    wordUsage: countScore(counts.wordUsage),
    lexicon: lexiconScore(a.lexicon, v.good.length),
    purity: countScore(purityN),
  };
  const facts: Record<string, string> = {
    style: styleIds ? `${seg.sentences.length} ta gapdan ${styleIds} tasida publitsistik uslubdan chekinish` : "publitsistik uslubdan chekinish topilmadi",
    views: `yoqlovchi qarash: ${cv[cov(a.pro)]}; qarshi qarash: ${cv[cov(a.con)]}; shaxsiy fikr: ${cv[personal]}`,
    evidence: `yoqlovchi qarash: ${ft[a.pro.evidenceFit]}; qarshi qarash: ${ft[a.con.evidenceFit]}`,
    parts: `kirish: ${lvl[intro]}; asosiy qism: ${lvl[a.body.level]}; xulosa: ${lvl[conclusion]}`,
    structure: notSplit ? "matn xatboshilarga ajratilmagan" : `mantiqiy qurilish xatosi ${structureN} o'rinda`,
    coherence: `fikr takrori ${repetitionsN} o'rinda`,
    spelling: `imlo xatosi ${counts.spelling} o'rinda`,
    punctuation: `punktuatsion xato ${counts.punctuation} o'rinda (bir qoida bo'yicha takror — bitta)`,
    affixes: `qo'shimcha qo'llash xatosi ${counts.affixes} o'rinda`,
    wordUsage: `so'z qo'llash xatosi ${counts.wordUsage} o'rinda`,
    lexicon: `o'rinli ibora va barqaror birikmalar: ${v.good.length} ta${a.lexicon.overloadedParagraphs.length ? `; iboralar qalashtirilgan xatboshi: ${a.lexicon.overloadedParagraphs.join(", ")}` : ""}${a.lexicon.misused.length ? `; noo'rin: ${a.lexicon.misused.length} ta` : ""}`,
    purity: `sheva, vulgarizm, varvarizm yoki parazit so'z ${purityN} o'rinda`,
  };
  return { scores, facts };
}

/** Rubrikadagi shu ballga mos tavsif */
export function levelText(key: string, score: number) {
  const c = ESSAY_RUBRIC.find((x) => x.key === key);
  const i = RUBRIC_STEPS.findIndex((s) => s === score);
  return c && i >= 0 ? c.levels[i] : "";
}
