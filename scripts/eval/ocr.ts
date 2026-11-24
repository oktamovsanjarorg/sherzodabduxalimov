/**
 * Qo'lyozma o'qishni o'lchash: sinov to'plamidagi varoqlar (docs/ESSAY_AI_EVAL.md) prodda ishlatiladigan prompt bilan o'qiladi
 * va ustoz aynan ko'chirgan matn bilan solishtiriladi. Faqat o'quvchi roziligi bilan qo'shilgan esselar.
 *
 *   pnpm eval:ocr run --provider=openai --model=gpt-6-luna --effort=medium [--only=e001,e002] [--max-cost=0.5]
 *   pnpm eval:ocr run --provider=deepseek --model=deepseek-flash --effort=high
 *   pnpm eval:ocr report
 *   pnpm eval:ocr check --provider=openai --image=<fayl>   # bitta rasm: ulanish va formatni tekshirish, natija saqlanmaydi
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OCR_PROMPT } from "../../apps/api/src/ai/handwriting";
import { cerWer, ocrErrorFidelity, parseTranscript } from "./metrics";
import { type ApiError, costOf, env, type Image, PROVIDERS, type Usage } from "./providers";

const DIR = "eval-data/gold";
const RUNS = join(DIR, "runs", "ocr");
const IMG = /\.(jpe?g|png|webp)$/i;
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

interface OcrRow {
  essay: string;
  text: string;
  model: string | null;
  usage: Usage | null;
  ms: number;
}

function loadImage(file: string): Image {
  const data = readFileSync(file);
  return { mime: data[0] === 0x89 ? "image/png" : data[0] === 0x52 ? "image/webp" : "image/jpeg", data };
}

const pagesOf = (essay: string) =>
  readdirSync(join(DIR, essay))
    .filter((f) => IMG.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => join(DIR, essay, f));

/** Rasmi ham, ustoz ko'chirgan matni ham bor esselar */
function essays(): string[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "runs" && existsSync(join(DIR, d.name, "transcript.txt")) && pagesOf(d.name).length > 0)
    .map((d) => d.name)
    .sort();
}

function setup() {
  const name = arg("provider") ?? "openai";
  const provider = PROVIDERS[name];
  if (!provider?.vision) throw new Error(`Rasm o'qiydigan provider emas: ${name}`);
  if (!env(provider.key)) throw new Error(`.env da ${provider.key} yo'q`);
  const model = arg("model") ?? provider.vision;
  return { name, provider, model, effort: arg("effort") ?? "medium" };
}

async function run() {
  const { name, provider, model, effort } = setup();
  const maxCost = Number(arg("max-cost") ?? 0.5);
  if (!(maxCost > 0)) throw new Error("--max-cost musbat son bo'lishi kerak");
  const only = arg("only")?.split(",");
  const list = essays().filter((e) => !only || only.includes(e));
  if (!list.length) throw new Error(`${DIR} da rasmli va ko'chirilgan esse yo'q. Admin > Esselar > Sinov to'plami > eksport`);
  const out = join(RUNS, `${name}__${model}__${effort}`);
  mkdirSync(out, { recursive: true });
  let spent = 0;
  for (const essay of list) {
    const file = join(out, `${essay}.json`);
    if (existsSync(file)) continue;
    const t0 = Date.now();
    try {
      const r = await provider.ask(model, effort, OCR_PROMPT, pagesOf(essay).map(loadImage));
      const row: OcrRow = { essay, text: r.text ?? "", model: r.model, usage: r.usage, ms: Date.now() - t0 };
      writeFileSync(file, JSON.stringify(row, null, 1));
      spent += r.usage ? (costOf(model, r.usage) ?? 0) : 0;
      console.log(`  ${essay} ok (${(row.ms / 1000).toFixed(1)} s)`);
    } catch (e) {
      const { fatal, message } = e as Partial<ApiError> & Error;
      console.log(`  ${essay} xato: ${message}`);
      if (fatal) break;
    }
    if (spent >= maxCost) {
      console.log(`TO'XTATILDI: xarajat chegarasiga ($${maxCost}) yetdi`);
      break;
    }
  }
  console.log(`Sarflandi: ~$${spent.toFixed(4)}`);
  report();
}

