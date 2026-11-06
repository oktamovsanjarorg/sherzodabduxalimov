import type { PrismaClient } from "@onatili/db";
import { ESSAY_MAX_SCORE, ESSAY_SPECIAL, NO_ESSAY_ERROR, type EssayAnnotations, type PageAnnotations, type TextMark, countWords, isMostlyCyrillic, rubricScore, type EssaySpecialKey } from "@onatili/shared";
import type { AiEssayResult } from "../ai/deepseek";
import type { SendFn } from "../billing/reminders";
import { esc } from "../notify/telegram";

export type GradeFn = (topic: string, text: string, handwritten: boolean) => Promise<AiEssayResult>;
/** Varoq rasmlarini matnga aylantiradi (nisbiy yo'llar: essays/<id>/<n>.jpg) */
export type ReadFn = (imagePaths: string[]) => Promise<string>;
/** Xato iboralarning varoqdagi joyi: [ymin, xmin, ymax, xmax] 0..1000 */
export type LocateFn = (imagePaths: string[], phrases: string[]) => Promise<{ i: number; page: number; box: [number, number, number, number] }[]>;

/**
 * AI topgan xatolarni ustoz belgilari formatiga o'giradi:
 * qo'lyozmada — so'z tagiga qizil chiziq va ustida "Imlo: to'g'risi" yorlig'i; yozilgan matnda — matndagi o'rni.
 */
export async function aiAnnotations(
  mistakes: AiEssayResult["mistakes"],
  opts: { pages: string[]; text: string | null; locate?: LocateFn },
): Promise<EssayAnnotations | null> {
  if (!mistakes.length) return null;
  if (opts.pages.length && opts.locate) {
    const found = await opts.locate(opts.pages, mistakes.map((m) => m.wrong)).catch(() => []);
    if (!found.length) return null;
    const pages: PageAnnotations[] = opts.pages.map(() => ({ strokes: [], marks: [] }));
    for (const f of found) {
      const m = mistakes[f.i];
      const [ymin, xmin, ymax, xmax] = f.box.map((v) => v / 1000);
      const y = Math.min(1, ymax + 0.004);
      pages[f.page].strokes.push({ tool: "pen", width: 0.003, points: [[xmin, y], [xmax, y]] });
      pages[f.page].marks.push({ x: xmin, y: ymin, type: m.type, note: m.right.slice(0, 120) || null });
    }
    return { pages, text: [] };
  }
  if (opts.text) {
    const marks: TextMark[] = [];
    const lower = opts.text.toLowerCase();
    for (const m of mistakes) {
      let at = opts.text.indexOf(m.wrong);
      if (at < 0) at = lower.indexOf(m.wrong.toLowerCase());
      if (at < 0) continue;
      const end = at + m.wrong.length;
      if (marks.some((x) => x.start < end && at < x.end)) continue;
      marks.push({ start: at, end, type: m.type, note: m.right.slice(0, 120) || null });
    }
    return marks.length ? { pages: [], text: marks } : null;
  }
  return null;
}

export { NO_ESSAY_ERROR };

/** Tekshirilmaydigan holatlar uchun tayyor tavsiyalar */
const SPECIAL_TIPS: Partial<Record<EssaySpecialKey, AiEssayResult["tips"]>> = {
  TOO_SHORT: [
    { focus: "parts", text: "Kamida 100 so'z yozing: kirish (2–3 gap), asosiy qism (ikki qarash va shaxsiy fikr, dalillar bilan) va xulosa (2–3 gap).", example: null },
    { focus: "evidence", text: "Har bir qarashni bitta hayotiy misol yoki dalil bilan asoslang — bu ham hajmni, ham mazmunni oshiradi.", example: null },
  ],
  CYRILLIC: [{ focus: "spelling", text: "Esse faqat lotin yozuvida yozilishi shart: to'liq kirillcha esse tekshirilmaydi va 0 ball oladi.", example: null }],
  OFF_TOPIC: [{ focus: "views", text: "Topshiriqdagi vaziyatni diqqat bilan o'qing va asosiy qism hamda xulosada aynan shu vaziyat haqida fikr yuriting.", example: null }],
  COPIED: [{ focus: "style", text: "Vaziyat matnini yoki boshqa manbani ko'chirmang: fikrlarni o'z so'zlaringiz bilan bayon qiling.", example: null }],
  ONLY_INTRO: [{ focus: "parts", text: "Kirishdan keyin asosiy qism (ikki qarash, shaxsiy fikr, dalillar) va xulosani ham yozing.", example: null }],
};

