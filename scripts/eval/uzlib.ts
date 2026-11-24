/**
 * UzLiB "to'g'ri so'z" (imlo) bo'limini BIZNING sozlamamiz bilan o'tkazish — imlo bosqichi uchun modelni o'lchab tanlash.
 * Manba: github.com/tahrirchi/uzlib (MIT). Prompt va javobni ajratish asl run_uzlib.py bilan bir xil, natija leaderboard bilan solishtiriladi.
 *
 *   pnpm eval:uzlib run --provider=deepseek --model=deepseek-v4-pro --effort=high [--limit=200] [--concurrency=8]
 *   pnpm eval:uzlib run --provider=gemini --model=gemini-3.8-flash --effort=high
 *   pnpm eval:uzlib run --provider=openai --model=gpt-6-luna --effort=medium --limit=200 --max-cost=0.5
 *   pnpm eval:uzlib report [--compare=<uzlib>/artifacts/gpt-6-luna.jsonl | eval-data/uzlib/runs/….jsonl]
 *
 * --max-cost (odatda $1): shu ishga tushirishdagi xarajat chegarasi. Parallel ketgan so'rovlar sabab biroz oshishi mumkin.
 * Ma'lumot va natijalar: eval-data/uzlib/ (git'ga kirmaydi). To'xtab qolsa, qayta ishga tushiring — bajarilganlari o'tkazib yuboriladi.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { extractAnswer, mcnemar, wilson } from "./lib";
import { type ApiError, costOf, env, PROVIDERS, type Provider, type Usage } from "./providers";

interface Q {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  answer: string;
}
interface Row {
  id: string;
  answer: string | null;
  response: string | null;
  model: string | null;
  usage: Usage | null;
  ms: number;
  error?: string;
  fatal?: boolean;
}

const DIR = "eval-data/uzlib";
const RUNS = join(DIR, "runs");
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
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

const NO_USAGE: Usage = { input: 0, cached: 0, output: 0 };
const NO_ANSWER = { answer: null, response: null, model: null, usage: null };

/** Band (429/5xx) yoki tarmoq xatosida 3 martagacha qayta uriniladi; boshqa xato darhol yoziladi */
async function ask(provider: Provider, model: string, effort: string, q: Q): Promise<Row> {
  const t0 = Date.now();
  let last = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(2000 * 2 ** attempt);
    try {
      const r = await provider.ask(model, effort, prompt(q));
      return { id: q.id, answer: extractAnswer(r.text), response: r.text?.slice(0, 2000) ?? null, model: r.model, usage: r.usage, ms: Date.now() - t0 };
    } catch (e) {
      const { status, fatal, message } = e as Partial<ApiError> & Error;
      last = message;
      if (fatal) return { ...NO_ANSWER, id: q.id, ms: Date.now() - t0, error: last, fatal };
      if (status && status !== 429 && status < 500) break;
    }
  }
  return { ...NO_ANSWER, id: q.id, ms: Date.now() - t0, error: last };
}

