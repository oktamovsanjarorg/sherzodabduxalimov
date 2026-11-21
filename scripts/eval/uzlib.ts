/**
 * UzLiB "to'g'ri so'z" (imlo) bo'limini BIZNING sozlamamiz bilan o'tkazish — imlo bosqichi uchun modelni o'lchab tanlash.
 * Manba: github.com/tahrirchi/uzlib (MIT). Prompt va javobni ajratish asl run_uzlib.py bilan bir xil, natija leaderboard bilan solishtiriladi.
 *
 *   pnpm eval:uzlib run --provider=deepseek --model=deepseek-v4-pro --effort=high [--limit=200] [--concurrency=8]
 *   pnpm eval:uzlib run --provider=gemini --model=gemini-3.8-flash --effort=high
 *   pnpm eval:uzlib report [--compare=<uzlib>/artifacts/deepseek-v4-pro.jsonl]
 *
 * Ma'lumot va natijalar: eval-data/uzlib/ (git'ga kirmaydi). To'xtab qolsa, qayta ishga tushiring — bajarilganlari o'tkazib yuboriladi.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractAnswer, mcnemar, wilson } from "./lib";

interface Q { id: string; question: string; option_a: string; option_b: string; option_c: string; option_d: string; answer: string }
interface Usage { input: number; cached: number; output: number }
interface Row { id: string; answer: string | null; response: string | null; model: string | null; usage: Usage | null; ms: number; error?: string }

const DIR = "eval-data/uzlib";
const RUNS = join(DIR, "runs");
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const env = (k: string) => process.env[k]?.split("#")[0].trim() || undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Savollar bir marta yuklanadi (HuggingFace rows API), keyin keshdan o'qiladi */
async function questions(): Promise<Q[]> {
  const file = join(DIR, "correct_word.json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  mkdirSync(DIR, { recursive: true });
  const all: Q[] = [];
  for (let off = 0; ; off += 100) {
    const r = await fetch(`https://datasets-server.huggingface.co/rows?dataset=tahrirchi/uzlib&config=default&split=correct_word&offset=${off}&length=100`);
    if (!r.ok) throw new Error(`HuggingFace ${r.status}`);
    const j = (await r.json()) as { rows: { row: Q }[]; num_rows_total: number };
    all.push(...j.rows.map((x) => x.row));
    if (all.length >= j.num_rows_total || !j.rows.length) break;
  }
  if (all.length !== 1501) throw new Error(`Kutilgan 1501 ta savol, keldi ${all.length}`);
  writeFileSync(file, JSON.stringify(all));
  return all;
}

const prompt = (q: Q) => `${q.question}\nA) ${q.option_a}\nB) ${q.option_b}\nC) ${q.option_c}\nD) ${q.option_d}\n\nJavob: `;

async function askDeepSeek(model: string, effort: string, text: string) {
  const key = env("DEEPSEEK_API_KEY");
  if (!key) throw new Error(".env da DEEPSEEK_API_KEY yo'q");
  const thinking = effort !== "off";
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: thinking ? 32_000 : 1024,
      thinking: { type: thinking ? "enabled" : "disabled" },
      ...(thinking ? { reasoning_effort: effort } : { temperature: 0 }),
      messages: [{ role: "user", content: text }],
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const j = (await r.json().catch(() => null)) as any;
  if (!r.ok) throw Object.assign(new Error(`DeepSeek ${r.status}: ${j?.error?.message ?? ""}`), { status: r.status });
  const u = j?.usage;
  return {
    text: (j?.choices?.[0]?.message?.content as string | undefined) ?? null,
    model: (j?.model as string | undefined) ?? null,
    usage: u ? { input: u.prompt_tokens ?? 0, cached: u.prompt_cache_hit_tokens ?? 0, output: u.completion_tokens ?? 0 } : null,
  };
}

async function askGemini(model: string, effort: string, text: string) {
  const key = env("GEMINI_API_KEY");
  if (!key) throw new Error(".env da GEMINI_API_KEY yo'q");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: effort === "off" ? {} : { thinkingConfig: { thinkingLevel: effort } },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const j = (await r.json().catch(() => null)) as any;
  if (!r.ok) throw Object.assign(new Error(`Gemini ${r.status}: ${j?.error?.message ?? ""}`), { status: r.status });
  const parts: { text?: string; thought?: boolean }[] = j?.candidates?.[0]?.content?.parts ?? [];
  const u = j?.usageMetadata;
  return {
    text: parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("") || null,
    // Javobdagi haqiqiy versiya: so'ralgan model jim almashtirilsa ham ko'rinadi
    model: (j?.modelVersion as string | undefined) ?? null,
    usage: u ? { input: u.promptTokenCount ?? 0, cached: u.cachedContentTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) } : null,
  };
}

