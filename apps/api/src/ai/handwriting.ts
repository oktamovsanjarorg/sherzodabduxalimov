/** Qo'lyozma bilan ishlash: provayderga bog'liq bo'lmagan ko'rsatmalar va javobni o'qish */

export const OCR_PROMPT = `Bu rasmlarda o'quvchining qo'lda (ruchka bilan) yozgan o'zbek tilidagi essesi bor. Varoqlar tartib bilan berilgan.
Vazifang: matnni AYNAN yozilganidek, so'zma-so'z ko'chirib ber.
- Imlo, tinish belgisi va grammatik xatolarni TUZATMA: ular baholanadi, o'quvchi qanday yozgan bo'lsa shunday qoldir.
- Sen korrektor emas, NUSXA ko'chiruvchisan. Har bir so'zni harfma-harf ko'chir: o' o'rniga u, q o'rniga k, g' o'rniga g, x o'rniga h yozilgan, vergul yoki harf tushib qolgan bo'lsa, aynan shunday qoldir. Yozib bo'lgach har bir so'zni rasmdagi harflar bilan qayta solishtir va beixtiyor tuzatganingni asliga qaytar.
- Lotin yozuvida yoz (o', g', sh, ch belgilarini o'quvchi yozgandek).
- Xatboshilarni saqla. O'chirilgan (ustidan chizilgan) so'zlarni yozma.
- O'qib bo'lmaydigan so'z o'rniga [?] qo'y.
- Rasmda esse bo'lmasa, faqat NO_ESSAY deb yoz.
Javobda faqat esse matni bo'lsin, boshqa hech qanday izoh yozma.`;

export interface LocatedPhrase {
  /** So'rovdagi tartib raqami */
  i: number;
  /** Varoq (0 dan) */
  page: number;
  /** [ymin, xmin, ymax, xmax], 0..1000 */
  box: [number, number, number, number];
}

export function locatePrompt(pages: number, phrases: string[]): string {
  const list = phrases.map((p, i) => `${i}: "${p}"`).join("\n");
  return `Rasmlarda o'quvchining qo'lda yozgan o'zbekcha essesi bor (${pages} ta varoq, tartib bilan, 0 dan boshlab).
Quyidagi so'z yoki iboralarning har birini qo'lyozmadan top (xatolari bilan yozilgan bo'lishi mumkin, aynan shunday qidir):
${list}
Har biri uchun bitta joy: matndagi BIRINCHI uchragan o'rni. Ramka faqat shu so'z(lar)ni qamrab olsin, butun qatorni emas.
Javob faqat JSON: {"found": [{"i": 0, "page": 0, "box_2d": [ymin, xmin, ymax, xmax]}]} — koordinatalar 0..1000 (shu varoq o'lchamiga nisbatan).
Topa olmaganingni javobga kiritma.`;
}

/** Javobdagi to'g'ri ramkalar; noto'g'rilari tashlanadi, o'qib bo'lmaydigan javob — bo'sh ro'yxat */
export function parseLocated(raw: string, pages: number, phrases: number): LocatedPhrase[] {
  let json: unknown;
  try {
    json = JSON.parse(raw.replace(/^```(json)?|```$/g, "").trim());
  } catch {
    return [];
  }
  const arr = Array.isArray(json) ? json : (json as { found?: unknown } | null)?.found;
  if (!Array.isArray(arr)) return [];
  const out: LocatedPhrase[] = [];
  for (const x of arr as { i?: unknown; page?: unknown; box_2d?: unknown }[]) {
    const b = x.box_2d;
    if (typeof x.i !== "number" || !Array.isArray(b) || b.length !== 4 || !b.every((v) => typeof v === "number" && v >= 0 && v <= 1000)) continue;
    const page = typeof x.page === "number" ? x.page : 0;
    if (x.i < 0 || x.i >= phrases || page < 0 || page >= pages) continue;
    const [ymin, xmin, ymax, xmax] = b as number[];
    if (ymax <= ymin || xmax <= xmin) continue;
    out.push({ i: x.i, page, box: [ymin, xmin, ymax, xmax] });
  }
  return out;
}
