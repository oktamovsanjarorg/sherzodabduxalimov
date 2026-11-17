import { describe, expect, it } from "vitest";
import { parseUtestMatrix } from "./external-types";

describe("parseUtestMatrix", () => {
  it("utest matrix.csv ni o'qiydi (BOM, ;, qo'shtirnoq)", () => {
    const csv = '﻿Ism;Username;Q1;Q2;Q3;Jami\r\n"Karimova; Aziza";aziza_k;1;0;1;2\r\nAli;;0;;1;1\r\n';
    const r = parseUtestMatrix(csv);
    expect(r.questionCount).toBe(3);
    expect(r.rows[0]).toMatchObject({ name: "Karimova; Aziza", username: "aziza_k", answers: "cwc", correct: 2, wrong: 1, blank: 0, percent: 66.7, key: "name:aziza_k" });
    expect(r.rows[1]).toMatchObject({ name: "Ali", username: null, answers: "w-c", correct: 1, blank: 1, key: "name:ali" });
  });
  it("bir xil ismlar alohida kalit oladi", () => {
    const r = parseUtestMatrix("Ism;Username;Q1;Jami\nAli;;1;1\nAli;;0;0\n");
    expect(r.rows.map((x) => x.key)).toEqual(["name:ali", "name:ali#2"]);
  });
  it("matritsa bo'lmagan faylni rad etadi", () => {
    expect(() => parseUtestMatrix("a;b\n1;2\n")).toThrow(/Q1/);
  });
});
