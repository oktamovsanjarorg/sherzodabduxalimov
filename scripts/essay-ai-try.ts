/**
 * Esse AI tekshiruvini bazasiz, bitta esse ustida sinash (prompt yoki model o'zgarganda sifatni ko'rish uchun).
 * Ishlatish: pnpm essay:try <mavzu.txt> <esse.txt>
 * Modellar .env dan olinadi (OPENAI_*, DEEPSEEK_*), prod bilan bir xil. Natija ekranga va <esse.txt>.result.json ga yoziladi.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { ESSAY_RUBRIC } from "@onatili/shared";
import { essayAi } from "../apps/api/src/ai/essay/setup";
import { loadEnv } from "../apps/api/src/config/env";

const [topicFile, textFile] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!topicFile || !textFile) throw new Error("Ishlatish: pnpm essay:try <mavzu.txt> <esse.txt>");

async function main() {
  const ai = essayAi(loadEnv());
  if (!ai) throw new Error(".env da AI_PROVIDER=deepseek va DEEPSEEK_API_KEY kerak");
  const r = await ai.grade(readFileSync(topicFile, "utf8").trim(), readFileSync(textFile, "utf8").trim(), false);
  writeFileSync(`${textFile}.result.json`, JSON.stringify(r, null, 2));

  const total = r.criteria.reduce((s, c) => s + c.score, 0);
  console.log(r.special ? `Tekshirilmaydi: ${r.special}` : `Jami: ${total} / 24`);
  for (const c of r.criteria) console.log(`\n${ESSAY_RUBRIC.find((x) => x.key === c.key)?.label}: ${c.score}\n  ${c.comment ?? ""}`);
  console.log(`\nTaqriz:\n${r.feedback}`);
  console.log(`\nXatolar (${r.mistakes.length}):`);
  for (const m of r.mistakes) console.log(`  [${m.type}] «${m.wrong}» → «${m.right}»${m.note ? ` — ${m.note}` : ""}`);
  console.log(`\nTavsiyalar:`);
  for (const t of r.tips) console.log(`  • (${t.focus ?? "-"}) ${t.text}${t.example ? `\n    Namuna: ${t.example}` : ""}`);
  const a = r.analysis as
    { model?: string; verifier?: { model: string; status: string }; seconds?: object; rejectedByVerifier?: number; droppedQuotes?: number } | undefined;
  console.log(
    `\nModel: ${a?.model} · tekshiruvchi: ${a?.verifier?.model} (${a?.verifier?.status})\nVaqt: ${JSON.stringify(a?.seconds)} · tekshiruvchi rad etdi: ${a?.rejectedByVerifier ?? 0} · matnda topilmagan iqtibos: ${a?.droppedQuotes ?? 0}`,
  );
  console.log(`To'liq natija: ${textFile}.result.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
