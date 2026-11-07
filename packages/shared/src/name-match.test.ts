import { describe, expect, it } from "vitest";
import { NAME_MATCH_THRESHOLD, nameMatchScore, nameTokens } from "./name-match";

const matches = (a: string, b: string) => nameMatchScore(a, b) >= NAME_MATCH_THRESHOLD;

describe("ism solishtirish", () => {
  it("kirill, lotin va tutuq belgisini bir xil o'qiydi", () => {
    expect(nameTokens("Ғулом Xасанов")).toEqual(nameTokens("G'ulom Hasanov"));
    expect(nameMatchScore("Шаҳзода Юсупова", "Shahzoda Yusupova")).toBe(1);
    expect(nameMatchScore("O‘g‘iloy Qodirova", "Ogiloy Kodirova")).toBe(1);
  });

  it("tartib, katta-kichik harf va kichik xatoga e'tibor bermaydi", () => {
    expect(nameMatchScore("VALIYEV ali", "Ali Valiyev")).toBe(1);
    expect(matches("Nozima Karimova", "Nazima Karimova")).toBe(true);
    expect(matches("Azizbek Karimov", "Aziz Karimov")).toBe(true);
  });

  it("otasining ismi qo'shilsa ham topadi", () => {
    expect(matches("Valiyev Ali Karimovich", "Ali Valiyev")).toBe(true);
  });

  it("familiyadosh boshqa odamni taklif qilmaydi", () => {
    expect(matches("Anvar Karimov", "Aziz Karimov")).toBe(false);
    expect(matches("Sardor Toshmatov", "Dilnoza Rahimova")).toBe(false);
  });

  it("faqat ismi yozilgan o'quvchida ishonch pastroq, bo'sh ism mos kelmaydi", () => {
    expect(nameMatchScore("Madina Aliyeva", "Madina")).toBeCloseTo(0.85);
    expect(nameMatchScore("😀", "Madina")).toBe(0);
  });
});
