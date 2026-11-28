import { formatScore, leaderboard, milliyTotal, type ExternalTestDetail, type LeaderRow } from "@onatili/shared";

/**
 * Natija rasmlari (PNG) brauzerda chiziladi: kanal uchun reyting va o'quvchi kartasi.
 * Avval baland "qoralama" kanvasga chiziladi, so'ng haqiqiy balandlikka qirqiladi.
 */
const W = 1080;
const PAD = 64;
const C = {
  page: "#f6f3ec",
  card: "#fffdf8",
  navy: "#0b3b36",
  mist: "#d7e6e1",
  gold: "#e9cf96",
  goldInk: "#7f5d1d",
  ink: "#15201d",
  ink3: "#5b6662",
  line: "#e4dccb",
  red: "#b42318",
};
const SANS = '"Manrope Variable", system-ui, sans-serif';
const SERIF = '"Fraunces Variable", Georgia, serif';
const PLACE = ["#e9cf96", "#d9dde0", "#e8c2a0"];

type Row = ExternalTestDetail["rows"][number];
type Ctx = CanvasRenderingContext2D;

async function fontsReady() {
  await Promise.all([document.fonts.load(`800 40px ${SANS}`), document.fonts.load(`600 40px ${SERIF}`)]).catch(() => undefined);
}

