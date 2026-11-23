import type { Prisma } from "@onatili/db";

/** O'zbekcha apostrof turlari: bazada qaysi biri yozilgan bo'lsa ham topilsin */
const APOS = /['‘’ʻʼ`´]/g;
const VARIANTS = ["'", "ʻ", "‘", "’", "ʼ"];

function wordVariants(w: string): string[] {
  if (!APOS.test(w)) return [w];
  APOS.lastIndex = 0;
  return VARIANTS.map((a) => w.replace(APOS, a));
}

/**
 * Ism, familiya, @username va telefon bo'yicha qidiruv sharti (User uchun).
 * Har bir so'z biror maydonda bo'lishi kerak: "ali valiyev" -> "Valiyev Ali" ham topiladi.
 * Telefon bo'yicha faqat kamida 3 ta raqam yozilganda (aks holda "aziz_2" hammaning raqamiga mos keladi).
 * Bo'sh so'rov -> null.
 */
export function userSearchWhere(q: string | undefined | null): Prisma.UserWhereInput | null {
  const term = (q ?? "").trim().replace(/^@/, "");
  if (!term) return null;
  const words = term
    .split(/\s+/)
    .map((w) => w.replace(/^@/, ""))
    .filter(Boolean)
    .slice(0, 5);
  const digits = term.replace(/\D/g, "");
  const byWords: Prisma.UserWhereInput = {
    AND: words.map((w) => ({
      OR: wordVariants(w).flatMap((v) => [
        { firstName: { contains: v, mode: "insensitive" as const } },
        { lastName: { contains: v, mode: "insensitive" as const } },
        { username: { contains: v, mode: "insensitive" as const } },
      ]),
    })),
  };
  return digits.length >= 3 ? { OR: [byWords, { phone: { contains: digits } }] } : byWords;
}
