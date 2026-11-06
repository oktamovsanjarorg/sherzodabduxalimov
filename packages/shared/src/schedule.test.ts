import { describe, expect, it } from "vitest";
import { dayLabel, parseSchedule } from "./stats-types";

describe("dars jadvali", () => {
  it("kunlar va vaqtni tushunadi", () => {
    expect(parseSchedule("Du/Chor/Ju 09:00")).toEqual({ days: [1, 3, 5], minutes: 540 });
    expect(parseSchedule("Se, Pay, Sha 16:30")).toEqual({ days: [2, 4, 6], minutes: 990 });
    expect(parseSchedule("Seshanba va payshanba, 14.00")).toEqual({ days: [2, 4], minutes: 840 });
    expect(parseSchedule("Har kuni 8:00").days).toHaveLength(7);
    expect(parseSchedule("Yakshanba")).toEqual({ days: [0], minutes: null });
  });
  it("tushunilmasa: kunlar noma'lum", () => {
    expect(parseSchedule("ertalab")).toEqual({ days: null, minutes: null });
    expect(parseSchedule(null)).toEqual({ days: null, minutes: null });
  });
  it("sana yorlig'i", () => {
    expect(dayLabel("2026-11-04")).toBe("4-noyabr, chorshanba");
  });
});
