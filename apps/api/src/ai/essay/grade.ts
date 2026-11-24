import { ESSAY_RUBRIC } from "@onatili/shared";
import type { z } from "zod";
import type { AskModel } from "../ask";
import { type AiEssayResult, normalize } from "../deepseek";
import { buildMistakes } from "./mistakes";
import { analysisPrompt, literacyPrompt, verifyPrompt, writerPrompt } from "./prompts";
import { type Analysis, analysisSchema, literacySchema, verifySchema, writerSchema } from "./schemas";
import { type Candidate, type Scored, scoreAll, verifiedQuotes } from "./scoring";
import { copiedShare, norm, scrub, type Segmented, segment } from "./text";

type Verified = ReturnType<typeof verifiedQuotes>;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const EMPTY = { criteria: [], mistakes: [], tips: [] };

export interface GradeOpts {
  /** Tahlil va savodxonlik (A, B) */
  main: AskModel;
  /** Topilgan xatolarni qayta tekshirish va taqriz (C, D): boshqa provayder bo'lsa, bir xil xato ikki marta o'tmaydi */
  reviewer: AskModel;
  topic: string;
  text: string;
  handwritten?: boolean;
}

/** Ikkinchi ekspert rad etgan da'vo: ballga ta'sir qilmaydi, lekin tahlilda saqlanadi */
interface Disputed {
  kind: Candidate["kind"];
  type: string;
  wrong: string;
  right: string;
  reason: string | null;
}
interface Checked {
  v: Verified;
  disputed: Disputed[];
  candidates: number;
  /** ok — tekshirildi; failed — tekshiruvchi javob bermadi (da'volar tekshirilmay qoldi); none — tekshiradigan narsa yo'q */
  status: "ok" | "failed" | "none";
  error?: string;
}

/**
 * Esseni ko'p bosqichli chuqur tekshirish (bosqichlar: essay/index.ts).
 * Ballarni server hisoblaydi; AI faqat matndan iqtiboslar bilan dalil beradi va izoh yozadi.
 */
export async function gradeEssay(opts: GradeOpts): Promise<AiEssayResult> {
  const { main, reviewer } = opts;
  const source = `${opts.topic}\n${opts.text}`;
  const handwritten = !!opts.handwritten;
  const t0 = Date.now();
  const seg = segment(opts.text);

  // Vaziyat matni aynan ko'chirilgan: AI'ga yuborish shart emas, server aniq hisoblaydi
  const copied = copiedShare(opts.topic, opts.text);
  if (copied >= 0.5) {
    const feedback = `Esse matnining ${Math.round(copied * 100)}% qismi vaziyat matnidan aynan ko'chirilgan: mezon bo'yicha esse tekshirilmaydi.`;
    return { ...EMPTY, special: "COPIED", feedback, analysis: { copiedShare: copied } };
  }

  // A va B parallel: tuzilma/mazmun/uslub tahlili va gapma-gap savodxonlik
  const ap = analysisPrompt(opts.topic, seg, handwritten);
  const lp = literacyPrompt(seg, handwritten);
  const [rawA, rawLit] = await Promise.all([main.ask(ap.system, ap.user, analysisSchema), main.ask(lp.system, lp.user, literacySchema)]);
  const { value: a, dropped: foreignA } = scrub(rawA, source);
  const { value: lit, dropped: foreignB } = scrub(rawLit, source);
  const errors = lit.errors.filter((e) => e.right.trim());
  const t1 = Date.now();
  if (a.special) {
    const feedback = [a.intro.note, a.body.note, a.conclusion.note].filter(Boolean).join(" ");
    return { ...EMPTY, special: a.special, feedback, provider: main.provider, analysis: { model: main.model, analysis: a } };
  }

  // C: matnda yo'q iqtiboslar tashlanadi, qolganini ikkinchi ekspert qayta tekshiradi
  const v0 = verifiedQuotes(a, errors, seg);
  const check = await crossCheck(reviewer, v0, seg, source);
  const t2 = Date.now();

  const scored = scoreAll(a, check.v, seg, handwritten);
  const mistakes = buildMistakes(check.v, seg);
  // D: yakuniy ball va dalillar asosida izoh, taqriz, tavsiyalar
  const r = await writeReview({ ...opts, source }, seg, a, scored, mistakes, check.v);
  return {
    ...r,
    provider: [...new Set([main.provider, reviewer.provider])].join("+"),
    analysis: {
      model: main.model,
      effort: main.effort,
      verifier: { model: reviewer.model, effort: reviewer.effort, status: check.status, error: check.error },
      seconds: { analysis: (t1 - t0) / 1000, verify: (t2 - t1) / 1000, total: (Date.now() - t0) / 1000 },
      sentences: seg.sentences.length,
      paragraphs: seg.paragraphs.length,
      facts: scored.facts,
      rejectedByVerifier: check.disputed.length,
      disputed: check.disputed,
      foreignDropped: foreignA + foreignB,
      droppedQuotes: errors.length + a.styleIssues.length + a.purity.length - check.candidates,
      writer: r.feedback !== "",
      analysis: a,
    },
  };
}

