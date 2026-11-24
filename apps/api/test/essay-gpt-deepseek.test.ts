import { describe, expect, it } from "vitest";
import type { AskModel } from "../src/ai/ask";
import { gradeEssay } from "../src/ai/essay/grade";
import { analysisSchema, foreignWords, literacySchema, verifySchema, writerSchema } from "../src/ai/essay";
import { essayAi } from "../src/ai/essay/setup";
import { parseLocated } from "../src/ai/handwriting";
import { checkRead, responseText } from "../src/ai/openai";
import { loadEnv } from "../src/config/env";

const TEXT = `Bugun kitob o'qish masalasi dolzarb. Albatta bu masala muhim.
Kitoblar bilim beradi. Maktabda dustlar bilan o'qiymiz.
Xulosa qilib aytganda, kitob jamiyatni yuksaltiradi.`;

const LITERACY = {
  errors: [
    { s: "1.2", type: "punctuation", wrong: "Albatta bu", right: "Albatta, bu", rule: "kirish" },
    { s: "2.2", type: "spelling", wrong: "dustlar", right: "do'stlar" },
  ],
};

/** Soxta model: qaysi bosqich so'ralganini sxemasi bo'yicha biladi va so'rovlarni yozib boradi */
function fake(provider: AskModel["provider"], replies: Map<unknown, unknown>) {
  const asked: unknown[] = [];
  const model: AskModel = {
    provider,
    model: `${provider}-model`,
    effort: "medium",
    ask: async (_system, _user, schema) => {
      asked.push(schema);
      const reply = replies.get(schema);
      if (reply instanceof Error) throw reply;
      return schema.parse(reply ?? {});
    },
  };
  return { model, asked };
}
const gpt = () => fake("gpt", new Map<unknown, unknown>([[literacySchema, LITERACY]]));
const run = (main: AskModel, reviewer: AskModel) => gradeEssay({ main, reviewer, topic: "Kitob va internet", text: TEXT });

describe("GPT + DeepSeek: bosqichlar taqsimoti", () => {
  it("tahlil va savodxonlik — GPT; qayta tekshiruv va taqriz — DeepSeek", async () => {
    const main = gpt();
    const ds = fake("deepseek", new Map([[verifySchema, { checks: [] }]]));
    const r = await run(main.model, ds.model);
    expect(main.asked).toEqual([analysisSchema, literacySchema]);
    expect(ds.asked).toEqual([verifySchema, writerSchema]);
    expect(r.provider).toBe("gpt+deepseek");
    expect(r.analysis).toMatchObject({ model: "gpt-model", verifier: { model: "deepseek-model", status: "ok" } });
  });
  it("DeepSeek rad etgan xato ballga kirmaydi, sababi bilan saqlanadi", async () => {
    const checks = [
      { i: 0, valid: true, right: "Albatta, bu" },
      { i: 1, valid: false, note: "aslida to'g'ri" },
    ];
    const ds = fake("deepseek", new Map([[verifySchema, { checks }]]));
    const r = await run(gpt().model, ds.model);
    expect(r.mistakes.map((m) => m.wrong)).toEqual(["Albatta bu"]);
    expect(r.criteria.find((c) => c.key === "spelling")?.score).toBe(2);
    expect(r.analysis).toMatchObject({
      rejectedByVerifier: 1,
      disputed: [{ kind: "literacy", type: "spelling", wrong: "dustlar", right: "do'stlar", reason: "aslida to'g'ri" }],
    });
  });
  it("DeepSeek javob bermasa: xatolar qoladi, lekin tekshirilmagani yoziladi", async () => {
    const ds = fake("deepseek", new Map([[verifySchema, new Error("DeepSeek 402: balans")]]));
    const r = await run(gpt().model, ds.model);
    expect(r.mistakes).toHaveLength(2);
    expect(r.analysis).toMatchObject({ verifier: { status: "failed", error: "DeepSeek 402: balans" }, disputed: [] });
  });
  it("GPT xato bersa, boshqa modelga jim o'tilmaydi", async () => {
    const main = fake("gpt", new Map([[analysisSchema, new Error("OpenAI 429")]]));
    const ds = fake("deepseek", new Map());
    await expect(run(main.model, ds.model)).rejects.toThrow("OpenAI 429");
    expect(ds.asked).toEqual([]);
  });
});

