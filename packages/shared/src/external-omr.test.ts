import { describe, expect, it } from "vitest";
import { gradeMilliy, milliyTotal, parseEssayTable, questionPoints } from "./external-milliy";
import { isOmrExport, parseOmrExport } from "./external-omr";

/** Skaner eksporti: 4 savol, oxirgi bo'lim "3-3" deb yozilgan, lekin 2 katak (ikki qismli yozma savol) */
function csv(rows: [string, string[], string[]][]) {
  const head = ["Экзамен", "Имя", "Общая оценка", "Sertifikat -1-2", "Sertifikat -3-3"];
  for (let q = 1; q <= 4; q++) head.push(`Q ${q} Options`, `Q ${q} Key`, `Q ${q} Marks`);
  const lines = rows.map(([name, opts, marks]) => {
    const m = marks.map(Number);
    const cells = ["Mock1", name, String(m.reduce((s, x) => s + x, 0)), String(m[0] + m[1]), String(m[2] + m[3])];
    for (let q = 0; q < 4; q++) cells.push(opts[q], q < 2 ? "A" : "True", marks[q]);
    return cells.join(",");
  });
  return "﻿" + [head.join(","), ...lines].join("\r\n");
}

describe("parseOmrExport", () => {
  const file = csv([
    ["Aziz", ["A", "B", "True", ""], ["1", "0", "1", "0"]],
    ["Lola", ["", "A", "True", "True"], ["0", "1", "1", "1"]],
  ]);

  it("formatni taniydi, matrix.csv ni emas", () => {
    expect(isOmrExport(file)).toBe(true);
    expect(isOmrExport("Ism;Username;Q1;Jami\nAli;;1;1")).toBe(false);
  });

  it("javoblar: Marks 1 to'g'ri, belgilanmagan bo'sh, qolgani xato", () => {
    const p = parseOmrExport(file, "2026-09-01");
    expect(p.exam).toBe("Mock1");
    expect(p.questionCount).toBe(4);
    expect(p.rows[0]).toMatchObject({ name: "Aziz", answers: "cwcb", correct: 2, wrong: 1, blank: 1, percent: 50, submittedAt: "2026-09-01" });
    expect(p.rows[1]).toMatchObject({ answers: "bccc", correct: 3, blank: 1 });
  });

  it("oxirgi bo'lim fayldagi yig'indiga qarab oxirgi katakkacha cho'ziladi", () => {
    const p = parseOmrExport(file, null);
    expect(p.milliy).toBe(true);
    expect(p.sections).toEqual([
      { title: "1–2", fromQ: 1, toQ: 2 },
      { title: "3–3", fromQ: 3, toQ: 4 },
    ]);
    expect(p.rows[1].sections[1]).toMatchObject({ correct: 2, max: 2, percent: 100 });
  });

  it("Milliy baho: ko'proq to'g'ri — yuqori ball; kam qatnashchida savollar teng", () => {
    const p = parseOmrExport(file, null);
    expect(gradeMilliy(p.rows)).toMatchObject({ calibrated: false, n: 2 });
    expect(p.rows[1].scaledScore!).toBeGreaterThan(p.rows[0].scaledScore!);
    for (const r of p.rows) {
      expect(r.scaledScore).toBeGreaterThanOrEqual(0);
      expect(r.scaledScore).toBeLessThanOrEqual(75);
    }
  });

  it("bo'lim ballari yig'indisi test baliga teng", () => {
    const p = parseOmrExport(file, null);
    gradeMilliy(p.rows);
    for (const r of p.rows) expect(r.sections.reduce((s, x) => s + (x.points ?? 0), 0)).toBeCloseTo(r.testScore!, 2);
  });
});

describe("milliyTotal", () => {
  it("sertifikatdagidek: (49,9 + esse 62) / 2 = 55,95 → 86,08%, B", () => {
    // Esse 24 ballik mezonda 17,5 → 75 ballik shkalada 62
    expect(milliyTotal(49.9, 17.5)).toEqual({ scaledScore: 55.95, grade: "B", essay75: 62, certPercent: 86.08 });
  });
  it("esse kiritilmagan: umumiy = test qismi", () => {
    expect(milliyTotal(45, null)).toMatchObject({ scaledScore: 45, grade: null, essay75: null });
  });
});

describe("Ona tili formati (49 katak)", () => {
  it("sertifikatdagi 4 bo'lim: 1–12 va 33–35, 13–17, 18–32, 36–49", () => {
    const head = ["Имя", "Sertifikat -1-32"];
    for (let q = 1; q <= 49; q++) head.push(`Q ${q} Options`, `Q ${q} Key`, `Q ${q} Marks`);
    const row = ["Aziz", "0"];
    for (let q = 1; q <= 49; q++) row.push("A", "A", q === 33 || q === 13 ? "1" : "0");
    const p = parseOmrExport([head.join(","), row.join(",")].join("\n"), null);
    expect(p.sections.map((s) => s.title)).toEqual([
      "Tilshunoslik nazariyasi",
      "Adabiyot nazariyasi va adabiyot tarixi",
      "O'qish savodxonligi",
      "Lingvistik va badiiy tahlil",
    ]);
    expect(p.rows[0].sections.map((s) => [s.max, s.correct])).toEqual([
      [15, 1],
      [5, 1],
      [15, 0],
      [14, 0],
    ]);
  });
});

describe("parseEssayTable", () => {
  it("sarlavhasiz va sarlavhali; 75 lik ball 24 likka qaytadi, 24 lik o'zgarmaydi", () => {
    expect(
      parseEssayTable([
        ["Aliyev Vali", "62"],
        ["Karimova Aziza", "17,5"],
        ["Bo'sh", ""],
      ]),
    ).toEqual({
      rows: [
        { name: "Aliyev Vali", score24: 17.5 },
        { name: "Karimova Aziza", score24: 17.5 },
      ],
      bad: [],
    });
    expect(
      parseEssayTable([
        ["F.I.SH", "Ball"],
        ["Ali", "31"],
      ]).rows,
    ).toEqual([{ name: "Ali", score24: 2 }]);
  });
  it("25–27 va yarim qadamga tushmaydigan qiymat xato", () => {
    expect(
      parseEssayTable([
        ["Ali", "26"],
        ["Vali", "10.3"],
        ["Soli", "20"],
      ]),
    ).toEqual({ rows: [{ name: "Soli", score24: 20 }], bad: ["Ali", "Vali"] });
  });
});

describe("questionPoints", () => {
  it("to'g'ri savollar ballari yig'indisi test baliga teng, xato 0", () => {
    const p = questionPoints("cwcb", [1, 1.2, 0.8, 1], 50);
    expect(p[1]).toBe(0);
    expect(p[3]).toBe(0);
    expect(p[0] + p[2]).toBeCloseTo(50, 2);
    expect(p[0]).toBeGreaterThan(p[2]);
  });
});
