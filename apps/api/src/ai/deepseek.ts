import { ERROR_TYPES, ESSAY_RUBRIC, type ErrorTypeKey } from "@onatili/shared";
import { z } from "zod";
import { type AskModel, parseFirstJson } from "./ask";
import { postJson, RETRY_STATUS, sleep } from "./http";

export interface AiEssayResult {
  /** Esse tekshirilmaydigan holat (AI aniqlaydi): mavzuga mos emas, ko'chirilgan, faqat kirish qismi */
  special: "OFF_TOPIC" | "COPIED" | "ONLY_INTRO" | null;
  criteria: { key: string; score: number; comment: string | null }[];
  feedback: string;
  mistakes: { wrong: string; right: string; note: string | null; type: ErrorTypeKey }[];
  /** Aniq tavsiyalar: eng zaif bandlar bo'yicha, o'quvchining o'z jumlasi yaxshilangan namunasi bilan */
  tips: { focus: string | null; text: string; example: string | null }[];
  /** Bazaga yoziladigan provayder nomi; AI ishlatilmagan bo'lsa — yo'q */
  provider?: string;
  /** Chuqur tahlil (xatboshilar xaritasi, dalillar, bosqichlar vaqti) — ustoz va tekshiruv uchun saqlanadi */
  analysis?: unknown;
}

const resultSchema = z.object({
  special: z.enum(["OFF_TOPIC", "COPIED", "ONLY_INTRO"]).nullish().catch(null),
  criteria: z.array(z.object({ key: z.string(), score: z.coerce.number(), comment: z.string().nullish() })).default([]),
  feedback: z.string().default(""),
  mistakes: z.array(z.object({ wrong: z.string(), right: z.string(), note: z.string().nullish(), type: z.string().nullish() })).default([]),
  tips: z
    .array(z.object({ focus: z.string().nullish(), text: z.string(), example: z.string().nullish() }))
    .default([])
    .catch([]),
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

export type Effort = "off" | "low" | "high" | "max";
export interface DeepSeekOpts {
  apiKey: string;
  model: string;
  effort?: Effort;
}

/**
 * JSON javob so'rovi. Fikrlash rejimida (effort != off) model avval o'ylab oladi — chuqur tahlil uchun shart.
 * Band (429/5xx), bo'sh yoki buzilgan JSON javobda bir marta qayta uriniladi.
 */
export async function deepseekJson<S extends z.ZodTypeAny>(
  opts: DeepSeekOpts,
  system: string,
  user: string,
  schema: S,
  maxTokens = 8000,
): Promise<z.output<S>> {
  const thinking = !!opts.effort && opts.effort !== "off";
  const body = {
    model: opts.model,
    max_tokens: thinking ? 32_000 : maxTokens,
    response_format: { type: "json_object" },
    thinking: { type: thinking ? "enabled" : "disabled" },
    ...(thinking ? { reasoning_effort: opts.effort } : { temperature: 0 }),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  let last: Error = new Error("DeepSeek javob bermadi");
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(3000);
    let r: { status: number; json: unknown };
    try {
      r = await postJson("api.deepseek.com", "/chat/completions", opts.apiKey, body, thinking ? 300_000 : 150_000);
    } catch (e) {
      last = e as Error;
      continue;
    }
    const j = r.json as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null;
    if (r.status !== 200) {
      last = new Error(`DeepSeek ${r.status}: ${j?.error?.message ?? "javob yo'q"}`);
      if (RETRY_STATUS.has(r.status)) continue;
      throw last;
    }
    const content = j?.choices?.[0]?.message?.content;
    if (!content?.trim()) {
      last = new Error("DeepSeek bo'sh javob qaytardi");
      continue;
    }
    try {
      return schema.parse(parseFirstJson(content));
    } catch (e) {
      last = e as Error;
    }
  }
  throw last;
}

export const deepseekModel = (opts: DeepSeekOpts): AskModel => ({
  provider: "deepseek",
  model: opts.model,
  effort: opts.effort ?? "off",
  ask: (system, user, schema) => deepseekJson(opts, system, user, schema),
});

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
      .slice(0, 40)
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
      thinking: { type: "disabled" },
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
