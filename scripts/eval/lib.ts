/**
 * O'lchash uchun umumiy funksiyalar: javobni ajratish (UzLiB bilan bir xil), ishonch oralig'i, juft solishtirish.
 */

/** UzLiB run_uzlib.py dagi extract_answer ning aynan ko'chirmasi: natija leaderboard bilan solishtiriladigan bo'lsin */
export function extractAnswer(text: string | null | undefined): string | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const t = text.replaceAll("**", "");
  const patterns = [
    /^\s*([ABCD])\s*$/i,
    /javob:\s*([ABCD])\)/i,
    /javob\s*([ABCD])\)/i,
    /variant:?\s*([ABCD])\)/i,
    /([ABCD])\).*to'g'ri/i,
    /([ABCD])\)./i,
    /\s([ABCD])\s.*to'g'ri/i,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) return m[1].toUpperCase();
  }
  // Python'dagi \b Unicode harflarni hisobga oladi (JS'dagi faqat ASCII): shuning uchun chegara qo'lda
  const s = t.match(/(?<![\p{L}\p{N}_])([ABCD])(?![\p{L}\p{N}_])/u);
  return s ? s[1].toUpperCase() : null;
}

/** Ulush uchun 95% Wilson ishonch oralig'i */
export function wilson(k: number, n: number, z = 1.96) {
  if (!n) return { p: 0, lo: 0, hi: 0 };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

/**
 * Bir xil savollarda ikki natijani juft solishtirish (aniq McNemar testi).
 * b — faqat A to'g'ri topgan savollar, c — faqat B to'g'ri topganlar. p — ikki tomonlama.
 */
export function mcnemar(b: number, c: number) {
  const n = b + c;
  if (!n) return 1;
  const k = Math.min(b, c);
  // log-fazoda: n katta bo'lsa 2^n va binom koeffitsiyenti toshib ketmasin
  let logC = 0;
  let tail = 0;
  for (let i = 0; i <= k; i++) {
    if (i > 0) logC += Math.log(n - i + 1) - Math.log(i);
    tail += Math.exp(logC - n * Math.LN2);
  }
  return Math.min(1, 2 * tail);
}
