/** Test baholash va tartiblash: toza funksiyalar, DB'ga bog'liq emas. */

export interface GradableQuestion {
  type: "SINGLE" | "MULTIPLE" | "MATCHING" | "TEXT";
  correctText: string | null;
  options: { id: string; isCorrect: boolean }[];
}

export interface GivenAnswer {
  optionIds: string[];
  textAnswer: string | null;
}

/**
 * O'zbek lotin yozuvidagi tutuq belgisi turlicha yoziladi: ' ` ‘ ’ ʻ ʼ.
 * Taqqoslashdan oldin hammasini bitta belgiga keltiramiz,
 * bo'sh joylarni siqamiz va harflarni kichiklashtiramiz.
 */
export function normalizeUz(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[`‘’ʻʼ´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,!?;:]+$/g, "")
    .trim();
}

export function isAnswerCorrect(q: GradableQuestion, a: GivenAnswer | undefined): boolean {
  if (!a) return false;
  switch (q.type) {
    case "SINGLE":
    case "MULTIPLE": {
      const correct = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id));
      const given = new Set(a.optionIds);
      if (correct.size === 0 || given.size !== correct.size) return false;
      for (const id of given) if (!correct.has(id)) return false;
      return true;
    }
    case "TEXT": {
      if (!q.correctText || !a.textAnswer) return false;
      // Bir nechta to'g'ri variant "|" bilan ajratiladi: "oʻn besh|15"
      const variants = q.correctText.split("|").map(normalizeUz).filter(Boolean);
      return variants.includes(normalizeUz(a.textAnswer));
    }
    default:
      return false; // MATCHING keyingi bosqichda
  }
}

/** Satrdan barqaror 32-bit seed (FNV-1a) */
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: kichik, tez, deterministik PRNG */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministik aralashtirish: bitta urinish (seed) uchun har safar bir xil tartib chiqadi.
 * Shuning uchun tartibni DB'da saqlash shart emas, sahifa yangilansa ham savollar joyida qoladi.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const rand = rng(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Muddat o'tgandan keyin tarmoq kechikishi uchun ruxsat etilgan qo'shimcha vaqt */
export const DEADLINE_GRACE_MS = 5_000;

export function isPastDeadline(deadlineAt: Date | null, now: Date, graceMs = 0): boolean {
  return deadlineAt !== null && now.getTime() > deadlineAt.getTime() + graceMs;
}
