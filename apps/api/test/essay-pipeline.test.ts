import { describe, expect, it } from "vitest";
import {
  analysisSchema,
  buildMistakes,
  copiedShare,
  countErrors,
  countScore,
  evidenceScore,
  literacySchema,
  partsScore,
  quoteFound,
  scoreAll,
  segment,
  styleScore,
  verifiedQuotes,
  viewsScore,
} from "../src/ai/essay";

const TEXT = `Bugun ijtimoiy tarmoqlar yoshlar hayotining ajralmas qismiga aylandi. Bir guruh mutaxassislar ularni bilim manbai deb hisoblasa, boshqalar xavotirda. Aslida, bu masala muvozanatni talab etadi.
Albatta bu tarmoqlar ma'lumot olishni tezlashtiradi. Masalan, talaba onlayn kutubxonalardan foydalanadi. Bu esa vaqtni tejaydi.
Hozirgi kunda ko'p odamlar o'ylaydiki, telefon zarar qiladi. Uzoq vaqt ekranga qarash diqqatni susaytiradi.
Xulosa qilib aytganda, jamiyat raqamli savodxonlikni oshirishi lozim.`;

describe("matnni bo'lish va iqtiboslar", () => {
  const seg = segment(TEXT);
  it("xatboshi va gaplar raqamlanadi", () => {
    expect(seg.paragraphs).toHaveLength(4);
    expect(seg.paragraphs[0]).toHaveLength(3);
    expect(seg.sentences[3]).toEqual({ id: "2.1", text: "Albatta bu tarmoqlar ma'lumot olishni tezlashtiradi." });
    expect(seg.numbered).toContain("— 2-xatboshi —\n[2.1] Albatta bu");
  });
  it("iqtibos matnda bo'lmasa — topilmadi; tutuq belgisi va katta harf farqi hisobga olinmaydi", () => {
    expect(quoteFound("albatta bu", seg, "2.1")).toBe(true);
    expect(quoteFound("maʼlumot olishni", seg, "2.1")).toBe(true);
    expect(quoteFound("bunday so'z yo'q", seg)).toBe(false);
    expect(quoteFound("", seg)).toBe(false);
  });
  it("vaziyat matnidan aynan ko'chirish ulushi", () => {
    const prompt = "Ijtimoiy tarmoqlar yoshlar hayotining ajralmas qismiga aylandi va bu haqida turli fikrlar bor";
    expect(copiedShare(prompt, prompt)).toBe(1);
    expect(copiedShare(prompt, TEXT)).toBeLessThan(0.2);
  });
});

describe("mezon bo'yicha ball (server hisoblaydi)", () => {
  it("N o'rinda: 0→2, 1–2→1,5, 3–4→1, 5–6→0,5, 7+→0", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 12].map(countScore)).toEqual([2, 1.5, 1.5, 1, 1, 0.5, 0.5, 0, 0]);
  });
  it("imlo: bir so'z takrorlansa — bitta; punktuatsiya: bir qoida — bitta, turli qoidalar — alohida", () => {
    const e = literacySchema.parse({
      errors: [
        { s: "1.1", type: "spelling", wrong: "dust", right: "do'st" },
        { s: "2.1", type: "spelling", wrong: "Dust", right: "do'st" },
        { s: "1.2", type: "punctuation", wrong: "Albatta bu", right: "Albatta, bu", rule: "kirish" },
        { s: "3.1", type: "punctuation", wrong: "Aslida bu", right: "Aslida, bu", rule: "kirish" },
        { s: "3.2", type: "punctuation", wrong: "kitob daftar", right: "kitob, daftar", rule: "uyushiq" },
        { s: "3.3", type: "punctuation", wrong: "a b", right: "a, b", rule: "boshqa" },
        { s: "3.4", type: "punctuation", wrong: "c d", right: "c, d", rule: "noma'lum" },
      ],
    }).errors;
    expect(countErrors(e)).toEqual({ spelling: 1, punctuation: 4, affixes: 0, wordUsage: 0 });
  });
  it("kirish, asosiy qism, xulosa", () => {
    expect(partsScore("full", "full", "full")).toBe(2);
    expect(partsScore("full", "full", "shallow")).toBe(1.5);
    expect(partsScore("shallow", "full", "shallow")).toBe(1);
    expect(partsScore("missing", "full", "shallow")).toBe(0.5);
    expect(partsScore("shallow", "shallow", "missing")).toBe(0.5);
    expect(partsScore("missing", "shallow", "missing")).toBe(0);
  });
  it("qarashlar: shaxsiy fikr yo'q — 1,5; bitta qarash — 1; faqat shaxsiy mulohaza — 0", () => {
    expect(viewsScore("full", "full", "full")).toBe(2);
    expect(viewsScore("full", "full", "partial")).toBe(1.5);
    expect(viewsScore("full", "partial", "full")).toBe(1);
    expect(viewsScore("partial", "none", "full")).toBe(0.5);
    expect(viewsScore("none", "none", "full")).toBe(0);
  });
  it("dalillar", () => {
    expect(evidenceScore("fit", "fit")).toBe(2);
    expect(evidenceScore("fit", "none")).toBe(1.5);
    expect(evidenceScore("fit", "partlyUnfit")).toBe(1);
    expect(evidenceScore("unfit", "unfit")).toBe(0.5);
    expect(evidenceScore("none", "none")).toBe(0);
  });
  it("uslub: chekingan gaplar ulushi (uchdan bir / uchdan ikki)", () => {
    expect(styleScore([], 9)).toBe(2);
    expect(styleScore([{ s: "1.1", register: "colloquial" }, { s: "1.1", register: "colloquial" }], 9)).toBe(1.5);
    expect(styleScore([1, 2, 3, 4, 5].map((i) => ({ s: `1.${i}`, register: "official" })), 9)).toBe(1);
    expect(styleScore([1, 2, 3, 4, 5, 6, 7].map((i) => ({ s: `1.${i}`, register: "colloquial" })), 9)).toBe(0);
  });
});

