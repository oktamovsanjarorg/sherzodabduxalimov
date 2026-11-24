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
  it("toq va juft kunlar (juft — juma emas)", () => {
    expect(parseSchedule("Toq kunlar 14:00")).toEqual({ days: [1, 3, 5], minutes: 840 });
    expect(parseSchedule("Juft kunlari 14:00")).toEqual({ days: [2, 4, 6], minutes: 840 });
    expect(parseSchedule("Juma 14:00").days).toEqual([5]);
  });
  it("hafta oralig'i; ro'yxat oraliq deb olinmaydi", () => {
    expect(parseSchedule("Du-Shan 9:00").days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseSchedule("Du – Ju 15:00-17:00")).toEqual({ days: [1, 2, 3, 4, 5], minutes: 900 });
    expect(parseSchedule("Seshanbadan shanbagacha").days).toEqual([2, 3, 4, 5, 6]);
    expect(parseSchedule("Se-Pay 14:00").days).toEqual([2, 4]);
    expect(parseSchedule("Du-Chor-Ju 14:00").days).toEqual([1, 3, 5]);
    expect(parseSchedule("Du, Ju 14:00-16:00").days).toEqual([1, 5]);
  });
  it("kirillcha yozuv", () => {
    expect(parseSchedule("Ду/Чор/Жу 14:00")).toEqual({ days: [1, 3, 5], minutes: 840 });
    expect(parseSchedule("Жуфт кунлар").days).toEqual([2, 4, 6]);
    expect(parseSchedule("Якшанба, Пайшанба").days).toEqual([0, 4]);
    expect(parseSchedule("Ҳар куни 8:00").days).toHaveLength(7);
  });
  it("tushunilmasa: kunlar noma'lum", () => {
    expect(parseSchedule("ertalab")).toEqual({ days: null, minutes: null });
    expect(parseSchedule(null)).toEqual({ days: null, minutes: null });
  });
  it("sana yorlig'i", () => {
    expect(dayLabel("2026-11-04")).toBe("4-noyabr, chorshanba");
  });
});
