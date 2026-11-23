import { ESSAY_RUBRIC, toGoldMarkup, type TextMark } from "@onatili/shared";
import { zipSync, strToU8 } from "fflate";
import type { GoldFiles } from "./gold-files";

export interface GoldExportEssay {
  id: string;
  topic: string;
  imageUrls: string[];
  transcript: string | null;
  marks: unknown;
  ratings: { raterId: string; scores: unknown; special: string | null }[];
}

const KEYS = ESSAY_RUBRIC.map((c) => c.key as string);

/**
 * docs/ESSAY_AI_EVAL.md formatidagi zip: gold/<eNNN>/{topic.txt, 1.jpg.., transcript.txt}, gold/scores.csv.
 * Ism va Telegram ma'lumoti kirmaydi: esse e001.., baholovchi U1, U2.. (har bir ustoz hamma joyda bir xil kod).
 */
export async function buildGoldZip(files: GoldFiles, essays: GoldExportEssay[]): Promise<{ zip: Uint8Array; essays: number; skippedMarks: number }> {
  const out: Record<string, Uint8Array> = {};
  const raters = new Map<string, string>();
  const rows = [["essay", "rater", ...KEYS, "special"].join(",")];
  let skippedMarks = 0;
  for (const [i, e] of essays.entries()) {
    const code = `e${String(i + 1).padStart(3, "0")}`;
    out[`gold/${code}/topic.txt`] = strToU8(e.topic + "\n");
    for (const [n, rel] of e.imageUrls.entries()) {
      const img = await files.read(rel);
      if (img) out[`gold/${code}/${n + 1}.${img.mime === "image/png" ? "png" : img.mime === "image/webp" ? "webp" : "jpg"}`] = img.data;
    }
    if (e.transcript) {
      const g = toGoldMarkup(e.transcript, (e.marks as TextMark[]) ?? []);
      skippedMarks += g.skipped;
      out[`gold/${code}/transcript.txt`] = strToU8(g.markup + "\n");
    }
    for (const r of e.ratings) {
      if (!raters.has(r.raterId)) raters.set(r.raterId, `U${raters.size + 1}`);
      const s = (r.scores ?? {}) as Record<string, number>;
      rows.push([code, raters.get(r.raterId), ...KEYS.map((k) => (r.special ? "" : String(s[k] ?? ""))), r.special ?? ""].join(","));
    }
  }
  out["gold/scores.csv"] = strToU8(rows.join("\n") + "\n");
  return { zip: zipSync(out, { level: 0 }), essays: essays.length, skippedMarks };
}
