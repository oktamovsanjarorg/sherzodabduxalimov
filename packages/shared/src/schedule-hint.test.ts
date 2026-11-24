import { describe, expect, it } from "vitest";
import { scheduleHint } from "./stats-types";

describe("jadval izohi", () => {
  it("tushunilgan kunlar va vaqt, hafta dushanbadan boshlanadi", () => {
    expect(scheduleHint("Se, Pay, Sha 14:00")).toEqual({ ok: true, text: "Dars kunlari: seshanba, payshanba, shanba · 14:00" });
    expect(scheduleHint("Yak/Du 9.05")).toEqual({ ok: true, text: "Dars kunlari: dushanba, yakshanba · 09:05" });
    expect(scheduleHint("Har kuni 8:00")).toEqual({ ok: true, text: "Dars kunlari: har kuni · 08:00" });
    expect(scheduleHint("Juma")).toEqual({ ok: true, text: "Dars kunlari: juma" });
  });
  it("kunlar tushunilmasa yoki jadval bo'sh bo'lsa ogohlantiradi", () => {
    expect(scheduleHint("ertalab 10:00")).toEqual({ ok: false, text: "Kunlar tushunilmadi: o'tib ketgan darslar eslatilmaydi" });
    for (const empty of ["", "  ", null, undefined])
      expect(scheduleHint(empty)).toEqual({ ok: false, text: "Jadval yozilmasa, o'tib ketgan darslar eslatilmaydi" });
  });
});