/** Bitta esseni AI bilan baholaydi va natijani saqlaydi. Worker chaqiradi; testda grade soxta bo'ladi. */
export async function gradeEssayJob(prisma: PrismaClient, essayId: string, grade: GradeFn, send: SendFn, miniAppUrl: string | undefined, read?: ReadFn, locate?: LocateFn) {
  const e = await prisma.essay.findUnique({ where: { id: essayId }, include: { user: { select: { telegramId: true } } } });
  if (!e || e.status !== "AI_CHECKING") return null; // o'chirilgan yoki allaqachon tekshirilgan
  const handwritten = e.imageUrls.length > 0;
  let text = e.text;
  if (!text && handwritten) {
    if (!read) throw new Error("Qo'lyozmani o'qish sozlanmagan");
    const got = (await read(e.imageUrls)).trim();
    if (!got || /^NO_ESSAY\b/.test(got) || (got.match(/\S+/g)?.length ?? 0) < 15) {
      await prisma.essay.updateMany({ where: { id: essayId, status: "AI_CHECKING" }, data: { status: "AI_FAILED", error: NO_ESSAY_ERROR } });
      return null;
    }
    text = got;
    // O'qilgan matn saqlanadi: qayta urinishda yana o'qilmaydi, o'quvchi va ustoz ham ko'radi
    await prisma.essay.update({ where: { id: essayId }, data: { text } });
  }
  if (!text) return null;

  // Mezon: to'liq kirillcha -> 0; 100 so'zdan kam -> 2 (tekshirilmaydi). Buni AI emas, server aniq hisoblaydi
  const auto: EssaySpecialKey | null = isMostlyCyrillic(text) ? "CYRILLIC" : countWords(text) < 100 ? "TOO_SHORT" : null;
  const r = auto
    ? {
        special: auto,
        criteria: [],
        feedback: `${ESSAY_SPECIAL[auto].label}: mezon bo'yicha esse tekshirilmaydi va ${ESSAY_SPECIAL[auto].score} ball bilan baholanadi.${auto === "TOO_SHORT" ? ` Matningizda ${countWords(text)} ta so'z bor, kamida 100 ta kerak.` : ""}`,
        mistakes: [],
        tips: SPECIAL_TIPS[auto] ?? [],
      }
    : await grade(e.prompt, text, handwritten);
  const special = (r.special ?? null) as EssaySpecialKey | null;
  const scored = rubricScore(special, r.criteria);
  const criteria = scored.criteria.map((c) => ({ ...c, comment: r.criteria.find((x) => x.key === c.key)?.comment ?? null }));
  const total = scored.total;
  // Xatolarni varoqda (yoki matnda) belgilash — topilmasa ham baho saqlanadi
  const annotations = await aiAnnotations(r.mistakes, { pages: handwritten ? e.imageUrls : [], text: handwritten ? null : text, locate }).catch(() => null);
  // Holat va baho bitta tranzaksiyada: biri saqlanib, ikkinchisi saqlanmay qolishi (bahosiz "tekshirildi") mumkin emas
  const saved = await prisma.$transaction(async (tx) => {
    const { count } = await tx.essay.updateMany({ where: { id: essayId, status: "AI_CHECKING" }, data: { status: "AI_CHECKED", error: null } });
    if (!count) return false;
    await tx.essayReview.create({
      data: {
        essayId,
        source: "AI",
        provider: "deepseek",
        criteria,
        special,
        mistakes: r.mistakes,
        tips: r.tips.length ? r.tips : (special ? SPECIAL_TIPS[special] : undefined) ?? undefined,
        annotations: annotations ?? undefined,
        totalScore: total,
        feedback: r.feedback || null,
      },
    });
    return true;
  });
  if (!saved) return null;
  if (e.user.telegramId !== null) await send(
    e.user.telegramId,
    `🤖 <b>AI essengizni tekshirdi</b>\n«${esc(e.prompt.slice(0, 80))}»\nTaxminiy ball: <b>${total} / ${ESSAY_MAX_SCORE}</b>`,
    miniAppUrl ? { text: "Natija va xatolarni ko'rish", webAppUrl: `${miniAppUrl.replace(/\/$/, "")}/essays/${essayId}` } : undefined,
  );
  return total;
}

/** Barcha urinishlar tugadi: o'quvchi qayta urinishi mumkin (bugungi limitga hisoblanmaydi) */
export async function markEssayFailed(prisma: PrismaClient, essayId: string, message: string) {
  console.error(`[essay-ai] ${essayId}: ${message}`);
  await prisma.essay.updateMany({ where: { id: essayId, status: "AI_CHECKING" }, data: { status: "AI_FAILED", error: null } });
}