async function run() {
  const name = arg("provider") ?? "deepseek";
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Noma'lum provider: ${name} (bor: ${Object.keys(PROVIDERS).join(", ")})`);
  const model = arg("model") ?? provider.defaultModel;
  const effort = arg("effort") ?? "high";
  const concurrency = Number(arg("concurrency") ?? 8);
  const maxCost = Number(arg("max-cost") ?? 1);
  if (!(maxCost > 0)) throw new Error("--max-cost musbat son bo'lishi kerak");
  if (!env(provider.key)) throw new Error(`.env da ${provider.key} yo'q`);
  const qs = await questions();
  const limit = Number(arg("limit") ?? qs.length);
  // --limit: har safar bir xil, savollar bo'ylab teng taqsimlangan tanlov (birinchi N ta emas)
  const step = qs.length / Math.min(limit, qs.length);
  const pick = Array.from({ length: Math.min(limit, qs.length) }, (_, i) => qs[Math.floor(i * step)]);
  mkdirSync(RUNS, { recursive: true });
  const out = join(RUNS, `${name}__${model}__${effort}.jsonl`);
  const done = new Set(
    existsSync(out)
      ? readLines(out)
          .filter((r) => !r.error)
          .map((r) => r.id)
      : [],
  );
  const todo = pick.filter((q) => !done.has(q.id));
  console.log(`${name} ${model} (${effort}): ${pick.length} savol, ${done.size} tasi oldin bajarilgan, ${todo.length} tasi qoldi → ${out}`);
  if (costOf(model, NO_USAGE) === null) console.log(`  diqqat: ${model} narxi ro'yxatda yo'q, --max-cost ishlamaydi`);
  let n = 0;
  let spent = 0;
  let stop = "";
  const worker = async () => {
    for (let q = todo.shift(); q && !stop; q = todo.shift()) {
      const row = await ask(provider, model, effort, q);
      appendFileSync(out, JSON.stringify(row) + "\n");
      spent += row.usage ? (costOf(model, row.usage) ?? 0) : 0;
      if (row.fatal) stop = `kalit yoki balans xatosi — ${row.error}`;
      else if (spent >= maxCost) stop = `xarajat chegarasiga ($${maxCost}) yetdi`;
      if (++n % 25 === 0 || row.error) console.log(`  ${n} … ${row.error ? `xato ${q.id}: ${row.error}` : "ok"}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`Sarflandi: ~$${spent.toFixed(4)}${stop ? `\nTO'XTATILDI: ${stop}. Qayta ishga tushirilsa, qolganidan davom etadi` : ""}`);
  report();
}

function readLines(file: string): Row[] {
  const rows = readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Row);
  // Qayta urinishda bir savol ikki marta yozilishi mumkin: oxirgi xatosiz natija olinadi
  const by = new Map<string, Row>();
  for (const r of rows) if (!by.get(r.id) || !r.error) by.set(r.id, r);
  return [...by.values()];
}

/** Solishtirish fayli: leaderboard'ning saqlangan javoblari (extracted_answer) yoki o'zimizning runs/ fayli (answer, xatolarsiz) */
function answersOf(file: string): Map<string, string | null> {
  const rows = readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Row & { extracted_answer?: string | null });
  return new Map(rows.filter((r) => !r.error).map((r) => [r.id, r.extracted_answer ?? r.answer ?? null]));
}

function report() {
  const gold = new Map((JSON.parse(readFileSync(join(DIR, "correct_word.json"), "utf8")) as Q[]).map((q) => [q.id, q.answer]));
  const compare = arg("compare");
  const ref = compare ? answersOf(compare) : null;
  if (!existsSync(RUNS)) return console.log("Hali natija yo'q");
  for (const f of readdirSync(RUNS)
    .filter((x) => x.endsWith(".jsonl"))
    .sort()) {
    const all = readLines(join(RUNS, f)).filter((r) => gold.has(r.id));
    // Javob olinmagan savollar (429, tarmoq) noto'g'ri deb sanalmaydi: ular alohida ko'rsatiladi va keyin qayta so'raladi
    const failed = all.filter((r) => r.error);
    const rows = all.filter((r) => !r.error);
    const ok = rows.filter((r) => r.answer === gold.get(r.id)).length;
    const ci = wilson(ok, rows.length);
    const tokens = rows.reduce(
      (s, r) => ({ input: s.input + (r.usage?.input ?? 0), cached: s.cached + (r.usage?.cached ?? 0), output: s.output + (r.usage?.output ?? 0) }),
      NO_USAGE,
    );
    const [, model] = f.replace(/\.jsonl$/, "").split("__");
    const cost = costOf(model, tokens);
    const versions = [...new Set(rows.map((r) => r.model).filter(Boolean))];
    const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
    console.log(`\n${f}\n  to'g'ri: ${ok}/${rows.length} = ${ci.p.toFixed(4)} (95%: ${ci.lo.toFixed(3)}–${ci.hi.toFixed(3)})`);
    console.log(
      `  javobsiz: ${rows.filter((r) => !r.answer).length} · javob olinmagan (qayta so'raladi): ${failed.length}${failed[0] ? ` — ${failed[failed.length - 1].error?.slice(0, 80)}` : ""} · javob versiyasi: ${versions.join(", ") || "—"}`,
    );
    console.log(
      `  token: kirish ${tokens.input}, chiqish ${tokens.output}${cost !== null ? ` · narx ≤ $${cost.toFixed(3)}` : ""} · vaqt mediana ${((ms[ms.length >> 1] ?? 0) / 1000).toFixed(1)} s`,
    );
    if (ref) {
      const both = rows.filter((r) => ref.has(r.id));
      const a = both.filter((r) => r.answer === gold.get(r.id) && ref.get(r.id) !== gold.get(r.id)).length;
      const b = both.filter((r) => r.answer !== gold.get(r.id) && ref.get(r.id) === gold.get(r.id)).length;
      const refOk = both.filter((r) => ref.get(r.id) === gold.get(r.id)).length;
      console.log(
        `  solishtirish (${both.length} ta bir xil savol): ${basename(compare ?? "")} ${(refOk / both.length).toFixed(4)} · faqat bizda to'g'ri ${a}, faqat unda ${b} · McNemar p = ${mcnemar(a, b).toPrecision(2)}`,
      );
    }
  }
}

const cmd = process.argv[2];
if (cmd === "run") run().catch((e) => (console.error(e), process.exit(1)));
else if (cmd === "report") report();
else console.log("Ishlatish: pnpm eval:uzlib run|report [--provider= --model= --effort= --limit= --concurrency= --max-cost= --compare=]");
