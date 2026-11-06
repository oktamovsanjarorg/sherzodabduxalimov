import { ERROR_TYPES, ESSAY_RUBRIC, RUBRIC_STEPS, type ErrorTypeKey } from "@onatili/shared";
import { request } from "node:https";
import { z } from "zod";

export interface AiEssayResult {
  /** Esse tekshirilmaydigan holat (AI aniqlaydi): mavzuga mos emas, ko'chirilgan, faqat kirish qismi */
  special: "OFF_TOPIC" | "COPIED" | "ONLY_INTRO" | null;
  criteria: { key: string; score: number; comment: string | null }[];
  feedback: string;
  mistakes: { wrong: string; right: string; note: string | null; type: ErrorTypeKey }[];
  /** Aniq tavsiyalar: eng zaif bandlar bo'yicha, o'quvchining o'z jumlasi yaxshilangan namunasi bilan */
  tips: { focus: string | null; text: string; example: string | null }[];
}

/** DeepSeek (OpenAI bilan mos API). IPv4 majburiy: serverda IPv6 ishlamaydi. */
function postJson(host: string, path: string, apiKey: string, body: object, timeoutMs: number): Promise<{ status: number; json: unknown }> {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host,
        path,
        method: "POST",
        family: 4,
        timeout: timeoutMs,
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data), authorization: `Bearer ${apiKey}` },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, json: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode ?? 0, json: null });
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("AI timeout")));
    req.on("error", reject);
    req.end(data);
  });
}

const resultSchema = z.object({
  special: z.enum(["OFF_TOPIC", "COPIED", "ONLY_INTRO"]).nullish().catch(null),
  criteria: z.array(z.object({ key: z.string(), score: z.coerce.number(), comment: z.string().nullish() })).default([]),
  feedback: z.string().default(""),
  mistakes: z.array(z.object({ wrong: z.string(), right: z.string(), note: z.string().nullish(), type: z.string().nullish() })).default([]),
  tips: z.array(z.object({ focus: z.string().nullish(), text: z.string(), example: z.string().nullish() })).default([]).catch([]),
});

const TYPE_KEYS = ERROR_TYPES.map((t) => t.key as string);
/** AI tur bermasa yoki noto'g'ri bersa: izohdagi kalit so'zdan aniqlaymiz */
function mistakeType(type: string | null | undefined, note: string | null | undefined): ErrorTypeKey {
  if (type && TYPE_KEYS.includes(type)) return type as ErrorTypeKey;
  const n = (note ?? "").toLowerCase();
  if (n.startsWith("imlo") || n.includes("tutuq")) return "spelling";
  if (n.startsWith("punkt") || n.includes("vergul") || n.includes("tinish")) return "punctuation";
  if (n.startsWith("qo'shimcha") || n.includes("qo'shimcha")) return "affix";
  if (n.startsWith("so'z")) return "word";
  if (n.includes("uslub")) return "style";
  return "other";
}

