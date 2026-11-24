/**
 * Esseni chuqur tekshirish: AI ball QO'YMAYDI, dalil to'playdi.
 *
 * 1) Server matnni xatboshi va gaplarga bo'lib raqamlaydi ([2.3] — 2-xatboshi, 3-gap).
 * 2) Ikki parallel so'rov: tuzilma/mazmun/uslub tahlili (A) va gapma-gap savodxonlik tekshiruvi (B).
 * 3) Ikkinchi ekspert (C, boshqa provayder — DeepSeek Flash) har bir xato va uslub da'vosini qayta tekshiradi: rad etilgani ballga kirmaydi, "disputed"da saqlanadi.
 * 4) Server har bir iqtibos matnda haqiqatan borligini tekshiradi va 12 band ballini mezon jadvali bo'yicha
 *    O'ZI hisoblaydi (masalan, imlo: 0 xato → 2, 1–2 → 1,5 ...). AI'ning taxminiy balliga tayanilmaydi.
 * 5) Taqrizchi (D, u ham DeepSeek) yakuniy ball va dalillar asosida izoh, taqriz va tavsiyalarni yozadi.
 */

export * from "./mistakes";
export * from "./prompts";
export * from "./schemas";
export * from "./scoring";
export * from "./text";
