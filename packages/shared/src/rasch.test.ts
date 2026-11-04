import { describe, expect, it } from "vitest";
import { calibrate, estimateTheta, raschT } from "./rasch";

/** Ma'lum qiyinlik va qobiliyatlardan simulyatsiya: model ularni qayta tiklay olishi kerak */
function simulate(thetas: number[], bs: number[], seed = 7) {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  return thetas.map((t) => bs.map((b) => (rnd() < 1 / (1 + Math.exp(-(t - b))) ? 1 : 0) as 0 | 1));
}

describe("Rasch modeli", () => {
  it("qobiliyat: ko'p yechgan yuqori, qiyin savolni yechish ko'proq ball beradi", () => {
    const b = [-2, -1, 0, 1, 2];
    expect(estimateTheta([1, 1, 1, 1, 0], b)).toBeGreaterThan(estimateTheta([1, 1, 1, 0, 0], b));
    expect(estimateTheta([0, 0, 0, 0, 0], b)).toBeLessThan(-2);
    expect(estimateTheta([1, 1, 1, 1, 1], b)).toBeGreaterThan(2);
  });

  it("JMLE simulyatsiyadagi savol qiyinliklarini tiklaydi", () => {
    const trueB = Array.from({ length: 30 }, (_, i) => -2 + (4 * i) / 29);
    const thetas = Array.from({ length: 400 }, (_, i) => -2.5 + (5 * i) / 399);
    const c = calibrate(simulate(thetas, trueB));
    // Qiyinliklar tartibi va qiymati yaqin (o'rtachasi 0 ga keltirilgan)
    const corr = (() => {
      const m1 = c.b.reduce((s, x) => s + x, 0) / c.b.length;
      const m2 = trueB.reduce((s, x) => s + x, 0) / trueB.length;
      let a = 0, d1 = 0, d2 = 0;
      c.b.forEach((x, i) => ((a += (x - m1) * (trueB[i] - m2)), (d1 += (x - m1) ** 2), (d2 += (trueB[i] - m2) ** 2)));
      return a / Math.sqrt(d1 * d2);
    })();
    expect(corr).toBeGreaterThan(0.97);
    c.b.forEach((x, i) => expect(Math.abs(x - trueB[i])).toBeLessThan(0.6));
  });

  it("T = 50 + 10Z, test qismi 0..75", () => {
    expect(raschT(0, 0, 1)).toBe(50);
    expect(raschT(1.5, 0, 1)).toBe(65);
    expect(raschT(5, 0, 1)).toBe(75);
    expect(raschT(-9, 0, 1)).toBe(0);
    expect(raschT(1, 0.5, 0.5)).toBe(60);
  });
});