const readRun = (dir: string) =>
  readdirSync(join(RUNS, dir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(RUNS, dir, f), "utf8")) as OcrRow);

/** Model esseni umuman o'qimagan: bo'sh javob yoki prompt bo'yicha NO_ESSAY */
const unread = (r: OcrRow) => !r.text.trim() || /^NO_ESSAY\W*$/.test(r.text.trim());

function reportRun(dir: string, all: OcrRow[]) {
  const rows = all.filter((r) => !unread(r));
  const skipped = all.filter(unread).map((r) => r.essay);
  const note = skipped.length ? ` · O'QILMADI (NO_ESSAY/bo'sh): ${skipped.length} — ${skipped.join(", ")}` : "";
  if (!rows.length) return console.log(`\n${dir}: 0 ta esse o'qildi${note}`);
  const model = dir.split("__")[1];
  let cer = 0;
  let wer = 0;
  const fid = { kept: 0, corrected: 0, unclear: 0 };
  for (const r of rows) {
    const g = parseTranscript(readFileSync(join(DIR, r.essay, "transcript.txt"), "utf8"));
    const m = cerWer(g.text, r.text);
    cer += m.cer;
    wer += m.wer;
    const f = ocrErrorFidelity(g.errors, r.text);
    fid.kept += f.kept;
    fid.corrected += f.corrected;
    fid.unclear += f.unclear;
  }
  const cost = all.reduce((s, r) => s + (r.usage ? (costOf(model, r.usage) ?? 0) : 0), 0);
  console.log(
    `\n${dir}: ${rows.length} ta esse · CER ${pct(cer / rows.length)} · WER ${pct(wer / rows.length)} · $${(cost / all.length).toFixed(4)}/esse${note}`,
  );
  console.log(`  o'quvchi xatolari: saqlandi ${fid.kept}, O'QISHDA TUZATIB YUBORILDI ${fid.corrected}, noaniq ${fid.unclear}`);
}

function report() {
  const dirs = existsSync(RUNS) ? readdirSync(RUNS).sort() : [];
  const all = dirs.map((d) => ({ dir: d, rows: readRun(d) })).filter((x) => x.rows.length);
  if (!all.length) return console.log("Hali natija yo'q");
  const n = Math.min(...all.map((x) => x.rows.length));
  if (n < 30) console.log(`⚠ Eng kamida ${n} ta esse: bu raqamlardan xulosa chiqarmang (kamida 30, maqsad 50).`);
  for (const x of all) reportRun(x.dir, x.rows);
  // Ikki model bir xil varoqni qanchalik turlicha o'qigani: ustozga ko'rsatiladigan shubhali so'zlar ulushi
  for (const [i, a] of all.entries())
    for (const b of all.slice(i + 1)) {
      const by = new Map(b.rows.filter((r) => !unread(r)).map((r) => [r.essay, r.text]));
      const wers = a.rows.filter((r) => !unread(r)).flatMap((r) => (by.has(r.essay) ? [cerWer(r.text, by.get(r.essay) ?? "").wer] : []));
      if (wers.length) console.log(`\n${a.dir} va ${b.dir}: so'zlar farqi ${pct(wers.reduce((s, x) => s + x, 0) / wers.length)} (${wers.length} ta esse)`);
    }
}

async function check() {
  const { provider, model, effort } = setup();
  const image = arg("image");
  if (!image) throw new Error("--image=<fayl> kerak");
  const t0 = Date.now();
  const r = await provider.ask(model, effort, OCR_PROMPT, [loadImage(image)]);
  console.log(
    `model: ${r.model} · ${((Date.now() - t0) / 1000).toFixed(1)} s · token ${JSON.stringify(r.usage)} · $${(r.usage ? (costOf(model, r.usage) ?? 0) : 0).toFixed(5)}`,
  );
  console.log(r.text ?? "(javob yo'q)");
}

const fail = (e: unknown) => {
  console.error(e);
  process.exit(1);
};
const cmd = process.argv[2];
if (cmd === "run") run().catch(fail);
else if (cmd === "check") check().catch(fail);
else if (cmd === "report") report();
else console.log("Ishlatish: pnpm eval:ocr run|check|report [--provider= --model= --effort= --only= --max-cost= --image=]");