describe("to'liq hisob: AI dalili → ball", () => {
  const seg = segment(TEXT);
  const a = analysisSchema.parse({
    paragraphsSplit: true,
    intro: { level: "full", topicOpened: true, viewsHinted: true, thesis: "bu masala muvozanatni talab etadi", copiedFromPrompt: false },
    pro: { coverage: "full", claim: "ma'lumot olishni tezlashtiradi", evidence: "onlayn kutubxonalardan foydalanadi", analysis: "vaqtni tejaydi", evidenceFit: "fit" },
    con: { coverage: "full", claim: "telefon zarar qiladi", evidence: null, evidenceFit: "none" },
    personal: { coverage: "full", stance: "qo'llab-quvvatlayman", solution: null },
    body: { level: "full" },
    conclusion: { level: "full", societyImpact: false, repeatsOnly: false },
    styleIssues: [
      { s: "3.1", register: "colloquial", quote: "ko'p odamlar o'ylaydiki", fix: "keng jamoatchilik orasida xavotir bor" },
      { s: "3.2", register: "colloquial", quote: "matnda yo'q ibora", fix: "x" }, // to'qib chiqarilgan — tashlanadi
    ],
    structureIssues: [{ where: "3-xatboshi", issue: "qarshi qarash va shaxsiy fikr aralashgan", quote: null }],
    repetitions: [],
    purity: [],
    lexicon: { good: ["ajralmas qismiga aylandi", "yo'q ibora"], misused: [], overloadedParagraphs: [], level: 1.5 },
    noise: "noma'lum maydon",
  });
  const lit = literacySchema.parse({
    errors: [
      { s: "2.1", type: "punctuation", wrong: "Albatta bu", right: "Albatta, bu", rule: "kirish" },
      { s: "2.1", type: "spelling", wrong: "tezlashtirad", right: "tezlashtiradi" }, // matnda shunday so'z yo'q
      { s: "1.1", type: "spelling", wrong: "Bugun", right: "bugun" }, // bir xil — xato emas
    ],
  }).errors;
  const v = verifiedQuotes(a, lit, seg);
  const { scores, facts } = scoreAll(a, v, seg, false);

  it("matnda yo'q iqtiboslar tashlanadi", () => {
    expect(v.errors.map((e) => e.wrong)).toEqual(["Albatta bu"]);
    expect(v.styleIssues).toHaveLength(1);
    expect(v.good).toEqual(["ajralmas qismiga aylandi"]);
  });
  it("ball dalildan kelib chiqadi, AI'ning 'full' degani tekshiriladi", () => {
    expect(scores.punctuation).toBe(1.5);
    expect(scores.spelling).toBe(2);
    expect(scores.style).toBe(1.5); // 10 gapdan 1 tasi
    expect(scores.structure).toBe(1.5);
    // qarshi qarashda dalil yo'q → "full" emas; shaxsiy fikrda yechim yo'q → "full" emas
    expect(scores.views).toBe(1);
    expect(scores.evidence).toBe(1.5);
    // xulosada jamiyatga ta'sir yo'q → yuza
    expect(scores.parts).toBe(1.5);
    expect(facts.punctuation).toContain("1 o'rinda");
  });
  it("yozilgan matn bitta xatboshi bo'lsa — mantiqiy qurilish 0", () => {
    const one = segment(TEXT.replace(/\n/g, " "));
    expect(scoreAll(a, verifiedQuotes(a, lit, one), one, false).scores.structure).toBe(0);
  });
  it("xatolar ro'yxati matn tartibida, uslub tuzatishi bilan", () => {
    const m = buildMistakes(v, seg);
    expect(m.map((x) => [x.type, x.wrong])).toEqual([["punctuation", "Albatta bu"], ["style", "ko'p odamlar o'ylaydiki"]]);
    expect(m[0].note).toContain("kirish so'z");
  });
});
