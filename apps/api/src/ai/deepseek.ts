import { ESSAY_RUBRIC, RUBRIC_STEPS } from "@onatili/shared";
import { request } from "node:https";
import { z } from "zod";

export interface AiEssayResult {
  /** Esse tekshirilmaydigan holat (AI aniqlaydi): mavzuga mos emas, ko'chirilgan, faqat kirish qismi */
  special: "OFF_TOPIC" | "COPIED" | "ONLY_INTRO" | null;
  criteria: { key: string; score: number; comment: string | null }[];
  feedback: string;
  mistakes: { wrong: string; right: string; note: string | null }[];
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
  mistakes: z.array(z.object({ wrong: z.string(), right: z.string(), note: z.string().nullish() })).default([]),
});

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
{"special": null, "criteria": [{"key": "style", "score": 1.5, "comment": "..."}, ... 12 ta band ...], "feedback": "...", "mistakes": [{"wrong": "...", "right": "...", "note": "imlo|punktuatsiya|qo'shimcha|so'z qo'llash: qisqa qoida"}]}
- "comment": har bir bandga 1–2 jumla, xatolar sonini ko'rsat (masalan, "imlo xatosi 3 o'rinda").
- "feedback": ekspert taqrizi — 3–5 jumlali xulosa va yaxshilash bo'yicha aniq maslahat.
- "mistakes": eng muhim xatolar (ko'pi bilan 15 ta). "wrong" va "right" bir xil bo'lmasin; ishonching komil bo'lmasa kiritma.
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
  return normalize(resultSchema.parse(parseFirstJson(content)));
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
export function normalize(r: z.infer<typeof resultSchema>): AiEssayResult {
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
      .map((m) => ({ wrong: m.wrong.slice(0, 200), right: m.right.slice(0, 200), note: m.note?.slice(0, 300) || null })),
  };
}
