import { describe, expect, it } from "vitest";
import { isAnswerCorrect, isPastDeadline, normalizeUz, seededShuffle } from "../src/tests/grading";

const single = {
  type: "SINGLE" as const,
  correctText: null,
  options: [
    { id: "a", isCorrect: false },
    { id: "b", isCorrect: true },
  ],
};
const multi = {
  type: "MULTIPLE" as const,
  correctText: null,
  options: [
    { id: "a", isCorrect: true },
    { id: "b", isCorrect: false },
    { id: "c", isCorrect: true },
  ],
};
const text = { type: "TEXT" as const, correctText: "oʻn besh|15", options: [] };

describe("isAnswerCorrect", () => {
  it("SINGLE: to'g'ri va noto'g'ri", () => {
    expect(isAnswerCorrect(single, { optionIds: ["b"], textAnswer: null })).toBe(true);
    expect(isAnswerCorrect(single, { optionIds: ["a"], textAnswer: null })).toBe(false);
    expect(isAnswerCorrect(single, { optionIds: ["a", "b"], textAnswer: null })).toBe(false);
  });

  it("MULTIPLE: hammasi to'g'ri tanlanishi kerak, ortiqchasi ham, kami ham xato", () => {
    expect(isAnswerCorrect(multi, { optionIds: ["c", "a"], textAnswer: null })).toBe(true);
    expect(isAnswerCorrect(multi, { optionIds: ["a"], textAnswer: null })).toBe(false);
    expect(isAnswerCorrect(multi, { optionIds: ["a", "b", "c"], textAnswer: null })).toBe(false);
  });

  it("javob berilmagan bo'lsa xato", () => {
    expect(isAnswerCorrect(single, undefined)).toBe(false);
    expect(isAnswerCorrect(single, { optionIds: [], textAnswer: null })).toBe(false);
  });

  it("TEXT: tutuq belgisi, katta-kichik harf va variantlar farqi hisobga olinmaydi", () => {
    expect(isAnswerCorrect(text, { optionIds: [], textAnswer: "  O'n   besh. " })).toBe(true);
    expect(isAnswerCorrect(text, { optionIds: [], textAnswer: "o`n besh" })).toBe(true);
    expect(isAnswerCorrect(text, { optionIds: [], textAnswer: "15" })).toBe(true);
    expect(isAnswerCorrect(text, { optionIds: [], textAnswer: "o'n olti" })).toBe(false);
  });

  it("to'g'ri varianti belgilanmagan savol hech qachon to'g'ri hisoblanmaydi", () => {
    const broken = { ...single, options: [{ id: "a", isCorrect: false }] };
    expect(isAnswerCorrect(broken, { optionIds: [], textAnswer: null })).toBe(false);
  });
});

describe("tinish belgilari javobi (Milliy sertifikat 37-topshiriq)", () => {
  const q = { type: "TEXT" as const, correctText: '"":",".', options: [] };
  it("bo'sh joy va qo'shtirnoq turlari farqi hisobga olinmaydi", () => {
    expect(isAnswerCorrect(q, { optionIds: [], textAnswer: '" " : " , " .' })).toBe(true);
    expect(isAnswerCorrect(q, { optionIds: [], textAnswer: "«»:„,“." })).toBe(true);
  });
  it("oxirgi nuqta olib tashlanmaydi: nuqtasiz javob xato", () => {
    expect(isAnswerCorrect(q, { optionIds: [], textAnswer: '"":","' })).toBe(false);
    expect(isAnswerCorrect(q, { optionIds: [], textAnswer: '"":";".' })).toBe(false);
  });
  it("esse avtomatik baholanmaydi", () => {
    expect(isAnswerCorrect({ type: "ESSAY", correctText: null, options: [] }, { optionIds: [], textAnswer: "uzun matn" })).toBe(false);
  });
});

describe("normalizeUz", () => {
  it("barcha tutuq belgilarini birxillashtiradi", () => {
    expect(normalizeUz("gʻoʻza")).toBe(normalizeUz("g'o'za"));
    expect(normalizeUz("g‘o’za")).toBe("g'o'za");
  });
});

describe("seededShuffle", () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  it("bir xil seed bilan doim bir xil tartib", () => {
    expect(seededShuffle(items, "attempt-1")).toEqual(seededShuffle(items, "attempt-1"));
  });
  it("boshqa seed bilan boshqa tartib va elementlar yo'qolmaydi", () => {
    const a = seededShuffle(items, "attempt-1");
    expect(a).not.toEqual(seededShuffle(items, "attempt-2"));
    expect([...a].sort((x, y) => x - y)).toEqual(items);
  });
});

describe("isPastDeadline", () => {
  const d = new Date("2026-01-01T10:00:00Z");
  it("muddatsiz test hech qachon tugamaydi", () => {
    expect(isPastDeadline(null, new Date())).toBe(false);
  });
  it("grace muddati hisobga olinadi", () => {
    const now = new Date(d.getTime() + 3000);
    expect(isPastDeadline(d, now)).toBe(true);
    expect(isPastDeadline(d, now, 5000)).toBe(false);
  });
});
