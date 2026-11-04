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
      criteria: [{ key: "topic", score: 99, comment: "x" }, { key: "spelling", score: 2.3, comment: null }, { key: "boshqa", score: 5, comment: null }],
      feedback: " ok ",
      mistakes: [{ wrong: "Kitob", right: "kitob", note: null }, { wrong: "dust", right: "do'st", note: "qoida" }],
    });
    expect(r.criteria.find((c) => c.key === "topic")?.score).toBe(4);
    expect(r.criteria.find((c) => c.key === "spelling")?.score).toBe(2.5);
    expect(r.criteria.some((c) => c.key === "boshqa")).toBe(false);
    expect(r.mistakes).toEqual([{ wrong: "dust", right: "do'st", note: "qoida" }]);
    expect(r.feedback).toBe("ok");
  });
});