/** Band (429/5xx) yoki tarmoq xatosida 3 martagacha qayta uriniladi; boshqa xato darhol yoziladi */
async function ask(provider: string, model: string, effort: string, q: Q): Promise<Row> {
  const t0 = Date.now();
  let last = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(2000 * 2 ** attempt);
    try {
      const fn = provider === "gemini" ? askGemini : askDeepSeek;
      const r = await fn(model, effort, prompt(q));
      return { id: q.id, answer: extractAnswer(r.text), response: r.text?.slice(0, 2000) ?? null, model: r.model, usage: r.usage, ms: Date.now() - t0 };
    } catch (e) {
      const status = (e as { status?: number }).status;
      last = (e as Error).message;
      if (status && status !== 429 && status < 500) break;
    }
  }
  return { id: q.id, answer: null, response: null, model: null, usage: null, ms: Date.now() - t0, error: last };
}

async function run() {
  const provider = arg("provider") ?? "deepseek";
  const model = arg("model") ?? (provider === "gemini" ? "gemini-3.8-flash" : "deepseek-v4-pro");
  const effort = arg("effort") ?? "high";
  const concurrency = Number(arg("concurrency") ?? 8);
  const keyName = provider === "gemini" ? "GEMINI_API_KEY" : "DEEPSEEK_API_KEY";
  if (!env(keyName)) throw new Error(`.env da ${keyName} yo'q`);
  const qs = await questions();
  const limit = Number(arg("limit") ?? qs.length);
  // --limit: har safar bir xil, savollar bo'ylab teng taqsimlangan tanlov (birinchi N ta emas)
  const step = qs.length / Math.min(limit, qs.length);
  const pick = Array.from({ length: Math.min(limit, qs.length) }, (_, i) => qs[Math.floor(i * step)]);
  mkdirSync(RUNS, { recursive: true });
  const out = join(RUNS, `${provider}__${model}__${effort}.jsonl`);
  const done = new Set(existsSync(out) ? readLines(out).filter((r) => !r.error).map((r) => r.id) : []);
  const todo = pick.filter((q) => !done.has(q.id));
  console.log(`${provider} ${model} (${effort}): ${pick.length} savol, ${done.size} tasi oldin bajarilgan, ${todo.length} tasi qoldi → ${out}`);
  let n = 0;
  const worker = async () => {
    for (let q = todo.shift(); q; q = todo.shift()) {
      const row = await ask(provider, model, effort, q);
      appendFileSync(out, JSON.stringify(row) + "\n");
      if (++n % 25 === 0 || row.error) console.log(`  ${n} … ${row.error ? `xato ${q.id}: ${row.error}` : "ok"}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  report();
}

function readLines(file: string): Row[] {
  const rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);
  // Qayta urinishda bir savol ikki marta yozilishi mumkin: oxirgi xatosiz natija olinadi
  const by = new Map<string, Row>();
  for (const r of rows) if (!by.get(r.id) || !r.error) by.set(r.id, r);
  return [...by.values()];
}

/** 1M token narxi ($, PEAK — yuqori chegara). Manba: api-docs.deepseek.com/quick_start/pricing (2026-11-21) */
const PRICE: Record<string, { hit: number; miss: number; out: number }> = {
  "deepseek-v4-pro": { hit: 0.044, miss: 1.32, out: 3.96 },
  "deepseek-flash": { hit: 0.006, miss: 0.3, out: 1.2 },
};

function report() {
  const gold = new Map((JSON.parse(readFileSync(join(DIR, "correct_word.json"), "utf8")) as Q[]).map((q) => [q.id, q.answer]));
  const compare = arg("compare");
  const ref = compare ? new Map(readFileSync(compare, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((r: { id: string; extracted_answer: string | null }) => [r.id, r.extracted_answer])) : null;
  if (!existsSync(RUNS)) return console.log("Hali natija yo'q");
  for (const f of readdirSync(RUNS).filter((x) => x.endsWith(".jsonl")).sort()) {
    const all = readLines(join(RUNS, f)).filter((r) => gold.has(r.id));
    // Javob olinmagan savollar (429, tarmoq) noto'g'ri deb sanalmaydi: ular alohida ko'rsatiladi va keyin qayta so'raladi
    const failed = all.filter((r) => r.error);
    const rows = all.filter((r) => !r.error);
    const ok = rows.filter((r) => r.answer === gold.get(r.id)).length;
    const ci = wilson(ok, rows.length);
    const tokens = rows.reduce((s, r) => ({ input: s.input + (r.usage?.input ?? 0), cached: s.cached + (r.usage?.cached ?? 0), output: s.output + (r.usage?.output ?? 0) }), { input: 0, cached: 0, output: 0 });
    const [, model] = f.replace(/\.jsonl$/, "").split("__");
    const p = PRICE[model];
    const cost = p ? ((tokens.input - tokens.cached) * p.miss + tokens.cached * p.hit + tokens.output * p.out) / 1e6 : null;
    const versions = [...new Set(rows.map((r) => r.model).filter(Boolean))];
    const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
    console.log(`\n${f}\n  to'g'ri: ${ok}/${rows.length} = ${ci.p.toFixed(4)} (95%: ${ci.lo.toFixed(3)}–${ci.hi.toFixed(3)})`);
    console.log(`  javobsiz: ${rows.filter((r) => !r.answer).length} · javob olinmagan (qayta so'raladi): ${failed.length}${failed[0] ? ` — ${failed[failed.length - 1].error?.slice(0, 80)}` : ""} · javob versiyasi: ${versions.join(", ") || "—"}`);
    console.log(`  token: kirish ${tokens.input}, chiqish ${tokens.output}${cost !== null ? ` · narx ≤ $${cost.toFixed(2)}` : ""} · vaqt mediana ${((ms[ms.length >> 1] ?? 0) / 1000).toFixed(1)} s`);
    if (ref) {
      const both = rows.filter((r) => ref.has(r.id));
      const a = both.filter((r) => r.answer === gold.get(r.id) && ref.get(r.id) !== gold.get(r.id)).length;
      const b = both.filter((r) => r.answer !== gold.get(r.id) && ref.get(r.id) === gold.get(r.id)).length;
      const refOk = both.filter((r) => ref.get(r.id) === gold.get(r.id)).length;
      console.log(`  solishtirish (${both.length} ta bir xil savol): leaderboard ${(refOk / both.length).toFixed(4)} · faqat bizda to'g'ri ${a}, faqat unda ${b} · McNemar p = ${mcnemar(a, b).toPrecision(2)}`);
    }
  }
}

const cmd = process.argv[2];
if (cmd === "run") run().catch((e) => (console.error(e), process.exit(1)));
else if (cmd === "report") report();
else console.log("Ishlatish: pnpm eval:uzlib run|report [--provider= --model= --effort= --limit= --concurrency= --compare=]");
