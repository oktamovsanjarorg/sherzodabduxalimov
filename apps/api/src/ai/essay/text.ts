export interface Sentence {
  id: string;
  text: string;
}
export interface Segmented {
  paragraphs: Sentence[][];
  sentences: Sentence[];
  numbered: string;
}

export function segment(text: string): Segmented {
  const paras = text
    .split(/\r?\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const paragraphs = paras.map((p, pi) =>
    p
      .split(/(?<=[.!?…]["»”)]*)\s+/u)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s, si) => ({ id: `${pi + 1}.${si + 1}`, text: s })),
  );
  const sentences = paragraphs.flat();
  const numbered = paragraphs.map((ss, pi) => `— ${pi + 1}-xatboshi —\n${ss.map((s) => `[${s.id}] ${s.text}`).join("\n")}`).join("\n\n");
  return { paragraphs, sentences, numbered };
}

/** Taqqoslash uchun: tutuq belgisining barcha ko'rinishlari bitta, katta-kichik harf va bo'shliqlar farqsiz */
export function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[ʻʼ‘’`´']/g, "'")
    .replace(/[«»“”„"]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Iqtibos matnda (berilgan gapda yoki butun matnda) haqiqatan bormi */
export function quoteFound(quote: string | null | undefined, seg: Segmented, sentenceId?: string | null): boolean {
  const q = norm(quote ?? "").replace(/^[\s.,;:!?"-]+|[\s.,;:!?"-]+$/g, "");
  if (q.length < 2) return false;
  const inS = sentenceId ? seg.sentences.find((s) => s.id === sentenceId) : undefined;
  if (inS && hasWhole(norm(inS.text), q)) return true;
  return hasWhole(norm(seg.sentences.map((s) => s.text).join(" ")), q);
}

/** So'z chegarasida topiladimi: "tezlashtirad" "tezlashtiradi" ichida topilmasligi kerak (to'qilgan imlo xatosi) */
function hasWhole(hay: string, q: string) {
  const letter = /[\p{L}\p{N}']/u;
  for (let at = hay.indexOf(q); at >= 0; at = hay.indexOf(q, at + 1)) {
    const before = hay[at - 1];
    const after = hay[at + q.length];
    const edgeL = !letter.test(q[0]) || !before || !letter.test(before);
    const edgeR = !letter.test(q[q.length - 1]) || !after || !letter.test(after);
    if (edgeL && edgeR) return true;
  }
  return false;
}

/** Vaziyat matnidan ko'chirilgan qism ulushi: esse 5 so'zli birikmalarining necha foizi vaziyatda bor */
export function copiedShare(prompt: string, text: string) {
  const words = (t: string) => norm(t).match(/[\p{L}\p{N}'-]+/gu) ?? [];
  const grams = (w: string[]) => w.slice(0, Math.max(0, w.length - 4)).map((_, i) => w.slice(i, i + 5).join(" "));
  const p = new Set(grams(words(prompt)));
  const t = grams(words(text));
  if (!t.length || !p.size) return 0;
  return t.filter((g) => p.has(g)).length / t.length;
}

/** O'zbek lotin matniga begona so'zlar (boshqa alifbo yoki boshqa til harflari); o'quvchi matnida bor so'z begona emas */
export function foreignWords(s: string, source: string): string[] {
  const src = source.toLowerCase();
  const words = s.match(/[\p{L}\p{M}ʻʼ]+/gu) ?? [];
  return words.filter((w) => /[^a-zA-Zʻʼ]/u.test(w) && !src.includes(w.toLowerCase()));
}

/**
 * Model ba'zan o'zbekcha yozayotib boshqa tilga (mo'g'ul, qozoq, turk) o'tib ketadi. Bunday satr bo'sh satrga almashtiriladi:
 * o'quvchi buzilgan matnni ko'rmasin, buzilgan iqtibos esa ballga kirmasin.
 */
export function scrub<T>(value: T, source: string): { value: T; dropped: number } {
  let dropped = 0;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return foreignWords(v, source).length ? (dropped++, "") : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { value: walk(value) as T, dropped };
}
