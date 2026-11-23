/**
 * .xlsx ning birinchi varag'ini jadval (string[][]) qilib o'qiydi. utest dagi kod (ADR-081) dan ko'chirildi:
 * kutubxona emas, chunki bizga faqat kataklar kerak (exceljs 23 MB / 79 paket, SheetJS npm nusxasi eski).
 * Kirish ishonchsiz: ochilgan hajm va kataklar soni cheklangan, XML entity'lar o'qilmaydi.
 */
import { inflateRawSync } from "node:zlib";

const MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const MAX_CELLS = 4_000_000;

interface ZipEntry {
  compressed: boolean;
  offset: number;
  compressedSize: number;
  uncompressedSize: number;
}

function readZipEntries(buf: Buffer): Map<string, ZipEntry> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("Bu Excel (.xlsx) fayl emas");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Excel fayl buzilgan");
    const method = buf.readUInt16LE(p + 10);
    const nameLen = buf.readUInt16LE(p + 28);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (method === 0 || method === 8)
      out.set(name, {
        compressed: method === 8,
        offset: buf.readUInt32LE(p + 42),
        compressedSize: buf.readUInt32LE(p + 20),
        uncompressedSize: buf.readUInt32LE(p + 24),
      });
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

function readEntry(buf: Buffer, e: ZipEntry): string {
  if (e.uncompressedSize > MAX_ENTRY_BYTES) throw new Error("Excel fayl juda katta");
  if (e.offset + 30 > buf.length) throw new Error("Excel fayl buzilgan");
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  const raw = buf.subarray(start, start + e.compressedSize);
  return (e.compressed ? inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES }) : raw).toString("utf8");
}

function decodeXml(t: string): string {
  return t
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const texts = (xml: string) =>
  (xml.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((x) => decodeXml(x.replace(/^<t\b[^>]*>/, "").replace(/<\/t>$/, ""))).join("");
const column = (ref: string) => [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export function readXlsx(buf: Buffer): string[][] {
  const entries = readZipEntries(buf);
  const sheet = entries.get("xl/worksheets/sheet1.xml") ?? [...entries].find(([n]) => n.startsWith("xl/worksheets/") && n.endsWith(".xml"))?.[1];
  if (!sheet) throw new Error("Excel faylda varaq topilmadi");
  const sharedEntry = entries.get("xl/sharedStrings.xml");
  const shared = sharedEntry ? (readEntry(buf, sharedEntry).match(/<si\b[\s\S]*?<\/si>|<si\b[^>]*\/>/g) ?? []).map(texts) : [];
  const rows: string[][] = [];
  let cells = 0;
  for (const rowXml of readEntry(buf, sheet).match(/<row\b[\s\S]*?<\/row>|<row\b[^>]*\/>/g) ?? []) {
    const row: string[] = [];
    for (const c of rowXml.match(/<c\b[\s\S]*?<\/c>|<c\b[^>]*\/>/g) ?? []) {
      if (++cells > MAX_CELLS) throw new Error("Excel fayl juda katta");
      const ref = /\br="([A-Z]+)\d+"/.exec(c)?.[1];
      const type = /\bt="([^"]+)"/.exec(c)?.[1] ?? "n";
      const at = ref ? column(ref) : row.length;
      let v = "";
      if (type === "inlineStr") v = texts(c);
      else {
        const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(c)?.[1];
        if (raw !== undefined) v = type === "s" ? (shared[Number(decodeXml(raw))] ?? "") : decodeXml(raw);
      }
      while (row.length < at) row.push("");
      row[at] = v.trim();
    }
    rows.push(row);
  }
  return rows;
}
