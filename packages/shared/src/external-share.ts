import { formatScore } from "./billing-types";
import type { ExternalTestDetail } from "./external-types";

/**
 * Offline test natijalarini tashqariga berish: kanal posti (rasm + matn) va o'quvchi kartasi.
 * Sof funksiyalar: admin rasm chizadi, testlar shu yerda.
 */

/** "Aliyev Vali Ahmad o'g'li" → "Aliyev V." Kanalda to'liq ism ko'rinmasin (ommaviy joy) */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

export interface LeaderRow {
  /** Natija id'si (ExternalResult) */
  id: string;
  /** O'rin: bir xil ball bir xil o'rin oladi (1, 2, 2, 4) */
  place: number;
  name: string;
  /** Asosiy ko'rsatkich: Milliy bo'lsa umumiy ball, aks holda foiz */
  value: string;
  /** Qo'shimcha: daraja yoki to'g'ri javoblar soni */
  extra: string | null;
  /** Milliy: essesi kiritilmagan, umumiy ball faqat testdan (essesi borlar bilan teng solishtirib bo'lmaydi) */
  noEssay: boolean;
}

/** Milliy testda essesi hali kiritilmagan natijalar soni */
export const missingEssays = (t: Pick<ExternalTestDetail, "rows">) => t.rows.filter((r) => r.testScore != null && r.essayScore == null).length;

type Row = ExternalTestDetail["rows"][number];

/** Milliy shkala bo'lsa umumiy ball (esse bilan), aks holda foiz bo'yicha */
export const isMilliy = (t: Pick<ExternalTestDetail, "rows">) => t.rows.some((r) => r.scaledScore != null);
const scoreOf = (r: Row, milliy: boolean) => (milliy ? (r.scaledScore ?? -1) : r.percent);

export function leaderboard(t: Pick<ExternalTestDetail, "rows" | "questionCount">, opts: { limit: number | null; short: boolean }): LeaderRow[] {
  const milliy = isMilliy(t);
  const sorted = [...t.rows].sort((a, b) => scoreOf(b, milliy) - scoreOf(a, milliy));
  const out: LeaderRow[] = [];
  for (const [i, r] of sorted.entries()) {
    const place = i > 0 && scoreOf(r, milliy) === scoreOf(sorted[i - 1], milliy) ? out[i - 1].place : i + 1;
    // Chegarada bir xil ballilar qolib ketmasin: limitdan keyin ham shu o'rindagilar kiradi
    if (opts.limit != null && place > opts.limit) break;
    const name = r.student?.name ?? r.name;
    const noEssay = milliy && r.testScore != null && r.essayScore == null;
    out.push({
      id: r.id,
      place,
      name: opts.short ? shortName(name) : name,
      value: milliy ? (r.scaledScore != null ? `${formatScore(r.scaledScore)} ball` : "—") : `${formatScore(r.percent)}%`,
      extra: noEssay ? "faqat test" : milliy ? (r.grade ?? null) : `${r.correct}/${t.questionCount}`,
      noEssay,
    });
  }
  return out;
}

const MEDAL = ["🥇", "🥈", "🥉"];

/** Kanal posti matni: rasm bilan birga yuboriladi. Uydirma gap yo'q: faqat natijadagi raqamlar */
export function channelCaption(
  t: Pick<ExternalTestDetail, "title" | "rows" | "questionCount" | "participants" | "avgPercent">,
  opts: { limit: number | null; short: boolean },
): string {
  const rows = leaderboard(t, { limit: Math.min(opts.limit ?? 3, 3), short: opts.short });
  const milliy = isMilliy(t);
  const scaled = t.rows.map((r) => r.scaledScore).filter((x): x is number => x != null);
  const avg =
    milliy && scaled.length
      ? `${formatScore(scaled.reduce((s, x) => s + x, 0) / scaled.length)} ball`
      : t.avgPercent != null
        ? `${formatScore(t.avgPercent)}%`
        : null;
  const lines = [`📊 «${t.title}» natijalari`, ""];
  for (const r of rows) lines.push(`${MEDAL[r.place - 1] ?? `${r.place}.`} ${r.name} — ${r.value}${milliy && r.extra ? ` (${r.extra})` : ""}`);
  lines.push("", `Qatnashchilar: ${t.participants} ta${avg ? ` · o'rtacha: ${avg}` : ""}`);
  const missing = missingEssays(t);
  if (milliy && missing) lines.push(`${missing} ta o'quvchining essesi hali baholanmagan: ularning bali faqat testdan`);
  else if (milliy) {
    const cert = t.rows.filter((r) => r.grade).length;
    if (cert) lines.push(`Sertifikat darajasiga yetganlar: ${cert} ta`);
  }
  lines.push("", "G'oliblarni tabriklaymiz! 👏");
  return lines.join("\n");
}