/** Rasmiy mezon (BBA) va "Yozma ishni baholashga qo'yiladigan talablar" asosida ko'rsatma */
export function buildEssayPrompt(topic: string, text: string, handwritten = false) {
  const rubric = ESSAY_RUBRIC.map(
    (c, i) => `${i + 1}. "${c.key}" — ${c.label} (${c.group}):\n${c.levels.map((l, j) => `   ${RUBRIC_STEPS[j]} ball: ${l}`).join("\n")}`,
  ).join("\n");
  const system = `Sen Bilim va malakalarni baholash agentligining ona tili va adabiyot fanidan tajribali fan ekspertisan. Milliy sertifikat imtihonidagi yozma ish (esse)ni RASMIY MEZON bo'yicha xolis baholaysan.

MEZON: 12 ta band, har biri faqat 2, 1.5, 1, 0.5 yoki 0 ball (jami 24). Har bir band uchun quyidagi tavsiflardan eng mosini tanla:
${rubric}

BAHOLASH QOIDALARI (rasmiy talablar):
- Uslub: boshqa uslub elementlari matnning uchdan bir qismigacha uchrasa "chekinilgan" (1.5), uchdan ikki qismida uchrasa "qisman publitsistik" (1).
- Qarashlar: vaziyat yuzasidan ikki xil qarash va talabgorning shaxsiy qarashi asosiy qismda yoritilishi kerak. Faqat shaxsiy mulohaza bo'lib, qarashlar yoritilmasa — 0.
- Dalillar: keltirilgan faktlarning (sana, nom, manba) to'g'riligi tekshirilmaydi, faqat qarashni asoslashga xizmat qilishi baholanadi.
- Qismlar: "faqat bittasi" deganda asosiy qism yoki xulosa nazarda tutiladi (kirish emas).
- Xatboshilarga ajratishdagi xato mantiqiy qurilish xatosi (5-band); ayni bir fikrning takrori (boshqa so'zlar bilan bo'lsa ham) izchillik buzilishi (6-band).
- Imlo: harflar imlosi, tutuq belgisi, asos va qo'shimchalar, qo'shib/ajratib/chiziqcha bilan yozish, bosh harflar, ko'chirish. Bir xil xato bir necha joyda takrorlansa — BITTA xato. Bitta so'zdagi bir nechta xato — BITTA xato. Kirill harflari bilan yozilgan so'z — imlo xatosi. Ikki xil yozilishi me'yorda bo'lgan so'zlar (oktabr/oktyabr) va neologizmlarning ikki xilligi xato emas.
- Punktuatsiya: bitta qoida bo'yicha takrorlangan xatolar — BITTA xato; bitta gapda turli qoidalarga oid xatolar — alohida-alohida.
- Qo'shimcha qo'llash xatosi (9-band): so'z yasovchi/shakl yasovchi qo'shimchani noo'rin, almashtirib, ortiqcha qo'llash yoki tushirib qoldirish.
- So'z qo'llash xatosi (10-band): so'zni noto'g'ri, ortiqcha, noo'rin takror qo'llash, tushirib qoldirish, paronimlarni almashtirish, bog'lovchi vositalar xatosi. Neologizmlar xato emas.
- Husnixat baholanmaydi. Talabgor o'zi o'chirib/qavsga olib tuzatgan joylar xato hisoblanmaydi.

ESSE TEKSHIRILMAYDIGAN HOLATLAR ("special"):
- "OFF_TOPIC": esse mavzuga umuman mos emas (asosiy qism yoki xulosada mavzuga mos kamida bitta jumla bo'lsa — mos deb qaraladi);
- "COPIED": esse boshqa manbadan ko'chirilgan yoki vaziyat matni aynan ko'chirilgan;
- "ONLY_INTRO": faqat kirish qismi yozilgan.
Bunday holatda "special" ga shu qiymatni yoz, aks holda null.

JAVOB (faqat JSON):
{"special": null, "criteria": [{"key": "style", "score": 1.5, "comment": "..."}, ... 12 ta band ...], "feedback": "...", "mistakes": [{"wrong": "...", "right": "...", "type": "spelling|punctuation|affix|word|style|logic|other", "note": "qisqa qoida"}], "tips": [{"focus": "evidence", "text": "...", "example": "..."}]}
- "comment": har bir bandga 1–2 jumla, xatolar sonini ko'rsat (masalan, "imlo xatosi 3 o'rinda").
- "feedback": ekspert taqrizi — 3–5 jumlali xulosa va yaxshilash bo'yicha aniq maslahat.
- "tips": 3–5 ta ANIQ tavsiya — eng past ball olgan bandlardan boshlab. "focus" — band kaliti (style, views, evidence, parts, structure, coherence, spelling, punctuation, affixes, wordUsage, lexicon, purity). "text" — nima qilish kerakligi (1–2 jumla, umumiy gap emas: aynan shu essega tegishli). "example" — o'quvchi essesidagi bitta jumlaning yaxshilangan namunasi yoki shu esse uchun yozilishi mumkin bo'lgan namunaviy jumla (masalan, kirish, dalil yoki xulosa jumlasi); kerak bo'lmasa null.
- "mistakes": eng muhim xatolar (ko'pi bilan 15 ta). "wrong" — matndan AYNAN ko'chirilgan qism (1–4 so'z, keyin varoqdan topiladi), "right" — to'g'risi. "type": spelling (imlo), punctuation (tinish belgisi), affix (qo'shimcha), word (so'z qo'llash), style (uslub), logic (mantiq/izchillik), other. "wrong" va "right" bir xil bo'lmasin; ishonching komil bo'lmasa kiritma.
Barcha izohlar o'zbek tilida (lotin).`;
  const note = handwritten
    ? "\n\nEslatma: matn talabgorning qo'lyozmasidan avtomatik o'qib olingan. [?] — o'qib bo'lmagan so'z: uni xato deb hisoblama, ball kamaytirma."
    : "";
  const user = `Esse mavzusi (vaziyat): ${topic}\n\nEsse matni:\n"""\n${text}\n"""${note}`;
  return { system, user };
}

