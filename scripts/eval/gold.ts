/**
 * Real sinov to'plami bo'yicha AI tekshiruvini o'lchash (format: docs/ESSAY_AI_EVAL.md).
 *
 *   pnpm eval:gold run --label=v1 [--text=ocr|gold] [--only=e001,e002]
 *     ocr  — varoq rasmlari Gemini bilan o'qiladi, keyin baholanadi (o'quvchi ko'radigan haqiqiy oqim);
 *     gold — ustoz ko'chirgan aniq matn baholanadi (o'qish xatosini baholash xatosidan ajratish uchun).
 *   pnpm eval:gold report --label=v1
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ESSAY_RUBRIC, countWords, isMostlyCyrillic, rubricScore, type EssaySpecialKey } from "@onatili/shared";
import type { Effort } from "../../apps/api/src/ai/deepseek";
import { gradeEssayDeepSeek } from "../../apps/api/src/ai/essay/grade";
import { transcribeHandwritingMeta } from "../../apps/api/src/ai/gemini";
import { cerWer, exactAdjacent, matchErrors, ocrErrorFidelity, parseTranscript, prf, qwk, totalAgreement, type GoldType } from "./metrics";

const DIR = "eval-data/gold";
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const env = (k: string) => process.env[k]?.split("#")[0].trim() || undefined;
const KEYS = ESSAY_RUBRIC.map((c) => c.key as string);
const IMG = /\.(jpe?g|png|webp)$/i;

interface RunResult {
  essay: string;
  mode: "ocr" | "gold";
  ocr: { text: string; model: string } | null;
  special: string | null;
  scores: Record<string, number>;
  total: number;
  mistakes: { type?: string; wrong: string }[];
  models: { grade: string; effort: string };
  seconds: number;
  error?: string;
}

/** Ustozlar bahosi: scores.csv — essay,rater,<12 band>[,special] */
function humanScores() {
  const lines = readFileSync(join(DIR, "scores.csv"), "utf8").split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].split(",").map((h) => h.trim());
  const miss = ["essay", "rater", ...KEYS].filter((k) => !head.includes(k));
  if (miss.length) throw new Error(`scores.csv da ustun yo'q: ${miss.join(", ")}`);
  const by = new Map<string, { rater: string; scores: Record<string, number>; special: string | null; total: number }[]>();
  for (const l of lines.slice(1)) {
    const c = Object.fromEntries(l.split(",").map((v, i) => [head[i], v.trim()]));
    const special = (c.special || null) as EssaySpecialKey | null;
    const scores = Object.fromEntries(KEYS.map((k) => [k, Number(c[k] || 0)]));
    const bad = KEYS.filter((k) => !special && ![0, 0.5, 1, 1.5, 2].includes(scores[k]));
    if (bad.length) throw new Error(`scores.csv ${c.essay}/${c.rater}: noto'g'ri ball (${bad.join(", ")})`);
    const total = rubricScore(special, KEYS.map((k) => ({ key: k, score: scores[k] }))).total;
    by.set(c.essay, [...(by.get(c.essay) ?? []), { rater: c.rater, scores, special, total }]);
  }
  return by;
}

const essays = () => readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "runs").map((d) => d.name).sort();
const gold = (e: string) => parseTranscript(readFileSync(join(DIR, e, "transcript.txt"), "utf8"));

