/** Sinov to'plami natijasi hisoboti (eval:gold report): o'qish, xato topish, bandlar va umumiy ball */
import { totalAgreement, cerWer, exactAdjacent, matchErrors, ocrErrorFidelity, prf, qwk, type GoldError, type GoldType } from "./metrics";

export interface RunResult {
  essay: string;
  mode: "ocr" | "gold";
  ocr: { text: string; model: string } | null;
  special: string | null;
  scores: Record<string, number>;
  total: number;
  mistakes: { type?: string; wrong: string }[];
  models: { grade: string; effort: string; verify?: string };
  seconds: number;
  error?: string;
}
export interface HumanScore {
  rater: string;
  scores: Record<string, number>;
  special: string | null;
  total: number;
}
interface Transcript {
  text: string;
  errors: GoldError[];
}
export interface ReportData {
  title: string;
  keys: string[];
  res: RunResult[];
  human: Map<string, HumanScore[]>;
  gold: (essay: string) => Transcript;
}

const TYPES: GoldType[] = ["spelling", "punctuation", "affix", "word"];
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function reportReading({ res, gold }: ReportData) {
  const ocr = res.flatMap((r) => (r.ocr ? [{ gold: gold(r.essay), ...r.ocr }] : []));
  if (!ocr.length) return;
  const cw = ocr.map((r) => cerWer(r.gold.text, r.text));
  const sum = { kept: 0, corrected: 0, unclear: 0 };
  for (const r of ocr) {
    const f = ocrErrorFidelity(r.gold.errors, r.text);
    for (const k of ["kept", "corrected", "unclear"] as const) sum[k] += f[k];
  }
  const all = sum.kept + sum.corrected + sum.unclear;
  const models = [...new Set(ocr.map((r) => r.model))].join(", ");
  console.log(`\nO'qish: CER ${pct(mean(cw.map((x) => x.cer)))}, WER ${pct(mean(cw.map((x) => x.wer)))} · model: ${models}`);
  console.log(`  o'quvchi xatolari (${all}): saqlandi ${sum.kept}, O'QISHDA TUZATIB YUBORILDI ${sum.corrected}, noaniq ${sum.unclear}`);
}

function reportMistakes({ res, gold }: ReportData) {
  const sum = Object.fromEntries(TYPES.map((t) => [t, { tp: 0, fp: 0, fn: 0 }])) as Record<GoldType, { tp: number; fp: number; fn: number }>;
  for (const r of res) {
    const found = r.mistakes.map((x) => ({ type: x.type ?? "other", wrong: x.wrong }));
    const m = matchErrors(gold(r.essay).errors, found);
    for (const t of TYPES) for (const k of ["tp", "fp", "fn"] as const) sum[t][k] += m[t][k];
  }
  console.log(`\nXato topish (aniqlik / to'liqlik / F0.5):`);
  for (const t of TYPES) {
    const s = sum[t];
    const v = prf(s.tp, s.fp, s.fn);
    console.log(`  ${t.padEnd(12)} ${pct(v.p).padStart(6)} / ${pct(v.r).padStart(6)} / ${f2(v.f05)}   (to'g'ri ${s.tp}, soxta ${s.fp}, topilmagan ${s.fn})`);
  }
}

function reportCriteria({ keys }: ReportData, pairs: { r: RunResult; h: HumanScore[] }[]) {
  const scored = pairs.filter(({ r, h }) => !r.special && h.every((x) => !x.special));
  const s2 = scored.filter(({ h }) => h.length >= 2);
  console.log(`\nBandlar (${scored.length} ta esse; ETS me'yori: QWK ≥ 0,70 va inson–insondan ≤ 0,10 past):`);
  console.log(`  ${"band".padEnd(12)} AI–U1   AI–U2   U1–U2   aynan   ±0,5`);
  for (const k of keys) {
    const ai = scored.map(({ r }) => r.scores[k] ?? 0);
    const h1 = scored.map(({ h }) => h[0].scores[k]);
    const ea = exactAdjacent(ai, h1);
    const of = (xs: typeof s2, rater: number) => xs.map(({ h }) => h[rater].scores[k]);
    const second = s2.length
      ? qwk(
          s2.map(({ r }) => r.scores[k] ?? 0),
          of(s2, 1),
        )
      : NaN;
    const hh = s2.length ? qwk(of(s2, 0), of(s2, 1)) : NaN;
    console.log(
      `  ${k.padEnd(12)} ${f2(qwk(ai, h1)).padStart(5)}   ${f2(second).padStart(5)}   ${f2(hh).padStart(5)}   ${pct(ea.exact).padStart(6)}  ${pct(ea.adjacent).padStart(6)}`,
    );
  }
}

function reportTotals(pairs: { r: RunResult; h: HumanScore[] }[]) {
  const t = totalAgreement(
    pairs.map(({ r }) => r.total),
    pairs.map(({ h }) => mean(h.map((x) => x.total))),
  );
  const bias = `${t.bias >= 0 ? "saxiyroq" : "qattiqroq"} o'rtacha ${f2(Math.abs(t.bias))} ball`;
  console.log(`\nUmumiy ball (${pairs.length} ta): MAE ${f2(t.mae)} / 24 · AI ${bias} · SMD ${f2(t.smd)} (me'yor |SMD| ≤ 0,15)`);
  const two = pairs.filter(({ h }) => h.length >= 2);
  if (two.length) {
    const hh = totalAgreement(
      two.map(({ h }) => h[0].total),
      two.map(({ h }) => h[1].total),
    );
    console.log(`  Ikki ustoz orasida (${two.length} ta): MAE ${f2(hh.mae)} — AI shu darajaga yaqin bo'lishi kerak`);
  }
  const sp = pairs.filter(({ r, h }) => r.special || h.some((x) => x.special));
  const line = ({ r, h }: (typeof pairs)[number]) => `${r.essay} AI=${r.special ?? "—"} ustoz=${h.map((x) => x.special ?? "—").join("/")}`;
  if (sp.length) console.log(`  Maxsus holatlar: ${sp.map(line).join("; ")}`);
}

export function printReport(d: ReportData) {
  console.log(`\n=== ${d.title}: ${d.res.length} ta esse ===`);
  // Kam esseda QWK va ulushlar tasodifga juda bog'liq: raqamlar ko'rsatiladi, lekin xulosa qilinmaydi
  if (d.res.length < 30) console.log(`  ⚠ Atigi ${d.res.length} ta esse: bu raqamlardan xulosa chiqarmang (kamida 50 ta kerak, docs/ESSAY_AI_EVAL.md).`);
  reportReading(d);
  reportMistakes(d);
  const pairs = d.res.flatMap((r) => {
    const h = d.human.get(r.essay);
    return h?.length ? [{ r, h }] : [];
  });
  reportCriteria(d, pairs);
  reportTotals(pairs);
}