describe("begona tilga o'tib ketish", () => {
  it("begona so'z topiladi; o'zbekcha va o'quvchining o'z so'zlari — begona emas", () => {
    expect(foreignWords("Do'stlar, oʻqish maʼnosi — «kitob» → 2 ball", "")).toEqual([]);
    expect(foreignWords("bitta үндсэн чиглэл, kamchilikleriniziň", "")).toEqual(["үндсэн", "чиглэл", "kamchilikleriniziň"]);
    expect(foreignWords("«китоб» so'zi kirillcha", "Men китоб o'qiyman")).toEqual([]);
  });
  it("buzilgan xato ballga kirmaydi, buzilgan taqriz qayta so'raladi va o'quvchiga ko'rsatilmaydi", async () => {
    const errors = [...LITERACY.errors, { s: "2.1", type: "spelling", wrong: "Kitoblar", right: "Китоблар" }];
    const main = fake("gpt", new Map<unknown, unknown>([[literacySchema, { errors }]]));
    const writer = {
      criteria: [
        { key: "style", comment: "Toza izoh" },
        { key: "parts", comment: "манба ҳам гэх мэт" },
      ],
      feedback: "Яхши эссэ",
      tips: [{ focus: "style", text: "анхаарна уу", example: null }],
    };
    const ds = fake(
      "deepseek",
      new Map<unknown, unknown>([
        [verifySchema, { checks: [] }],
        [writerSchema, writer],
      ]),
    );
    const r = await run(main.model, ds.model);
    expect(r.mistakes.map((m) => m.wrong)).toEqual(["Albatta bu", "dustlar"]);
    expect(ds.asked).toEqual([verifySchema, writerSchema, writerSchema]);
    expect(r.criteria.find((c) => c.key === "style")?.comment).toBe("Toza izoh");
    expect(JSON.stringify([r.criteria, r.feedback, r.tips])).not.toMatch(/[а-яү]/iu);
    expect(r.analysis).toMatchObject({ foreignDropped: 1 });
  });
  it("o'qilgan qo'lyozma: kirill o'zbekcha mumkin, mo'g'ulcha — xato", () => {
    expect(checkRead("Мен китоб ўқийман")).toContain("ўқийман");
    expect(() => checkRead("Kitob үндсэн")).toThrow("boshqa tilda");
  });
});

describe("modellarni tanlash (essayAi)", () => {
  const base = { BOT_TOKEN: "t", JWT_SECRET: "x".repeat(16), AI_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "d" };
  const ai = (extra: Record<string, string>) => essayAi(loadEnv({ ...base, ...extra }));
  it("DeepSeek kaliti yoki AI_PROVIDER bo'lmasa — o'chiq", () => {
    expect(ai({ AI_PROVIDER: "none" })).toBeNull();
    expect(ai({ DEEPSEEK_API_KEY: "", OPENAI_API_KEY: "o" })).toBeNull();
  });
  it("OpenAI kaliti bo'lsa qo'lyozma o'qiladi, Gemini kaliti shart emas", () => {
    expect(ai({ OPENAI_API_KEY: "o" })?.read).toBeTypeOf("function");
    expect(ai({ OPENAI_API_KEY: "o" })?.locate).toBeTypeOf("function");
  });
  it("OpenAI kaliti bo'lmasa — avvalgidek: rasm uchun Gemini kaliti kerak", () => {
    expect(ai({})?.grade).toBeTypeOf("function");
    expect(ai({})?.read).toBeUndefined();
    expect(ai({ OPENAI_API_KEY: "  # izoh" })?.read).toBeUndefined();
    expect(ai({ GEMINI_API_KEY: "g" })?.read).toBeTypeOf("function");
  });
  it("standart modellar", () => {
    const env = loadEnv(base);
    expect([env.OPENAI_MODEL, env.OPENAI_ESSAY_EFFORT, env.DEEPSEEK_ESSAY_MODEL]).toEqual(["gpt-6-luna", "medium", "deepseek-flash"]);
  });
});

describe("OpenAI javobi", () => {
  const msg = (text: string) => ({ type: "message", content: [{ type: "output_text", text }] });
  it("fikrlash bloklari tashlanadi, matn olinadi", () => {
    expect(responseText({ status: "completed", output: [{ type: "reasoning" }, msg(" salom ")] })).toBe("salom");
  });
  it("to'liq bo'lmagan yoki bo'sh javob — xato", () => {
    const cut = { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [msg("yarim")] };
    expect(() => responseText(cut)).toThrow("max_output_tokens");
    expect(() => responseText({ status: "completed", output: [] })).toThrow("bo'sh");
    expect(() => responseText(null)).toThrow("bo'sh");
  });
});

describe("xatoning varoqdagi joyi", () => {
  it("obyekt va massiv ko'rinishi o'qiladi, noto'g'ri ramkalar tashlanadi", () => {
    const ok = { i: 0, page: 0, box_2d: [10, 20, 30, 40] };
    const bad = [
      { i: 5, page: 0, box_2d: [1, 1, 2, 2] },
      { i: 0, page: 3, box_2d: [1, 1, 2, 2] },
      { i: 0, page: 0, box_2d: [30, 20, 10, 40] },
      { i: 0, page: 0, box_2d: [0, 0, 5000, 10] },
    ];
    const want = [{ i: 0, page: 0, box: [10, 20, 30, 40] }];
    expect(parseLocated(JSON.stringify({ found: [ok, ...bad] }), 1, 1)).toEqual(want);
    expect(parseLocated(JSON.stringify([ok]), 1, 1)).toEqual(want);
    expect(parseLocated("xato", 1, 1)).toEqual([]);
    expect(parseLocated('{"found": null}', 1, 1)).toEqual([]);
  });
});
