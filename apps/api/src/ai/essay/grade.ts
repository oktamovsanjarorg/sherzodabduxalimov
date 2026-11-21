import { ESSAY_RUBRIC } from "@onatili/shared";
import { type AiEssayResult, type DeepSeekOpts, deepseekJson, normalize } from "../deepseek";
import { buildMistakes } from "./mistakes";
import { analysisPrompt, literacyPrompt, verifyPrompt, writerPrompt } from "./prompts";
import { type Analysis, analysisSchema, literacySchema, verifySchema, writerSchema } from "./schemas";
import { type Candidate, type Scored, scoreAll, verifiedQuotes } from "./scoring";
import { copiedShare, norm, type Segmented, segment } from "./text";

type Verified = ReturnType<typeof verifiedQuotes>;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const EMPTY = { criteria: [], mistakes: [], tips: [] };

/**
 * Esseni ko'p bosqichli chuqur tekshirish (bosqichlar: essay/index.ts).
 * Ballarni server hisoblaydi; AI faqat matndan iqtiboslar bilan dalil beradi va izoh yozadi.
 */
export async function gradeEssayDeepSeek(opts: DeepSeekOpts & { topic: string; text: string; handwritten?: boolean }): Promise<AiEssayResult> {
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
  const [a, lit] = await Promise.all([deepseekJson(opts, ap.system, ap.user, analysisSchema), deepseekJson(opts, lp.system, lp.user, literacySchema)]);
  const t1 = Date.now();
  if (a.special) {
    return { ...EMPTY, special: a.special, feedback: [a.intro.note, a.body.note, a.conclusion.note].filter(Boolean).join(" "), analysis: { analysis: a } };
  }

  // C: matnda yo'q iqtiboslar tashlanadi, qolganini ikkinchi ekspert qayta tekshiradi
  const v0 = verifiedQuotes(a, lit.errors, seg);
  const { v, rejected, candidates } = await crossCheck(opts, v0, seg);
  const t2 = Date.now();

  const scored = scoreAll(a, v, seg, handwritten);
  const mistakes = buildMistakes(v, seg);
  // D: yakuniy ball va dalillar asosida izoh, taqriz, tavsiyalar
  const r = await writeReview(opts, seg, a, scored, mistakes, v);
  return {
    ...r,
    analysis: {
      model: opts.model,
      effort: opts.effort ?? "off",
      seconds: { analysis: (t1 - t0) / 1000, verify: (t2 - t1) / 1000, total: (Date.now() - t0) / 1000 },
      sentences: seg.sentences.length,
      paragraphs: seg.paragraphs.length,
      facts: scored.facts,
      rejectedByVerifier: rejected,
      droppedQuotes: lit.errors.length + a.styleIssues.length + a.purity.length - candidates,
      writer: r.feedback !== "",
      analysis: a,
    },
  };
}

/** Ikkinchi ekspert: rad etilgani tashlanadi, javob berilmagani qoldiriladi, tuzatilgan "to'g'risi" olinadi */
async function crossCheck(opts: DeepSeekOpts, v0: Verified, seg: Segmented) {
  const cands: Candidate[] = [
    ...v0.errors.map((e) => ({ kind: "literacy" as const, s: e.s ?? null, type: e.type, wrong: e.wrong, right: e.right, note: e.note ?? null, rule: e.rule })),
    ...v0.styleIssues.map((x) => ({ kind: "style" as const, s: x.s ?? null, type: x.register, wrong: x.quote, right: x.fix ?? "", note: x.register })),
    ...v0.purity.map((x) => ({ kind: "purity" as const, s: x.s ?? null, type: x.kind, wrong: x.quote, right: x.fix ?? "", note: x.kind })),
  ];
  if (!cands.length) return { v: v0, rejected: 0, candidates: 0 };
  const vp = verifyPrompt(cands, seg);
  const checks = await deepseekJson(opts, vp.system, vp.user, verifySchema).catch(() => null);
  if (!checks) return { v: v0, rejected: 0, candidates: cands.length };
  const byI = new Map(checks.checks.map((c) => [c.i, c]));
  let rejected = 0;
  const keep = <T>(xs: T[], offset: number, fix: (x: T, right: string) => T) =>
    xs.flatMap((x, k) => {
      const c = byI.get(offset + k);
      if (c && !c.valid) return (rejected++, []);
      return [c?.right?.trim() ? fix(x, c.right.trim()) : x];
    });
  const n1 = v0.errors.length;
  const n2 = n1 + v0.styleIssues.length;
  const v: Verified = {
    ...v0,
    errors: keep(v0.errors, 0, (e, right) => ({ ...e, right })).filter((e) => norm(e.wrong) !== norm(e.right)),
    styleIssues: keep(v0.styleIssues, n1, (x, fix) => ({ ...x, fix })),
    purity: keep(v0.purity, n2, (x, fix) => ({ ...x, fix })),
  };
  return { v, rejected, candidates: cands.length };
}

/** Taqrizchi yozolmasa ham baho saqlanadi: izoh o'rniga server dalili, tavsiya o'rniga uslub tuzatishlari */
async function writeReview(opts: DeepSeekOpts & { topic: string }, seg: Segmented, a: Analysis, scored: Scored, mistakes: ReturnType<typeof buildMistakes>, v: Verified) {
  const wp = writerPrompt(opts.topic, seg, a, scored, mistakes);
  const w = await deepseekJson(opts, wp.system, wp.user, writerSchema).catch(() => null);
  const comments = new Map((w?.criteria ?? []).map((c) => [c.key, c.comment.trim()]));
  const criteria = ESSAY_RUBRIC.map((c) => ({ key: c.key as string, score: scored.scores[c.key], comment: comments.get(c.key) || `${cap(scored.facts[c.key])}.` }));
  const fallbackTips = v.styleIssues
    .filter((x) => x.fix)
    .slice(0, 3)
    .map((x) => ({ focus: "style", text: `Publitsistik uslubdan chekinish: «${x.quote}».`, example: x.fix ?? null }));
  return normalize({ special: null, criteria, feedback: w?.feedback ?? "", mistakes, tips: w?.tips.length ? w.tips : fallbackTips });
}
