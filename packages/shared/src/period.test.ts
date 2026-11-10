import { describe, expect, it } from "vitest";
import { addDays, addMonth, daysBetween, defaultPeriodEnd, monthBounds, periodLabel, tashkentToday } from "./period";

describe("to'lov davri", () => {
  it("davr oxiri: bir oy keyingi sanadan bir kun oldin", () => {
    expect(defaultPeriodEnd("2026-11-05")).toBe("2026-12-04");
    expect(defaultPeriodEnd("2026-11-01")).toBe("2026-11-30");
    expect(defaultPeriodEnd("2026-12-20")).toBe("2027-01-19");
  });
  it("oy kunlari yetmasa, oyning oxirgi kuni olinadi", () => {
    expect(addMonth("2026-01-31")).toBe("2026-02-28");
    expect(addMonth("2028-01-31")).toBe("2028-02-29");
    expect(defaultPeriodEnd("2026-01-31")).toBe("2026-02-27");
  });
  it("kunlar farqi va qo'shish", () => {
    expect(daysBetween("2026-11-05", "2026-11-15")).toBe(10);
    expect(daysBetween("2026-11-15", "2026-11-05")).toBe(-10);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("oy chegaralari", () => {
    expect(monthBounds("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthBounds("2026-11")).toEqual({ start: "2026-11-01", end: "2026-11-30" });
  });
  it("Toshkent sanasi UTC+5 bo'yicha", () => {
    expect(tashkentToday(Date.UTC(2026, 10, 9, 20, 0))).toBe("2026-11-10");
    expect(tashkentToday(Date.UTC(2026, 10, 9, 18, 59))).toBe("2026-11-09");
  });
  it("yorliq", () => {
    expect(periodLabel("2026-11-05", "2026-12-04")).toBe("05.11 – 04.12");
  });
});