/** Tekshiruvchi ba'zan faqat xato qismni emas, butun gapni tuzatib qaytaradi: bunday javob belgi sifatida yaramaydi */
const words = (t: string) => t.trim().split(/\s+/).length;
const sameScope = (right: string, c: Candidate) => words(right) <= Math.max(words(c.wrong), words(c.right)) + 1;

/** Ikkinchi ekspert: rad etilgani tashlanadi, javob berilmagani qoldiriladi, tuzatilgan "to'g'risi" olinadi */
async function crossCheck(reviewer: AskModel, v0: Verified, seg: Segmented, source: string): Promise<Checked> {
  const cands: Candidate[] = [
    ...v0.errors.map((e) => ({ kind: "literacy" as const, s: e.s ?? null, type: e.type, wrong: e.wrong, right: e.right, note: e.note ?? null, rule: e.rule })),
    ...v0.styleIssues.map((x) => ({ kind: "style" as const, s: x.s ?? null, type: x.register, wrong: x.quote, right: x.fix ?? "", note: x.register })),
    ...v0.purity.map((x) => ({ kind: "purity" as const, s: x.s ?? null, type: x.kind, wrong: x.quote, right: x.fix ?? "", note: x.kind })),
  ];
  if (!cands.length) return { v: v0, disputed: [], candidates: 0, status: "none" };
  const vp = verifyPrompt(cands, seg);
  let checks: z.output<typeof verifySchema>["checks"];
  try {
    checks = scrub(await reviewer.ask(vp.system, vp.user, verifySchema), source).value.checks;
  } catch (e) {
    return { v: v0, disputed: [], candidates: cands.length, status: "failed", error: (e as Error).message.slice(0, 300) };
  }
  const byI = new Map(checks.map((c) => [c.i, c]));
  const disputed: Disputed[] = [];
  const keep = <T>(xs: T[], offset: number, fix: (x: T, right: string) => T) =>
    xs.flatMap((x, k) => {
      const c = byI.get(offset + k);
      if (c && !c.valid) {
        const { kind, type, wrong, right } = cands[offset + k];
        disputed.push({ kind, type, wrong, right, reason: c.note ?? null });
        return [];
      }
      const right = c?.right?.trim();
      return [right && sameScope(right, cands[offset + k]) ? fix(x, right) : x];
    });
  const n1 = v0.errors.length;
  const n2 = n1 + v0.styleIssues.length;
  const v: Verified = {
    ...v0,
    errors: keep(v0.errors, 0, (e, right) => ({ ...e, right })).filter((e) => norm(e.wrong) !== norm(e.right)),
    styleIssues: keep(v0.styleIssues, n1, (x, fix) => ({ ...x, fix })),
    purity: keep(v0.purity, n2, (x, fix) => ({ ...x, fix })),
  };
  return { v, disputed, candidates: cands.length, status: "ok" };
}

/** Taqrizchi yozolmasa ham baho saqlanadi: izoh o'rniga server dalili, tavsiya o'rniga uslub tuzatishlari */
async function writeReview(
  opts: GradeOpts & { source: string },
  seg: Segmented,
  a: Analysis,
  scored: Scored,
  mistakes: ReturnType<typeof buildMistakes>,
  v: Verified,
) {
  const wp = writerPrompt(opts.topic, seg, a, scored, mistakes);
  const ask = async () => scrub(await opts.reviewer.ask(wp.system, wp.user, writerSchema), opts.source);
  let got = await ask().catch(() => null);
  // Taqrizga begona til aralashsa — yana bir urinish; bunda ham chiqsa, o'sha qismlar tashlanadi
  if (got?.dropped) got = await ask().catch(() => got);
  const w = got?.value;
  const comments = new Map((w?.criteria ?? []).map((c) => [c.key, c.comment.trim()]));
  const criteria = ESSAY_RUBRIC.map((c) => ({
    key: c.key as string,
    score: scored.scores[c.key],
    comment: comments.get(c.key) || `${cap(scored.facts[c.key])}.`,
  }));
  const fallbackTips = v.styleIssues
    .filter((x) => x.fix)
    .slice(0, 3)
    .map((x) => ({ focus: "style", text: `Publitsistik uslubdan chekinish: «${x.quote}».`, example: x.fix ?? null }));
  return normalize({ special: null, criteria, feedback: w?.feedback ?? "", mistakes, tips: w?.tips.length ? w.tips : fallbackTips });
}