async function gradeOne(e: string, mode: "ocr" | "gold", opts: { apiKey: string; model: string; effort: Effort }): Promise<RunResult> {
  const t0 = Date.now();
  const topic = readFileSync(join(DIR, e, "topic.txt"), "utf8").trim();
  const images = readdirSync(join(DIR, e)).filter((f) => IMG.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  let ocr: RunResult["ocr"] = null;
  let text = gold(e).text;
  if (mode === "ocr") {
    if (!images.length) throw new Error(`${e}: rasm yo'q (--text=gold bilan ishlating)`);
    const key = env("GEMINI_API_KEY");
    if (!key) throw new Error(".env da GEMINI_API_KEY yo'q");
    const imgs = images.map((f) => {
      const data = readFileSync(join(DIR, e, f));
      return { mime: data[0] === 0x89 ? "image/png" : data[0] === 0x52 ? "image/webp" : "image/jpeg", data };
    });
    ocr = await transcribeHandwritingMeta({ apiKey: key, model: env("GEMINI_MODEL") ?? "gemini-3.8-flash", images: imgs });
    text = ocr.text.trim();
  }
  // ai-runner bilan bir xil: kirillcha va 100 so'zdan kam esselarni server o'zi aniqlaydi
  const auto: EssaySpecialKey | null = isMostlyCyrillic(text) ? "CYRILLIC" : countWords(text) < 100 ? "TOO_SHORT" : null;
  const r = auto ? null : await gradeEssayDeepSeek({ ...opts, topic, text, handwritten: mode === "ocr" });
  const special = (auto ?? r?.special ?? null) as EssaySpecialKey | null;
  const scores = Object.fromEntries((r?.criteria ?? []).map((c) => [c.key, c.score]));
  const total = rubricScore(special, KEYS.map((k) => ({ key: k, score: scores[k] ?? 0 }))).total;
  return { essay: e, mode, ocr, special, scores, total, mistakes: r?.mistakes ?? [], models: { grade: opts.model, effort: opts.effort }, seconds: (Date.now() - t0) / 1000 };
}

async function run() {
  const label = arg("label");
  if (!label) throw new Error("--label=... kerak (masalan v1)");
  const mode = (arg("text") ?? "ocr") as "ocr" | "gold";
  const apiKey = env("DEEPSEEK_API_KEY");
  if (!apiKey) throw new Error(".env da DEEPSEEK_API_KEY yo'q");
  const opts = { apiKey, model: env("DEEPSEEK_ESSAY_MODEL") ?? "deepseek-v4-pro", effort: (env("DEEPSEEK_ESSAY_EFFORT") ?? "high") as Effort };
  const out = join(DIR, "runs", `${label}-${mode}`);
  mkdirSync(out, { recursive: true });
  const only = arg("only")?.split(",");
  for (const e of essays().filter((x) => !only || only.includes(x))) {
    const file = join(out, `${e}.json`);
    if (existsSync(file) && !JSON.parse(readFileSync(file, "utf8")).error) continue; // to'xtab qolsa — davom etadi
    const res = await gradeOne(e, mode, opts).catch((err: Error) => ({ essay: e, error: err.message }) as RunResult);
    writeFileSync(file, JSON.stringify(res, null, 2));
    console.log(res.error ? `${e}: XATO ${res.error}` : `${e}: ${res.special ?? res.total} (${res.seconds.toFixed(0)} s)`);
  }
  report();
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "—");

function report() {
  const label = arg("label");
  const mode = arg("text") ?? "ocr";
  const out = join(DIR, "runs", `${label}-${mode}`);
  if (!existsSync(out)) throw new Error(`Natija yo'q: ${out}`);
  const human = humanScores();
  const res = readdirSync(out).map((f) => JSON.parse(readFileSync(join(out, f), "utf8")) as RunResult).filter((r) => !r.error);
  console.log(`\n=== ${label} (${mode}): ${res.length} ta esse ===`);
  // Kam esseda QWK va ulushlar tasodifga juda bog'liq: raqamlar ko'rsatiladi, lekin xulosa qilinmaydi
  if (res.length < 30) console.log(`  ⚠ Atigi ${res.length} ta esse: bu raqamlardan xulosa chiqarmang (kamida 50 ta kerak, docs/ESSAY_AI_EVAL.md).`);

  // 1) O'qish
  const ocr = res.filter((r) => r.ocr);
  if (ocr.length) {
    const cw = ocr.map((r) => cerWer(gold(r.essay).text, r.ocr!.text));
    const fid = ocr.map((r) => ocrErrorFidelity(gold(r.essay).errors, r.ocr!.text)).reduce((s, x) => ({ kept: s.kept + x.kept, corrected: s.corrected + x.corrected, unclear: s.unclear + x.unclear }), { kept: 0, corrected: 0, unclear: 0 });
    const all = fid.kept + fid.corrected + fid.unclear;
    console.log(`\nO'qish: CER ${pct(cw.reduce((s, x) => s + x.cer, 0) / cw.length)}, WER ${pct(cw.reduce((s, x) => s + x.wer, 0) / cw.length)} · model: ${[...new Set(ocr.map((r) => r.ocr!.model))].join(", ")}`);
    console.log(`  o'quvchi xatolari (${all}): saqlandi ${fid.kept}, O'QISHDA TUZATIB YUBORILDI ${fid.corrected}, noaniq ${fid.unclear}`);
  }

  // 2) Xato topish
  const types: GoldType[] = ["spelling", "punctuation", "affix", "word"];
  const sum = Object.fromEntries(types.map((t) => [t, { tp: 0, fp: 0, fn: 0 }])) as Record<GoldType, { tp: number; fp: number; fn: number }>;
  for (const r of res) {
    const m = matchErrors(gold(r.essay).errors, r.mistakes.map((x) => ({ type: x.type ?? "other", wrong: x.wrong })));
    for (const t of types) for (const k of ["tp", "fp", "fn"] as const) sum[t][k] += m[t][k];
  }
  console.log(`\nXato topish (aniqlik / to'liqlik / F0.5):`);
  for (const t of types) {
    const s = sum[t];
    const v = prf(s.tp, s.fp, s.fn);
    console.log(`  ${t.padEnd(12)} ${pct(v.p).padStart(6)} / ${pct(v.r).padStart(6)} / ${f2(v.f05)}   (to'g'ri ${s.tp}, soxta ${s.fp}, topilmagan ${s.fn})`);
  }

  // 3) Ballar
  const pairs = res.filter((r) => (human.get(r.essay)?.length ?? 0) >= 1);
  const two = pairs.filter((r) => human.get(r.essay)!.length >= 2);
  const scored = pairs.filter((r) => !r.special && human.get(r.essay)!.every((h) => !h.special));
  console.log(`\nBandlar (${scored.length} ta esse; ETS me'yori: QWK ≥ 0,70 va inson–insondan ≤ 0,10 past):`);
  console.log(`  ${"band".padEnd(12)} AI–U1   AI–U2   U1–U2   aynan   ±0,5`);
  for (const k of KEYS) {
    const ai = scored.map((r) => r.scores[k] ?? 0);
    const h1 = scored.map((r) => human.get(r.essay)![0].scores[k]);
    const s2 = scored.filter((r) => human.get(r.essay)!.length >= 2);
    const h2 = s2.map((r) => human.get(r.essay)![1].scores[k]);
    const ai2 = s2.map((r) => r.scores[k] ?? 0);
    const ea = exactAdjacent(ai, h1);
    const hh = s2.length ? qwk(s2.map((r) => human.get(r.essay)![0].scores[k]), h2) : NaN;
    console.log(`  ${k.padEnd(12)} ${f2(qwk(ai, h1)).padStart(5)}   ${f2(s2.length ? qwk(ai2, h2) : NaN).padStart(5)}   ${f2(hh).padStart(5)}   ${pct(ea.exact).padStart(6)}  ${pct(ea.adjacent).padStart(6)}`);
  }
  const meanH = (r: RunResult) => human.get(r.essay)!.reduce((s, h) => s + h.total, 0) / human.get(r.essay)!.length;
  const t = totalAgreement(pairs.map((r) => r.total), pairs.map(meanH));
  console.log(`\nUmumiy ball (${pairs.length} ta): MAE ${f2(t.mae)} / 24 · AI ${t.bias >= 0 ? "saxiyroq" : "qattiqroq"} o'rtacha ${f2(Math.abs(t.bias))} ball · SMD ${f2(t.smd)} (me'yor |SMD| ≤ 0,15)`);
  if (two.length) {
    const hh = totalAgreement(two.map((r) => human.get(r.essay)![0].total), two.map((r) => human.get(r.essay)![1].total));
    console.log(`  Ikki ustoz orasida (${two.length} ta): MAE ${f2(hh.mae)} — AI shu darajaga yaqin bo'lishi kerak`);
  }
  const sp = pairs.filter((r) => r.special || human.get(r.essay)!.some((h) => h.special));
  if (sp.length) console.log(`  Maxsus holatlar: ${sp.map((r) => `${r.essay} AI=${r.special ?? "—"} ustoz=${human.get(r.essay)!.map((h) => h.special ?? "—").join("/")}`).join("; ")}`);
}

const cmd = process.argv[2];
if (cmd === "run") run().catch((e) => (console.error(e), process.exit(1)));
else if (cmd === "report") report();
else console.log("Ishlatish: pnpm eval:gold run|report --label=v1 [--text=ocr|gold] [--only=...]");
