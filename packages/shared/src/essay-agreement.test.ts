import { describe, expect, it } from "vitest";
import { essayAgreement, wordChanges } from "./essay-agreement";
import { ESSAY_RUBRIC } from "./essay-types";

const all = (score: number, over: Record<string, number> = {}) => ({ ...Object.fromEntries(ESSAY_RUBRIC.map((c) => [c.key, score])), ...over });
const snap = (scores: Record<string, number>, special: string | null = null) => ({
  special,
  scores,
  total: special ? 0 : Object.values(scores).reduce((s, x) => s + x, 0),
});

describe("essayAgreement", () => {
  it("bo'sh: xulosa yo'q", () => {
    expect(essayAgreement([])).toMatchObject({ count: 0, meanAbs: null, within2: null, bands: [] });
  });

  it("umumiy farq, yo'nalish va bandlar", () => {
    const key = ESSAY_RUBRIC[0].key;
    const r = essayAgreement([
      // AI birinchi bandni 2 ga oshirib qo'ygan: +1,5
      { ai: snap(all(1, { [key]: 2 })), teacher: snap(all(1, { [key]: 0.5 })) },
      // To'liq bir xil
      { ai: snap(all(1)), teacher: snap(all(1)) },
      // AI hammasini pasaytirgan: 12 × −0,5 = −6
      { ai: snap(all(0.5)), teacher: snap(all(1)) },
    ]);
    expect(r).toMatchObject({ count: 3, meanAbs: 2.5, within2: 0.67, higher: 1, lower: 1, equal: 1 });
    expect(r.bands[0]).toMatchObject({ key, n: 3, meanDiff: 0.33, exact: 0.33 });
    expect(r.bands).toHaveLength(12);
  });

  it("maxsus holat bandlarga kirmaydi, umumiy farqqa kiradi", () => {
    const r = essayAgreement([{ ai: snap(all(1)), teacher: snap({}, "OFF_TOPIC") }]);
    expect(r).toMatchObject({ count: 1, meanAbs: 12, higher: 1, bands: [] });
  });
});

describe("wordChanges", () => {
  it("bir xil matn: xato yo'q", () => {
    expect(wordChanges("Men  kitob\no'qiyman.", "Men kitob o'qiyman.")).toEqual({ words: 3, errors: 0 });
  });

  it("almashtirish, tushib qolish, ortiqcha so'z va tuzatilgan vergul", () => {
    // AI o'quvchi xatosini "tuzatgan" (kitop → kitob) va vergulni qo'shib yuborgan
    expect(wordChanges("Albatta, men kitob o'qiyman", "Albatta men kitop o'qiyman")).toEqual({ words: 4, errors: 2 });
    expect(wordChanges("men o'qiyman", "men kitob o'qiyman")).toEqual({ words: 3, errors: 1 });
    expect(wordChanges("men [?] kitob o'qiyman", "men kitob o'qiyman")).toEqual({ words: 3, errors: 1 });
    expect(wordChanges("", "salom")).toEqual({ words: 1, errors: 1 });
  });
});