/** Sig'masa oxiri "…" bilan qisqartiriladi */
function fit(ctx: Ctx, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

function wrap(ctx: Ctx, text: string, max: number, lines: number) {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  if (out.length > lines) out.splice(lines - 1, out.length, fit(ctx, out.slice(lines - 1).join(" "), max));
  return out;
}

function text(ctx: Ctx, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
}

function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** Yuqori qism: to'q yashil fon, kichik yorliq, sarlavha (2 qatorgacha) va izoh. Pastki chegarasini qaytaradi */
function header(ctx: Ctx, label: string, title: string, sub: string) {
  ctx.font = `600 54px ${SERIF}`;
  const lines = wrap(ctx, title, W - PAD * 2, 2);
  const h = 200 + lines.length * 64;
  ctx.fillStyle = C.navy;
  ctx.fillRect(0, 0, W, h);
  text(ctx, label.toUpperCase(), PAD, 96, `800 24px ${SANS}`, C.gold);
  lines.forEach((l, i) => text(ctx, l, PAD, 170 + i * 64, `600 54px ${SERIF}`, "#ffffff"));
  text(ctx, sub, PAD, h - 44, `600 28px ${SANS}`, C.mist);
  return h;
}

function footer(ctx: Ctx, y: number) {
  ctx.fillStyle = C.line;
  ctx.fillRect(PAD, y, W - PAD * 2, 2);
  text(ctx, "Ona tili", PAD, y + 56, `600 30px ${SERIF}`, C.ink);
  return y + 96;
}

/** Qoralama kanvasda chizib, haqiqiy balandlikka qirqadi */
async function render(draw: (ctx: Ctx) => number): Promise<HTMLCanvasElement> {
  await fontsReady();
  const draft = document.createElement("canvas");
  draft.width = W;
  draft.height = 8000;
  const ctx = draft.getContext("2d");
  if (!ctx) throw new Error("Brauzer rasm chiza olmadi");
  ctx.fillStyle = C.page;
  ctx.fillRect(0, 0, W, draft.height);
  const h = Math.ceil(draw(ctx));
  const out = document.createElement("canvas");
  out.width = W;
  out.height = h;
  out.getContext("2d")?.drawImage(draft, 0, 0);
  return out;
}

/** Kanal uchun reyting rasmi. Juda uzun ro'yxat (8000 px dan oshsa) oxiri qirqiladi: shuning uchun «Top» tavsiya qilinadi */
export function leaderboardImage(t: ExternalTestDetail, rows: LeaderRow[], sub: string) {
  return render((ctx) => {
    let y = header(ctx, "Ona tili · natijalar", t.title, sub) + 32;
    for (const [i, r] of rows.entries()) {
      if (y > 7700) break;
      rounded(ctx, PAD, y, W - PAD * 2, 68, 16, i % 2 ? C.page : C.card);
      ctx.beginPath();
      ctx.arc(PAD + 44, y + 34, 24, 0, Math.PI * 2);
      ctx.fillStyle = PLACE[r.place - 1] ?? C.line;
      ctx.fill();
      text(ctx, String(r.place), PAD + 44, y + 44, `800 26px ${SANS}`, C.ink, "center");
      ctx.font = `800 30px ${SANS}`;
      const vw = ctx.measureText(r.value).width;
      text(ctx, r.value, W - PAD - 24, y + 45, `800 30px ${SANS}`, C.ink, "right");
      const ex = r.extra ? `${r.extra}  ` : "";
      ctx.font = `700 24px ${SANS}`;
      const ew = ctx.measureText(ex).width;
      if (ex) text(ctx, ex, W - PAD - 24 - vw - 12, y + 44, `700 24px ${SANS}`, r.noEssay ? C.ink3 : C.goldInk, "right");
      ctx.font = `700 30px ${SANS}`;
      text(ctx, fit(ctx, r.name, W - PAD * 2 - 140 - vw - ew), PAD + 88, y + 45, `700 30px ${SANS}`, C.ink);
      y += 76;
    }
    return footer(ctx, y + 24);
  });
}

function tiles(ctx: Ctx, y: number, items: [string, string][]) {
  const w = (W - PAD * 2 - 24 * (items.length - 1)) / items.length;
  items.forEach(([label, value], i) => {
    const x = PAD + i * (w + 24);
    rounded(ctx, x, y, w, 150, 20, C.card);
    text(ctx, label, x + w / 2, y + 50, `700 24px ${SANS}`, C.ink3, "center");
    text(ctx, value, x + w / 2, y + 116, `800 52px ${SANS}`, C.ink, "center");
  });
  return y + 150;
}

function line(ctx: Ctx, y: number, label: string, value: string, strong = false) {
  ctx.font = `${strong ? 800 : 600} 28px ${SANS}`;
  const vw = ctx.measureText(value).width;
  text(ctx, fit(ctx, label, W - PAD * 2 - vw - 32), PAD, y, ctx.font, strong ? C.ink : C.ink3);
  text(ctx, value, W - PAD, y, `${strong ? 800 : 700} 28px ${SANS}`, C.ink, "right");
  ctx.fillStyle = C.line;
  ctx.fillRect(PAD, y + 20, W - PAD * 2, 1);
  return y + 56;
}

const pts = (n: number | null | undefined) => (n != null ? n.toFixed(2).replace(".", ",") : "—");

/** O'quvchining natija kartasi: botda yo'q o'quvchiga yuborish yoki chop etish uchun */
export function resultCardImage(t: ExternalTestDetail, row: Row) {
  return render((ctx) => {
    const milliy = row.testScore != null;
    const f = milliyTotal(row.testScore, row.essayScore);
    // O'rin reytingdagidek: Milliy bo'lsa umumiy ball (esse bilan), aks holda foiz bo'yicha
    const place = leaderboard(t, { limit: null, short: false }).find((r) => r.id === row.id)?.place ?? row.rank;
    let y = header(ctx, `${t.title} · natija kartasi`, row.student?.name ?? row.name, `${t.participants} qatnashchidan ${place}-o'rin`) + 40;
    y = tiles(
      ctx,
      y,
      milliy
        ? [
            ["Umumiy ball", f.scaledScore != null ? formatScore(f.scaledScore) : "—"],
            ["Foiz", f.certPercent != null ? `${formatScore(f.certPercent)}%` : "—"],
            ["Daraja", f.grade ?? "—"],
          ]
        : [
            ["Foiz", `${formatScore(row.percent)}%`],
            ["To'g'ri", `${row.correct}/${t.questionCount}`],
            ["O'rin", `${place}`],
          ],
    );
    y += 80;
    if (row.sectionScores.length) {
      text(ctx, "Bo'limlar bo'yicha", PAD, y, `800 30px ${SANS}`, C.ink);
      y += 56;
      for (const s of row.sectionScores)
        y = line(ctx, y, `${s.title ?? "Bo'lim"} (${s.correct}/${s.max})`, milliy ? pts(s.points) : `${formatScore(s.percent)}%`);
    }
    if (row.testScore != null) {
      y = line(ctx, y, "Test natijasi", formatScore(row.testScore), true);
      const essay = f.essay75 != null && row.essayScore != null ? `${formatScore(f.essay75)} (esse ${formatScore(row.essayScore)}/24)` : "kiritilmagan";
      y = line(ctx, y, "Yozma savodxonlik", essay, true);
    } else y = line(ctx, y, "To'g'ri · xato · bo'sh", `${row.correct} · ${row.wrong} · ${row.blank}`, true);
    const wrong = [...row.answers].flatMap((x, j) => (x === "c" ? [] : [j + 1]));
    if (wrong.length) {
      y += 24;
      text(ctx, `Xato yoki bo'sh savollar (${wrong.length} ta)`, PAD, y, `800 26px ${SANS}`, C.red);
      ctx.font = `600 26px ${SANS}`;
      for (const l of wrap(ctx, wrong.join(", "), W - PAD * 2, 6)) text(ctx, l, PAD, (y += 42), ctx.font, C.ink3);
    }
    return footer(ctx, y + 48);
  });
}

/** Telefonda: ulashish oynasi (Telegram'ga to'g'ridan). Kompyuterda: fayl yuklanadi */
export async function saveImage(canvas: HTMLCanvasElement, fileName: string) {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("Rasmni tayyorlab bo'lmadi");
  const file = new File([blob], fileName, { type: "image/png" });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Fayl nomi uchun: lotin harf va raqam */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ʻʼ'`‘’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "natija";
