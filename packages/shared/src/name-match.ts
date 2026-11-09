const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "s", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o", қ: "k", ғ: "g", ҳ: "h",
};

/** Bir xil eshitiladigan yozuvlarni bir ko'rinishga keltiradi: "Ғулом Xасанов" va "G'ulom Hasanov" bir xil bo'ladi */
export function nameTokens(name: string): string[] {
  const latin = name
    .normalize("NFKC") // «𝐘𝐚𝐬𝐦𝐢𝐧𝐚» -> «Yasmina»
    .toLowerCase()
    .replace(/['’‘ʻʼ`]/g, "")
    .replace(/[Ѐ-ӿ]/g, (c) => CYRILLIC[c] ?? c)
    .normalize("NFKD") // «Shahróza», «Şahzoda»: harf ustidagi belgilar olib tashlanadi (kirill harflari yuqorida almashgan)
    .replace(/\p{M}/gu, "")
    .replace(/dj/g, "j")
    .replace(/x/g, "h")
    .replace(/q/g, "k");
  return latin.split(/[^a-z]+/).filter(Boolean);
}

function editDistance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length]!;
}

function tokenSimilarity(a: string, b: string) {
  if (a === b) return 1;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  const edit = 1 - editDistance(a, b) / long.length;
  // Aziz va Azizbek: to'liq va qisqa ism
  return short.length >= 3 && long.startsWith(short) ? Math.max(edit, 0.85) : edit;
}

const MIN_TOKEN = 0.7;
/** Shu baho va undan yuqori bo'lsa, ustozga taklif qilinadi */
export const NAME_MATCH_THRESHOLD = 0.8;

/**
 * Ikki ismning o'xshashligi, 0..1. Ism-familiya tartibi ahamiyatsiz. Har bir so'z mos kelishi shart:
 * familiyasi bir xil, ismi boshqa odamlar (aka-uka) taklif qilinmaydi.
 */
export function nameMatchScore(a: string, b: string): number {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return 0;
  const pairs = left.flatMap((x, i) => right.map((y, j) => ({ i, j, s: tokenSimilarity(x, y) }))).sort((p, q) => q.s - p.s);
  const usedLeft = new Set<number>();
  const usedRight = new Set<number>();
  const best: number[] = [];
  for (const p of pairs) {
    if (usedLeft.has(p.i) || usedRight.has(p.j)) continue;
    usedLeft.add(p.i);
    usedRight.add(p.j);
    best.push(p.s);
  }
  if (best.some((s) => s < MIN_TOKEN)) return 0;
  const score = best.reduce((sum, s) => sum + s, 0) / best.length;
  // Bitta so'z (faqat ism) bilan solishtirilgan: ishonch kamroq
  return left.length !== right.length && best.length === 1 ? score * 0.85 : score;
}