export async function gradeEssayDeepSeek(opts: { apiKey: string; model: string; topic: string; text: string; handwritten?: boolean }): Promise<AiEssayResult> {
  const { system, user } = buildEssayPrompt(opts.topic, opts.text, opts.handwritten);
  const r = await postJson(
    "api.deepseek.com",
    "/chat/completions",
    opts.apiKey,
    {
      model: opts.model,
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    120_000,
  );
  const j = r.json as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null;
  if (r.status !== 200) throw new Error(`DeepSeek ${r.status}: ${j?.error?.message ?? "javob yo'q"}`);
  const content = j?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek bo'sh javob qaytardi");
  const result = normalize(resultSchema.parse(parseFirstJson(content)));
  // Model ba'zan ballda xato borligini ko'rsatib, ro'yxatni bo'sh qaytaradi: unda faqat xatolarni alohida so'raymiz
  const errorBands = ["spelling", "punctuation", "affixes", "wordUsage"];
  if (!result.special && !result.mistakes.length && result.criteria.some((c) => errorBands.includes(c.key) && c.score < 2)) {
    result.mistakes = await listMistakesDeepSeek(opts).catch(() => []);
  }
  return result;
}

/** Faqat xatolar ro'yxati (asosiy javobda tushib qolganda) */
async function listMistakesDeepSeek(opts: { apiKey: string; model: string; topic: string; text: string }): Promise<AiEssayResult["mistakes"]> {
  const system = `Sen ona tili fan ekspertisan. Esse matnidagi imlo, punktuatsiya, qo'shimcha va so'z qo'llash xatolarini top.
Bir xil xato takrorlansa — bitta. Faqat aniq xatolar, ko'pi bilan 15 ta.
Javob faqat JSON: {"mistakes": [{"wrong": "matndan AYNAN ko'chirilgan 1–4 so'z", "right": "to'g'risi", "type": "spelling|punctuation|affix|word|style|logic|other", "note": "qisqa qoida"}]}
"wrong" va "right" bir xil bo'lmasin. Izohlar o'zbek tilida (lotin).`;
  const r = await postJson(
    "api.deepseek.com",
    "/chat/completions",
    opts.apiKey,
    {
      model: opts.model,
      temperature: 0,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Esse matni:\n"""\n${opts.text}\n"""` },
      ],
    },
    90_000,
  );
  const j = r.json as { choices?: { message?: { content?: string } }[] } | null;
  const content = j?.choices?.[0]?.message?.content;
  if (r.status !== 200 || !content) return [];
  return normalize(resultSchema.parse({ criteria: [], ...(parseFirstJson(content) as object) })).mistakes;
}

/**
 * Model ba'zan JSON'dan keyin (yoki oldin) qo'shimcha matn yozadi: birinchi to'liq {...} obyektini ajratib olamiz.
 * Satr ichidagi qavslar va qochirilgan qo'shtirnoqlar hisobga olinadi.
 */
export function parseFirstJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    if (start < 0) throw new Error("AI javobida JSON yo'q");
    let depth = 0;
    let inStr = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (inStr) {
        if (ch === "\\") i++;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) return JSON.parse(raw.slice(start, i + 1));
    }
    throw new Error("AI javobidagi JSON to'liq emas");
  }
}

/** Mezon kalitlari va ball qadamlari bizning jadval bo'yicha tekshiriladi (AI'ga to'liq ishonilmaydi) */
export function normalize(raw: z.input<typeof resultSchema>): AiEssayResult {
  const r = resultSchema.parse(raw);
  const criteria = ESSAY_RUBRIC.map((c) => {
    const got = r.criteria.find((x) => x.key === c.key);
    const score = Math.max(0, Math.min(c.max, Math.round((got?.score ?? 0) * 2) / 2));
    return { key: c.key as string, score, comment: got?.comment?.trim() || null };
  });
  return {
    special: r.special ?? null,
    criteria,
    feedback: r.feedback.trim(),
    mistakes: r.mistakes
      // AI ba'zan to'g'ri so'zni "xato" deb ko'rsatadi: bir xil juftliklar olib tashlanadi
      .filter((m) => m.wrong.trim() && m.wrong.trim().toLowerCase() !== m.right.trim().toLowerCase())
      .slice(0, 15)
      .map((m) => ({ wrong: m.wrong.slice(0, 200), right: m.right.slice(0, 200), note: m.note?.slice(0, 300) || null, type: mistakeType(m.type, m.note) })),
    tips: r.tips
      .filter((t) => t.text.trim())
      .slice(0, 5)
      .map((t) => ({
        focus: t.focus && ESSAY_RUBRIC.some((c) => c.key === t.focus) ? t.focus : null,
        text: t.text.trim().slice(0, 500),
        example: t.example?.trim().slice(0, 500) || null,
      })),
  };
}

/** Oddiy matnli javob (hisobotlar uchun) */
export async function deepseekText(opts: { apiKey: string; model: string; system: string; user: string; maxTokens?: number }): Promise<string> {
  const r = await postJson(
    "api.deepseek.com",
    "/chat/completions",
    opts.apiKey,
    {
      model: opts.model,
      temperature: 0.3,
      max_tokens: opts.maxTokens ?? 1500,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    },
    90_000,
  );
  const j = r.json as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null;
  if (r.status !== 200) throw new Error(`DeepSeek ${r.status}: ${j?.error?.message ?? "javob yo'q"}`);
  const content = j?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("DeepSeek bo'sh javob qaytardi");
  return content;
}
