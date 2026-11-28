import { describe, expect, it } from "vitest";
import { channelCaption, leaderboard, shortName } from "./external-share";
import type { ExternalTestDetail } from "./external-types";

type Row = ExternalTestDetail["rows"][number];
const row = (name: string, percent: number, extra: Partial<Row> = {}): Row =>
  ({ id: name, name, percent, correct: Math.round(percent / 10), student: null, scaledScore: null, grade: null, ...extra }) as Row;

describe("shortName", () => {
  it("familiya va ismning bosh harfi", () => {
    expect(shortName("Aliyev Vali Ahmad o'g'li")).toBe("Aliyev V.");
    expect(shortName("  Aziza  ")).toBe("Aziza");
    expect(shortName("")).toBe("");
  });
});

describe("leaderboard", () => {
  const t = { questionCount: 10, rows: [row("C Uch", 70), row("A Bir", 90), row("B Ikki", 70), row("D Tort", 50)] };

  it("foiz bo'yicha, teng ballilar bir o'rinda; limit chegarasidagi tenglar qolmaydi", () => {
    expect(leaderboard(t, { limit: null, short: false }).map((r) => [r.place, r.name, r.value, r.extra])).toEqual([
      [1, "A Bir", "90%", "9/10"],
      [2, "C Uch", "70%", "7/10"],
      [2, "B Ikki", "70%", "7/10"],
      [4, "D Tort", "50%", "5/10"],
    ]);
    expect(leaderboard(t, { limit: 2, short: true }).map((r) => r.name)).toEqual(["A B.", "C U.", "B I."]);
  });

  it("Milliy: foiz emas, umumiy ball (esse bilan) bo'yicha; bahosiz oxirida", () => {
    const m = {
      questionCount: 49,
      rows: [row("Yuqori Foiz", 95, { scaledScore: 50, grade: "B" }), row("Esse Kuchli", 80, { scaledScore: 61.5, grade: "B+" }), row("Bahosiz", 99, {})],
    };
    expect(leaderboard(m, { limit: null, short: false }).map((r) => [r.place, r.name, r.value, r.extra])).toEqual([
      [1, "Esse Kuchli", "61,5 ball", "B+"],
      [2, "Yuqori Foiz", "50 ball", "B"],
      [3, "Bahosiz", "—", null],
    ]);
  });

  it("Milliy: essesi kiritilmagan belgilanadi, post matnida ogohlantirish", () => {
    const m = {
      title: "Sinov",
      questionCount: 49,
      participants: 2,
      avgPercent: 80,
      rows: [
        row("Esseli Bir", 80, { testScore: 60, essayScore: 20, scaledScore: 61, grade: "B+" }),
        row("Essesiz Ikki", 90, { testScore: 70, essayScore: null, scaledScore: 70, grade: "A+" }),
      ],
    };
    const lb = leaderboard(m, { limit: null, short: false });
    expect(lb[0]).toMatchObject({ name: "Essesiz Ikki", noEssay: true, extra: "faqat test" });
    expect(lb[1]).toMatchObject({ name: "Esseli Bir", noEssay: false, extra: "B+" });
    const text = channelCaption(m, { limit: 10, short: false });
    expect(text).toContain("1 ta o'quvchining essesi hali baholanmagan");
    expect(text).not.toContain("Sertifikat darajasiga");
  });
});

describe("channelCaption", () => {
  it("uchta g'olib, qatnashchilar va o'rtacha; ism qisqa", () => {
    const t = {
      title: "Mart sinovi",
      questionCount: 10,
      participants: 4,
      avgPercent: 70,
      rows: [row("A Bir", 90), row("B Ikki", 80), row("C Uch", 70), row("D Tort", 40)],
    };
    const text = channelCaption(t, { limit: 10, short: true });
    expect(text).toContain("«Mart sinovi» natijalari");
    expect(text).toContain("🥇 A B. — 90%");
    expect(text).toContain("🥉 C U. — 70%");
    expect(text).not.toContain("D T.");
    expect(text).toContain("Qatnashchilar: 4 ta · o'rtacha: 70%");
  });
});
