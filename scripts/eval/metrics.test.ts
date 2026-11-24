import { describe, expect, it } from "vitest";
import { extractAnswer, mcnemar, wilson } from "./lib";
import { cerWer, exactAdjacent, levenshtein, matchErrors, ocrErrorFidelity, parseTranscript, prf, qwk, totalAgreement } from "./metrics";

describe("ustoz belgilagan matn", () => {
  it("sof matn va xatolar ajraladi", () => {
    const r = parseTranscript("{Albatta|Albatta,|P} bu {dust|do'st|I} {kitoblarlar|kitoblar|Q}.");
    expect(r.text).toBe("Albatta bu dust kitoblarlar.");
    expect(r.errors).toEqual([
      { type: "punctuation", wrong: "Albatta", right: "Albatta," },
      { type: "spelling", wrong: "dust", right: "do'st" },
      { type: "affix", wrong: "kitoblarlar", right: "kitoblar" },
    ]);
  });
  it("noto'g'ri belgilash — aniq xato", () => {
    expect(() => parseTranscript("bu {dust|do'st} bor")).toThrow(/Belgilashda xato/);
  });
});

describe("o'qish sifati", () => {
  it("CER/WER; tutuq belgisi varianti xato emas", () => {
    expect(cerWer("do'st keldi", "doʻst keldi")).toEqual({ cer: 0, wer: 0 });
    const r = cerWer("bir ikki uch to'rt", "bir ikki uch tort");
    expect(r.wer).toBe(0.25);
    expect(r.cer).toBeCloseTo(1 / 18);
    expect(levenshtein([..."kitten"], [..."sitting"])).toBe(3);
  });
  it("o'qish o'quvchi xatosini saqlab qoldimi yoki tuzatib yubordimi", () => {
    const errors = [
      { type: "spelling" as const, wrong: "dust", right: "do'st" },
      { type: "spelling" as const, wrong: "kelld", right: "keldi" },
      { type: "spelling" as const, wrong: "maktap", right: "maktab" },
    ];
    expect(ocrErrorFidelity(errors, "Mening dust keldi, xullas")).toEqual({ kept: 1, corrected: 1, unclear: 1 });
  });
});

describe("xato topish aniqligi", () => {
  it("tur va iqtibos bo'yicha moslash; har ustoz xatosi bir marta", () => {
    const gold = [
      { type: "spelling" as const, wrong: "dust", right: "do'st" },
      { type: "punctuation" as const, wrong: "Albatta bu", right: "Albatta, bu" },
    ];
    const ai = [
      { type: "spelling", wrong: "dust" },
      { type: "spelling", wrong: "Dust" }, // takror — soxta
      { type: "punctuation", wrong: "Albatta" }, // qisqaroq iqtibos — mos
      { type: "affix", wrong: "kitobni" }, // ustozda yo'q — soxta
      { type: "style", wrong: "hozirgi kunda" }, // savodxonlik emas — hisobga olinmaydi
    ];
    const m = matchErrors(gold, ai);
    expect(m.spelling).toEqual({ tp: 1, fp: 1, fn: 0 });
    expect(m.punctuation).toEqual({ tp: 1, fp: 0, fn: 0 });
    expect(m.affix).toEqual({ tp: 0, fp: 1, fn: 0 });
  });
  it("F0.5 aniqlikka ko'proq og'irlik beradi", () => {
    expect(prf(8, 2, 8).f05).toBeGreaterThan(prf(8, 8, 2).f05);
    expect(prf(0, 0, 0)).toEqual({ p: 1, r: 1, f05: 1 });
  });
});

describe("ustoz bilan moslik", () => {
  it("QWK: to'liq moslik 1; mustaqil Python hisobi bilan bir xil", () => {
    expect(qwk([0, 0.5, 1, 1.5, 2], [0, 0.5, 1, 1.5, 2])).toBe(1);
    // python3 (Cohen weighted kappa, marginallardan): 40 juft → 0.7703977039770398
    const a = [
      2, 1.5, 0.5, 2, 1, 1, 0, 2, 1.5, 1, 0.5, 2, 2, 1, 1.5, 0, 1, 2, 0.5, 1.5, 1, 2, 1.5, 0.5, 1, 2, 0, 1.5, 1, 2, 1, 0.5, 2, 1.5, 1, 0, 2, 1, 1.5, 2,
    ];
    const b = [
      2, 1, 1, 1.5, 1, 1.5, 0.5, 2, 1, 0.5, 0, 2, 1.5, 1.5, 2, 0.5, 1, 1.5, 1, 1, 0.5, 2, 2, 1, 1, 1.5, 0, 1, 1.5, 2, 0.5, 1, 2, 1, 1.5, 0.5, 1.5, 1, 2, 2,
    ];
    expect(qwk(a, b)).toBeCloseTo(QWK_PY, 10);
  });
  it("MAE, SMD va yo'nalish; aynan va ±0,5 moslik", () => {
    const t = totalAgreement([12, 14, 16], [11, 13, 15]);
    expect(t.mae).toBe(1);
    expect(t.bias).toBe(1);
    expect(t.smd).toBeGreaterThan(0);
    expect(exactAdjacent([1, 1.5, 2], [1, 1, 0.5])).toEqual({ exact: 1 / 3, adjacent: 2 / 3 });
  });
});

describe("UzLiB yordamchilari", () => {
  it("javobni ajratish asl skript bilan bir xil (Unicode chegarasi)", () => {
    expect(extractAnswer("To'g'ri javob: **C) Loy jangi**")).toBe("C");
    expect(extractAnswer("  b  ")).toBe("B");
    expect(extractAnswer("ĩA")).toBeNull();
    expect(extractAnswer("")).toBeNull();
  });
  it("Wilson oralig'i va McNemar (katta n'da toshib ketmaydi)", () => {
    const w = wilson(960, 1501);
    expect(w.p).toBeCloseTo(0.6396, 4);
    expect(w.lo).toBeLessThan(w.p);
    expect(mcnemar(10, 10)).toBe(1);
    expect(mcnemar(355, 47)).toBeLessThan(1e-50);
    expect(mcnemar(800, 700)).toBeGreaterThan(0);
  });
});

const QWK_PY = 0.7703977039770398;
