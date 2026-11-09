import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildXlsx } from "../src/export/xlsx";

/** ZIP'ning markaziy katalogini o'qib, fayllarni ochadi (tekshirish uchun) */
function unzip(buf: Buffer): Record<string, string> {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    out[name] = inflateRawSync(buf.subarray(dataAt, dataAt + size)).toString("utf8");
    p += 46 + nameLen;
  }
  return out;
}

describe("xlsx", () => {
  const file = buildXlsx([
    { name: "O'quvchilar", columns: [{ header: "Ism" }, { header: "Summa" }], rows: [["Ali <Valiyev> & \u0007𝐘𝐚𝐬", 250000], [null, undefined]] },
    { name: "Davomat/[1]", columns: [{ header: "Sana" }], rows: [] },
  ]);
  const parts = unzip(file);

  it("kerakli qismlar bor", () => {
    expect(file.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(Object.keys(parts)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]));
  });

  it("matn umumiy jadvalda (har qanday ko'ruvchi o'qiydi), qochiriladi; son son bo'lib qoladi", () => {
    const s = parts["xl/worksheets/sheet1.xml"]!;
    const sst = parts["xl/sharedStrings.xml"]!;
    expect(s).not.toContain("inlineStr");
    expect(s).toContain('<c r="A2" t="s"><v>2</v></c>');
    expect(sst).toContain("Ali &lt;Valiyev&gt; &amp; 𝐘𝐚𝐬");
    expect(sst).not.toContain("\u0007");
    expect(s).toContain('<c r="B2"><v>250000</v></c>');
    expect(s).toContain('<row r="3"></row>');
  });

  it("varaq nomidan taqiqlangan belgilar olib tashlanadi", () => {
    expect(parts["xl/workbook.xml"]).toContain('name="Davomat  1"');
  });
});
