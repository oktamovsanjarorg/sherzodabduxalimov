import { describe, expect, it } from "vitest";
import { ESSAY_PROMPT_MAX, createEssayInput } from "./essay-types";

const TEXT = Array.from({ length: 40 }, (_, i) => `so'z${i}`).join(" ");

describe("esse mavzusi uzunligi", () => {
  it("iqtibos va vazifali milliy sertifikat topshirig'i sig'adi", () => {
    const prompt =
      "Quyidagi fikrga munosabat bildiring: «Kitob — insonning eng yaqin do'sti, u hech qachon xiyonat qilmaydi va har doim yangi bilim beradi. " +
      "Bugungi raqamli zamonda esa ko'pchilik kitob o'rniga ijtimoiy tarmoqlardagi qisqa matnlarni o'qishni afzal ko'rmoqda.» " +
      "Fikringizni kamida ikki dalil va hayotiy misol bilan asoslang, xulosada o'z pozitsiyangizni aniq bildiring.";
    expect(prompt.length).toBeGreaterThan(300);
    expect(createEssayInput.safeParse({ mode: "AI", prompt, text: TEXT }).success).toBe(true);
  });

  it(`${ESSAY_PROMPT_MAX} belgigacha qabul qilinadi, undan uzuni rad etiladi`, () => {
    expect(createEssayInput.safeParse({ mode: "TEACHER", prompt: "a".repeat(ESSAY_PROMPT_MAX) }).success).toBe(true);
    const r = createEssayInput.safeParse({ mode: "TEACHER", prompt: "a".repeat(ESSAY_PROMPT_MAX + 1) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(`Mavzu ${ESSAY_PROMPT_MAX} belgidan oshmasin`);
  });

  it("bo'sh mavzu hali ham rad etiladi", () => {
    expect(createEssayInput.safeParse({ mode: "AI", prompt: "  ", text: TEXT }).success).toBe(false);
  });
});
