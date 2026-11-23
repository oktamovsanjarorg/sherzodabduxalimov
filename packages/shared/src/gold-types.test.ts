import { describe, expect, it } from "vitest";
import { goldCreateInput, goldRatingInput, toGoldMarkup } from "./gold-types";
import { ESSAY_RUBRIC } from "./essay-types";

const mark = (start: number, end: number, type: string, note: string | null) => ({ start, end, type, note }) as never;

describe("toGoldMarkup", () => {
  it("xatolarni o'lchov formatiga o'tkazadi", () => {
    const text = "Albatta bugun dust topish";
    expect(toGoldMarkup(text, [mark(14, 18, "spelling", "do'st"), mark(0, 7, "punctuation", "Albatta,")])).toEqual({
      markup: "{Albatta|Albatta,|P} bugun {dust|do'st|I} topish",
      skipped: 0,
    });
  });
  it("uslub/mantiq va ustma-ust belgilarni o'tkazib yuboradi", () => {
    const r = toGoldMarkup("abc def", [mark(0, 3, "style", null), mark(4, 7, "affix", "deff"), mark(5, 6, "word", "x")]);
    expect(r).toEqual({ markup: "abc {def|deff|Q}", skipped: 2 });
  });
  it("formatni buzadigan belgilarni olib tashlaydi", () => {
    expect(toGoldMarkup("a{b}|c", []).markup).toBe("abc");
  });
});

describe("goldRatingInput / goldCreateInput", () => {
  const all = Object.fromEntries(ESSAY_RUBRIC.map((c) => [c.key, 1.5]));
  it("12 band yoki maxsus holat talab qiladi", () => {
    expect(goldRatingInput.safeParse({ scores: all }).success).toBe(true);
    expect(goldRatingInput.safeParse({ scores: { style: 2 } }).success).toBe(false);
    expect(goldRatingInput.safeParse({ special: "BLANK" }).success).toBe(true);
    expect(goldRatingInput.safeParse({ scores: { ...all, style: 0.7 } }).success).toBe(false);
  });
  it("rozilikni talab qiladi", () => {
    expect(goldCreateInput.safeParse({ topic: "Kitob", consent: false }).success).toBe(false);
    expect(goldCreateInput.safeParse({ topic: "Kitob", consent: true }).success).toBe(true);
  });
});
