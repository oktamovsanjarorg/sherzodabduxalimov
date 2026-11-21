/**
 * Esse AI tekshiruvini bazasiz, bitta esse ustida sinash (prompt yoki model o'zgarganda sifatni ko'rish uchun).
 * Ishlatish: pnpm essay:try <mavzu.txt> <esse.txt> [--effort=off|low|high|max] [--model=deepseek-v4-pro]
 * .env da DEEPSEEK_API_KEY bo'lishi kerak. Natija ekranga va <esse.txt>.result.json ga yoziladi.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { ESSAY_RUBRIC } from "@onatili/shared";
import type { Effort } from "../apps/api/src/ai/deepseek";
import { gradeEssayDeepSeek } from "../apps/api/src/ai/essay/grade";

const [topicFile, textFile] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--"));
const flag = (k: string) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const apiKey = process.env.DEEPSEEK_API_KEY?.split("#")[0].trim();
if (!topicFile || !textFile)
  throw new Error("Ishlatish: pnpm essay:try <mavzu.txt> <esse.txt>");
if (!apiKey) throw new Error(".env da DEEPSEEK_API_KEY yo'q");

async function main() {
  const r = await gradeEssayDeepSeek({
    apiKey,
    model:
      flag("model") ??
      process.env.DEEPSEEK_ESSAY_MODEL?.split("#")[0].trim() ??
      "deepseek-v4-pro",
    effort: (flag("effort") ??
      process.env.DEEPSEEK_ESSAY_EFFORT?.split("#")[0].trim() ??
      "high") as Effort,
    topic: readFileSync(topicFile, "utf8").trim(),
    text: readFileSync(textFile, "utf8").trim(),
  });
  writeFileSync(`${textFile}.result.json`, JSON.stringify(r, null, 2));

  const total = r.criteria.reduce((s, c) => s + c.score, 0);
  console.log(
    r.special ? `Tekshirilmaydi: ${r.special}` : `Jami: ${total} / 24`,
  );
  for (const c of r.criteria)
    console.log(
      `\n${ESSAY_RUBRIC.find((x) => x.key === c.key)?.label}: ${c.score}\n  ${c.comment ?? ""}`,
    );
  console.log(`\nTaqriz:\n${r.feedback}`);
  console.log(`\nXatolar (${r.mistakes.length}):`);
  for (const m of r.mistakes)
    console.log(
      `  [${m.type}] «${m.wrong}» → «${m.right}»${m.note ? ` — ${m.note}` : ""}`,
    );
  console.log(`\nTavsiyalar:`);
  for (const t of r.tips)
    console.log(
      `  • (${t.focus ?? "-"}) ${t.text}${t.example ? `\n    Namuna: ${t.example}` : ""}`,
    );
  const a = r.analysis as
    | { seconds?: object; rejectedByVerifier?: number; droppedQuotes?: number }
    | undefined;
  console.log(
    `\nVaqt: ${JSON.stringify(a?.seconds)} · tekshiruvchi rad etdi: ${a?.rejectedByVerifier ?? 0} · matnda topilmagan iqtibos: ${a?.droppedQuotes ?? 0}`,
  );
  console.log(`To'liq natija: ${textFile}.result.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
