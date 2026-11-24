import { describe, expect, it } from "vitest";
import { ADVICE_SNOOZE_MS, isDismissed, parseDismissed, reconcileDismissed } from "./dismiss";

const NOW = 1_800_000_000_000;
const all = () => true;

describe("xabarlarni yashirish", () => {
  it("son oshsa qaytadi, oshmasa yashirin", () => {
    const m = { essays: { count: 5, at: NOW } };
    expect(isDismissed(m, "essays", 5, NOW)).toBe(true);
    expect(isDismissed(m, "essays", 6, NOW)).toBe(false);
    expect(isDismissed(m, "boshqa", 1, NOW)).toBe(false);
  });
  it("ish bajarilib, keyin yangi ish kelsa — kamroq bo'lsa ham ko'rinadi", () => {
    const done = reconcileDismissed({ essays: { count: 5, at: NOW } }, { essays: 0 }, all);
    expect(isDismissed(done, "essays", 4, NOW)).toBe(false);
    const fewer = reconcileDismissed({ essays: { count: 5, at: NOW } }, { essays: 2 }, all);
    expect(isDismissed(fewer, "essays", 2, NOW)).toBe(true);
    expect(isDismissed(fewer, "essays", 3, NOW)).toBe(false);
  });
  it("begona kalitlarga tegmaydi, o'zgarish bo'lmasa o'sha obyekt", () => {
    const m = { "adv:platform:x": { count: 1, at: NOW }, essays: { count: 1, at: NOW } };
    expect(reconcileDismissed(m, { essays: 3 }, (k) => k === "essays")).toBe(m);
    expect(reconcileDismissed(m, {}, (k) => k === "essays")).toEqual({ "adv:platform:x": { count: 1, at: NOW } });
  });
  it("tavsiya 7 kundan keyin yana chiqadi", () => {
    const m = { a: { count: 1, at: NOW } };
    expect(isDismissed(m, "a", 1, NOW + ADVICE_SNOOZE_MS - 1, ADVICE_SNOOZE_MS)).toBe(true);
    expect(isDismissed(m, "a", 1, NOW + ADVICE_SNOOZE_MS, ADVICE_SNOOZE_MS)).toBe(false);
  });
  it("eski format va buzuq JSON", () => {
    expect(parseDismissed('{"essays":5}')).toEqual({ essays: { count: 5, at: 0 } });
    expect(parseDismissed("{buzuq")).toEqual({});
    expect(parseDismissed(null)).toEqual({});
  });
});
