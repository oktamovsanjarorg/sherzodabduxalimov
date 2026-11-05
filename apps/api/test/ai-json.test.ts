import { describe, expect, it } from "vitest";
import { normalize, parseFirstJson } from "../src/ai/deepseek";

describe("AI javobini o'qish", () => {
  it("JSON'dan keyin yoki oldin ortiqcha matn bo'lsa ham birinchi obyekt olinadi", () => {
    expect(parseFirstJson('{"a":"x}\\"y","b":{"c":1}}\n{"extra":2}')).toEqual({ a: 'x}"y', b: { c: 1 } });
    expect(parseFirstJson('Mana javob: {"a":1} tamom')).toEqual({ a: 1 });
    expect(() => parseFirstJson("javob yo'q")).toThrow();
  });

  it("ballar mezon chegarasida, noma'lum kalitlar tashlanadi, bir xil 'xato'lar olib tashlanadi", () => {
    const r = normalize({
      special: null,
      criteria: [{ key: "style", score: 99, comment: "x" }, { key: "spelling", score: 1.3, comment: null }, { key: "boshqa", score: 5, comment: null }],
      feedback: " ok ",
      mistakes: [{ wrong: "Kitob", right: "kitob", note: null }, { wrong: "dust", right: "do'st", note: "qoida" }],
    });
    expect(r.criteria).toHaveLength(12); // rasmiy mezon: 12 band
    expect(r.criteria.find((c) => c.key === "style")?.score).toBe(2); // har band ko'pi bilan 2
    expect(r.criteria.find((c) => c.key === "spelling")?.score).toBe(1.5); // 0,5 qadam
    expect(r.criteria.some((c) => c.key === "boshqa")).toBe(false);
    expect(r.mistakes).toEqual([{ wrong: "dust", right: "do'st", note: "qoida", type: "other" }]);
    expect(r.feedback).toBe("ok");
  });
});

import { aiAnnotations } from "../src/essays/ai-runner";

describe("AI belgilari", () => {
  const mistakes = [
    { wrong: "dusti", right: "do'sti", note: null, type: "spelling" as const },
    { wrong: "unutmoqda bu", right: "unutmoqda, bu", note: null, type: "punctuation" as const },
    { wrong: "yo'q so'z", right: "x", note: null, type: "word" as const },
  ];
  it("qo'lyozma: topilgan so'z tagiga chiziq va ustida 'tur: to'g'risi' yorlig'i", async () => {
    const a = await aiAnnotations(mistakes, {
      pages: ["essays/x/1.jpg"],
      text: null,
      locate: async () => [{ i: 0, page: 0, box: [261, 432, 311, 508] }, { i: 1, page: 0, box: [515, 62, 574, 314] }],
    });
    expect(a!.pages[0].marks).toEqual([
      { x: 0.432, y: 0.261, type: "spelling", note: "do'sti" },
      { x: 0.062, y: 0.515, type: "punctuation", note: "unutmoqda, bu" },
    ]);
    expect(a!.pages[0].strokes[0]).toEqual({ tool: "pen", width: 0.003, points: [[0.432, 0.315], [0.508, 0.315]] });
  });
  it("yozilgan matn: xato so'zning aniq o'rni (topilmaganlari tashlanadi)", async () => {
    const text = "Kitob insonning eng yaqin dusti. Yoshlar kitobni unutmoqda bu yomon.";
    const a = await aiAnnotations(mistakes, { pages: [], text });
    expect(a!.text.map((m) => text.slice(m.start, m.end))).toEqual(["dusti", "unutmoqda bu"]);
    expect(a!.text[0]).toMatchObject({ type: "spelling", note: "do'sti" });
  });
  it("joy topib bo'lmasa (xato yoki bo'sh): belgi yo'q, baho baribir saqlanadi", async () => {
    expect(await aiAnnotations(mistakes, { pages: ["p"], text: null, locate: async () => { throw new Error("503"); } }).catch(() => "throw")).toBeNull();
    expect(await aiAnnotations([], { pages: [], text: "x" })).toBeNull();
  });
});
