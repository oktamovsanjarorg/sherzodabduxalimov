import { ESSAY_RUBRIC } from "@onatili/shared";
import { request } from "node:https";
import { z } from "zod";

export interface AiEssayResult {
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
  criteria: z.array(z.object({ key: z.string(), score: z.coerce.number(), comment: z.string().nullish() })),
  feedback: z.string().default(""),
  mistakes: z.array(z.object({ wrong: z.string(), right: z.string(), note: z.string().nullish() })).default([]),
});

export function buildEssayPrompt(topic: string, text: string, handwritten = false) {
  const rubric = ESSAY_RUBRIC.map((c) => `- "${c.key}": ${c.label} (0–${c.max} ball)`).join("\n");
  const system = `Sen tajribali ona tili va adabiyot o'qituvchisisan. Abituriyentning o'zbek tilida (lotin yozuvida) yozgan essesini Milliy sertifikat talablari bo'yicha xolis baholaysan.
Mezonlar:
${rubric}
Qoidalar:
- Har bir mezonga butun yoki 0,5 lik ball qo'y, maksimumdan oshirma. Har biriga 1–2 jumlali izoh yoz.
- "mistakes": eng muhim imlo, tinish belgisi va grammatik xatolar (ko'pi bilan 15 ta): "wrong" — matndagi noto'g'ri shakl, "right" — to'g'risi, "note" — qisqa qoida. Faqat aniq xatolarni yoz: "wrong" va "right" bir xil bo'lmasin, ishonching komil bo'lmasa kiritma.
- "feedback": o'quvchiga 3–5 jumlali umumiy xulosa va yaxshilash bo'yicha aniq maslahat.
- Matn mavzuga umuman aloqasiz yoki juda qisqa bo'lsa, ballarni shunga mos pasaytir.
- Barcha izohlar o'zbek tilida (lotin) bo'lsin.${
    handwritten
      ? `
- Matn o'quvchining qo'lyozmasidan avtomatik o'qib olingan. [?] belgisi o'qib bo'lmagan so'zni bildiradi: uni xato deb hisoblama va ball kamaytirma. Faqat aniq ko'rinib turgan xatolarni hisobga ol.`
      : ""
  }
Javobni faqat JSON ko'rinishida qaytar: {"criteria":[{"key":"...","score":0,"comment":"..."}],"feedback":"...","mistakes":[{"wrong":"...","right":"...","note":"..."}]}`;
  const user = `Esse mavzusi: ${topic}\n\nEsse matni:\n"""\n${text}\n"""`;
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
      max_tokens: 3000,
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

/** Mezon kalitlari va ball chegaralari bizning jadval bo'yicha tekshiriladi (AI'ga to'liq ishonilmaydi) */
export function normalize(r: z.infer<typeof resultSchema>): AiEssayResult {
  const criteria = ESSAY_RUBRIC.map((c) => {
    const got = r.criteria.find((x) => x.key === c.key);
    const score = Math.max(0, Math.min(c.max, Math.round((got?.score ?? 0) * 2) / 2));
    return { key: c.key, score, comment: got?.comment?.trim() || null };
  });
  return {
    criteria,
    feedback: r.feedback.trim(),
    mistakes: r.mistakes
      // AI ba'zan to'g'ri so'zni "xato" deb ko'rsatadi: bir xil juftliklar olib tashlanadi
      .filter((m) => m.wrong.trim() && m.wrong.trim().toLowerCase() !== m.right.trim().toLowerCase())
      .slice(0, 15)
      .map((m) => ({ wrong: m.wrong.slice(0, 200), right: m.right.slice(0, 200), note: m.note?.slice(0, 300) || null })),
  };
}
