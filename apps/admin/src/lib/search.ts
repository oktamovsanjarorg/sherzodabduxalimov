// Ro'yxatlarda qidiruv: ism, @username, telefon va boshqa matnlar bo'yicha bir xil qoida

/** Katta-kichik harf, apostrof turlari (o' / o‘ / oʻ) va @ farq qilmasin */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/@/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * q bo'sh bo'lsa — true. Aks holda q ning har bir so'zi maydonlardan birida bo'lishi kerak
 * ("ali val" -> "Valiyev Ali" topiladi). Kamida 3 ta raqam bo'lsa, telefon raqamlari bo'yicha ham solishtiradi.
 */
export function matches(q: string, ...fields: (string | number | null | undefined)[]): boolean {
  const n = norm(q);
  if (!n) return true;
  const text = fields
    .filter((f) => f !== null && f !== undefined && f !== "")
    .map((f) => norm(String(f)))
    .join(" ");
  if (n.split(" ").every((w) => text.includes(w))) return true;
  const digits = q.replace(/\D/g, "");
  return digits.length >= 3 && text.replace(/\D/g, "").includes(digits);
}
