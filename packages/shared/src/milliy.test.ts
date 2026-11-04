import { describe, expect, it } from "vitest";
import { essayTo75, milliyBreakdown } from "./content-types";

describe("Milliy sertifikat baholash mezonlari", () => {
  it("yozma ish: 24 ballik -> 75 ballik rasmiy jadval", () => {
    // Hujjatdagi jadval (to'liq)
    const table = [
      [24, 75], [23.5, 74], [23, 73], [22.5, 72], [22, 71], [21.5, 70], [21, 69], [20.5, 68], [20, 67], [19.5, 66], [19, 65], [18.5, 64],
      [18, 63], [17.5, 62], [17, 61], [16.5, 60], [16, 59], [15.5, 58], [15, 57], [14.5, 56], [14, 55], [13.5, 54], [13, 53], [12.5, 52],
      [12, 51], [11.5, 50], [11, 49], [10.5, 48], [10, 47], [9.5, 46], [9, 45], [8.5, 44], [8, 43], [7.5, 42], [7, 41], [6.5, 40],
      [6, 39], [5.5, 38], [5, 37], [4.5, 36], [4, 35], [3.5, 34], [3, 33], [2.5, 32], [2, 31], [1.5, 30], [1, 29], [0.5, 28], [0, 0],
    ];
    for (const [a, b] of table) expect(essayTo75(a)).toBe(b);
    expect(essayTo75(18.7)).toBe(64); // oraliq ball pastga: 18,5
  });

  const T = (scaled: number) => ({ correct: 0, total: 1, theta: 0, scaled, calibrated: true, sampleSize: 100 });
  it("umumiy ball = ikki qism o'rtachasi; daraja; oliygoh bali (Ball×93/65, Ball×63/65)", () => {
    // Test T=60, esse 19 -> 65: umumiy (60 + 65) / 2 = 62,5 -> B+
    const r = milliyBreakdown({ test: T(60), essayScore24: 19, hasEssay: true, essayPending: false });
    expect(r).toMatchObject({ essay: { scaled: 65 }, total: 62.5, level: { code: "B+" } });
    expect(r.university).toEqual({ first: 89.42, second: 60.58 });
    // Hujjatdagi misollar: 60 -> 85,85 va 58,15; 64,9 -> 92,86 va 62,9; 65 va undan yuqori -> 93 va 63
    expect(milliyBreakdown({ test: T(60), essayScore24: null, hasEssay: false, essayPending: false }).university).toEqual({ first: 85.85, second: 58.15 });
    expect(milliyBreakdown({ test: T(64.9), essayScore24: null, hasEssay: false, essayPending: false }).university).toEqual({ first: 92.86, second: 62.9 });
    expect(milliyBreakdown({ test: T(70), essayScore24: null, hasEssay: false, essayPending: false }).university).toEqual({ first: 93, second: 63 });
    expect(milliyBreakdown({ test: T(30), essayScore24: null, hasEssay: false, essayPending: false })).toMatchObject({ university: null, level: { code: "—" } });
    expect(milliyBreakdown({ test: T(50), essayScore24: null, hasEssay: true, essayPending: true })).toMatchObject({ total: null, level: null, essay: null });
  });
});
