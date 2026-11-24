/**
 * Real sinov to'plami bo'yicha AI tekshiruvini o'lchash (format: docs/ESSAY_AI_EVAL.md).
 *
 *   pnpm eval:gold run --label=v1 [--text=ocr|gold] [--only=e001,e002]
 *     ocr  — varoq rasmlari o'qiladi (OpenAI kaliti bo'lsa GPT), keyin baholanadi (o'quvchi ko'radigan haqiqiy oqim);
 *     gold — ustoz ko'chirgan aniq matn baholanadi (o'qish xatosini baholash xatosidan ajratish uchun).
 *   pnpm eval:gold report --label=v1
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ESSAY_RUBRIC, countWords, isMostlyCyrillic, rubricScore, type EssaySpecialKey } from "@onatili/shared";
import { essayAi, type EssayAi } from "../../apps/api/src/ai/essay/setup";
import { loadEnv } from "../../apps/api/src/config/env";
import { printReport, type HumanScore, type RunResult } from "./gold-report";
import { parseTranscript } from "./metrics";

const DIR = "eval-data/gold";
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const env = loadEnv();
const KEYS = ESSAY_RUBRIC.map((c) => c.key as string);
const IMG = /\.(jpe?g|png|webp)$/i;

/** Ustozlar bahosi: scores.csv — essay,rater,<12 band>[,special] */
function humanScores() {
  const lines = readFileSync(join(DIR, "scores.csv"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const head = lines[0].split(",").map((h) => h.trim());
  const miss = ["essay", "rater", ...KEYS].filter((k) => !head.includes(k));
  if (miss.length) throw new Error(`scores.csv da ustun yo'q: ${miss.join(", ")}`);
  const by = new Map<string, HumanScore[]>();
  for (const l of lines.slice(1)) {
    const c = Object.fromEntries(l.split(",").map((v, i) => [head[i], v.trim()]));
    const special = (c.special || null) as EssaySpecialKey | null;
    const scores = Object.fromEntries(KEYS.map((k) => [k, Number(c[k] || 0)]));
    const bad = KEYS.filter((k) => !special && ![0, 0.5, 1, 1.5, 2].includes(scores[k]));
    if (bad.length) throw new Error(`scores.csv ${c.essay}/${c.rater}: noto'g'ri ball (${bad.join(", ")})`);
    const total = rubricScore(
      special,
      KEYS.map((k) => ({ key: k, score: scores[k] })),
    ).total;
    by.set(c.essay, [...(by.get(c.essay) ?? []), { rater: c.rater, scores, special, total }]);
  }
  return by;
}

const essays = () =>
  readdirSync(DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "runs")
    .map((d) => d.name)
    .sort();
const gold = (e: string) => parseTranscript(readFileSync(join(DIR, e, "transcript.txt"), "utf8"));

/** Baholashda ishlatilgan modellar: tekshiruvchi javob bermagan esseni ham ajratib ko'rsatadi */
function modelsOf(analysis: unknown): RunResult["models"] {
  const a = analysis as { model?: string; effort?: string; verifier?: { model: string; status: string } } | undefined;
  return { grade: a?.model ?? "—", effort: a?.effort ?? "—", verify: a?.verifier ? `${a.verifier.model} (${a.verifier.status})` : undefined };
}

async function gradeOne(e: string, mode: "ocr" | "gold", ai: EssayAi): Promise<RunResult> {
  const t0 = Date.now();
  const topic = readFileSync(join(DIR, e, "topic.txt"), "utf8").trim();
  const images = readdirSync(join(DIR, e))
    .filter((f) => IMG.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  let ocr: RunResult["ocr"] = null;
  let text = gold(e).text;
  if (mode === "ocr") {
    if (!images.length) throw new Error(`${e}: rasm yo'q (--text=gold bilan ishlating)`);
    if (!ai.read) throw new Error(".env da OPENAI_API_KEY ham, GEMINI_API_KEY ham yo'q");
    const imgs = images.map((f) => {
      const data = readFileSync(join(DIR, e, f));
      return { mime: data[0] === 0x89 ? "image/png" : data[0] === 0x52 ? "image/webp" : "image/jpeg", data };
    });
    text = (await ai.read(imgs)).trim();
    ocr = { text, model: env.OPENAI_API_KEY ? env.OPENAI_MODEL : env.GEMINI_MODEL };
  }
  // ai-runner bilan bir xil: kirillcha va 100 so'zdan kam esselarni server o'zi aniqlaydi
  const auto: EssaySpecialKey | null = isMostlyCyrillic(text) ? "CYRILLIC" : countWords(text) < 100 ? "TOO_SHORT" : null;
  const r = auto ? null : await ai.grade(topic, text, mode === "ocr");
  const special = (auto ?? r?.special ?? null) as EssaySpecialKey | null;
  const scores = Object.fromEntries((r?.criteria ?? []).map((c) => [c.key, c.score]));
  const total = rubricScore(
    special,
    KEYS.map((k) => ({ key: k, score: scores[k] ?? 0 })),
  ).total;
  return {
    essay: e,
    mode,
    ocr,
    special,
    scores,
    total,
    mistakes: r?.mistakes ?? [],
    models: modelsOf(r?.analysis),
    seconds: (Date.now() - t0) / 1000,
  };
}

async function run() {
  const label = arg("label");
  if (!label) throw new Error("--label=... kerak (masalan v1)");
  const mode = (arg("text") ?? "ocr") as "ocr" | "gold";
  const ai = essayAi(env);
  if (!ai) throw new Error(".env da AI_PROVIDER=deepseek va DEEPSEEK_API_KEY kerak");
  const out = join(DIR, "runs", `${label}-${mode}`);
  mkdirSync(out, { recursive: true });
  const only = arg("only")?.split(",");
  for (const e of essays().filter((x) => !only || only.includes(x))) {
    const file = join(out, `${e}.json`);
    if (existsSync(file) && !JSON.parse(readFileSync(file, "utf8")).error) continue; // to'xtab qolsa — davom etadi
    const res = await gradeOne(e, mode, ai).catch((err: Error) => ({ essay: e, error: err.message }) as RunResult);
    writeFileSync(file, JSON.stringify(res, null, 2));
    console.log(res.error ? `${e}: XATO ${res.error}` : `${e}: ${res.special ?? res.total} (${res.seconds.toFixed(0)} s)`);
  }
  report();
}

function report() {
  const label = arg("label");
  const mode = arg("text") ?? "ocr";
  const out = join(DIR, "runs", `${label}-${mode}`);
  if (!existsSync(out)) throw new Error(`Natija yo'q: ${out}`);
  const res = readdirSync(out)
    .map((f) => JSON.parse(readFileSync(join(out, f), "utf8")) as RunResult)
    .filter((r) => !r.error);
  printReport({ title: `${label} (${mode})`, keys: KEYS, res, human: humanScores(), gold });
}

const cmd = process.argv[2];
if (cmd === "run") run().catch((e) => (console.error(e), process.exit(1)));
else if (cmd === "report") report();
else console.log("Ishlatish: pnpm eval:gold run|report --label=v1 [--text=ocr|gold] [--only=...]");
