import { describe, expect, it } from "vitest";
import { coverage, effective, pickPayment, referenceDate } from "../src/billing/offline-period";

const d = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
/** O'quvchining o'z sanasidan: 25.10 – 24.11, 10.11 kuni... emas, 28.10 kuni to'lagan (3 kun kechikkan) */
const custom = { month: "2026-10", periodStart: d("2026-10-25"), periodEnd: d("2026-11-24"), paidOn: d("2026-10-28"), createdAt: d("2026-10-28") };
/** Eski yozuv: davr yo'q, butun oy */
const legacy = { month: "2026-11", periodStart: null, periodEnd: null, paidOn: null, createdAt: new Date("2026-11-03T08:00:00Z") };

describe("to'lov davri", () => {
  it("eski yozuv butun oy deb hisoblanadi", () => {
    expect(effective(legacy)).toEqual({ start: "2026-11-01", end: "2026-11-30", paidOn: "2026-11-03" });
  });

  it("oy chegarasidan o'tgan davr keyingi oyda ham to'langan hisoblanadi", () => {
    expect(pickPayment([custom], "2026-11", "2026-11-10")?.month).toBe("2026-10");
    // davr tugagach (25.11) qarzdor
    expect(pickPayment([custom], "2026-11", "2026-11-25")).toBeUndefined();
  });

  it("o'tgan oy hisobotida shu oyning oxirgi kuni bo'yicha", () => {
    expect(referenceDate("2026-10", "2026-11-10")).toBe("2026-10-31");
    expect(pickPayment([custom], "2026-10", "2026-11-10")?.month).toBe("2026-10");
  });

  it("muddati o'tgan kunlar va keyingi davr boshi", () => {
    expect(coverage([custom], "2026-12-04")).toEqual({ coveredUntil: "2026-11-24", overdueDays: 10, nextPeriodStart: "2026-11-25" });
    expect(coverage([custom], "2026-11-10")).toMatchObject({ coveredUntil: "2026-11-24", overdueDays: null });
    expect(coverage([], "2026-11-10")).toMatchObject({ coveredUntil: null, overdueDays: null });
  });

  it("kelajakdagi davr hisobotdagi sanagacha hisobga olinmaydi", () => {
    const next = { ...custom, month: "2026-11", periodStart: d("2026-11-25"), periodEnd: d("2026-12-24") };
    expect(coverage([custom, next], "2026-11-10").coveredUntil).toBe("2026-11-24");
    expect(coverage([custom, next], "2026-11-30").coveredUntil).toBe("2026-12-24");
  });
});
