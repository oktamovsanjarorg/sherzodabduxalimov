import type { z } from "zod";
import { type AiImage, type AskModel, dataUrl, parseFirstJson } from "./ask";
import { locatePrompt, OCR_PROMPT, parseLocated } from "./handwriting";
import { postJson, RETRY_STATUS, sleep } from "./http";

export interface OpenAiOpts {
  apiKey: string;
  model: string;
  effort: "none" | "low" | "medium" | "high" | "xhigh" | "max";
}

interface ResponsesJson {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
  error?: { message?: string; code?: string } | null;
}

/** Fikrlash tokenlari ham shu chegaraga kiradi */
const MAX_TOKENS = 32_000;
const TIMEOUT_MS = 300_000;

/** Kalit bo'lagi xato matnida qaytishi mumkin: xato bazaga va logga yoziladi, shuning uchun yashiriladi */
const hideKey = (s: string) => s.replace(/sk-[\w*-]+/g, "sk-***");

/** Javobdagi matn; javob to'liq bo'lmasa — xato (yarim JSON yoki yarim esse saqlanmasin) */
export function responseText(json: unknown): string {
  const j = json as ResponsesJson | null;
  if (j?.status === "incomplete") throw new Error(`OpenAI javobi to'liq emas (${j.incomplete_details?.reason ?? "?"})`);
  const text = (j?.output ?? [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("OpenAI bo'sh javob qaytardi");
  return text;
}

type Content = string | object[];
interface Ask<T> {
  system?: string;
  user: Content;
  json?: boolean;
  parse: (text: string) => T;
}

/** Responses API. Band (429/5xx), bo'sh yoki buzilgan javobda bir marta qayta uriniladi; mablag' tugagan bo'lsa — yo'q. */
async function respond<T>(opts: OpenAiOpts, q: Ask<T>): Promise<T> {
  const body = {
    model: opts.model,
    // Ko'rsatma "input" ichida: JSON rejimi "JSON" so'zini aynan shu yerda talab qiladi
    input: [...(q.system ? [{ role: "developer", content: q.system }] : []), { role: "user", content: q.user }],
    reasoning: { effort: opts.effort },
    max_output_tokens: MAX_TOKENS,
    // O'quvchi essesi OpenAI'da saqlab qo'yilmasin
    store: false,
    ...(q.json ? { text: { format: { type: "json_object" } } } : {}),
  };
  let last = new Error("OpenAI javob bermadi");
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(3000);
    try {
      const r = await postJson("api.openai.com", "/v1/responses", opts.apiKey, body, TIMEOUT_MS);
      if (r.status === 200) return q.parse(responseText(r.json));
      const err = (r.json as ResponsesJson | null)?.error;
      last = new Error(hideKey(`OpenAI ${r.status}: ${err?.message ?? "javob yo'q"}`));
      if (!RETRY_STATUS.has(r.status) || err?.code === "insufficient_quota") break;
    } catch (e) {
      last = e as Error;
    }
  }
  throw last;
}

export const openaiModel = (opts: OpenAiOpts): AskModel => ({
  provider: "gpt",
  model: opts.model,
  effort: opts.effort,
  ask: <S extends z.ZodTypeAny>(system: string, user: string, schema: S) =>
    respond<z.output<S>>(opts, { system, user, json: true, parse: (t) => schema.parse(parseFirstJson(t)) }),
});

const imageParts = (images: AiImage[]) => images.map((i) => ({ type: "input_image", image_url: dataUrl(i), detail: "high" }));

/** O'zbek kirillida yo'q harflar (mo'g'ul, qozoq): o'quvchi yozmagan, model boshqa tilga o'tib ketgan */
const NOT_UZBEK = /[үөәңұһі]/iu;

/** O'qilgan matn begona tilga o'tib ketgan bo'lsa — xato (qayta uriniladi) */
export function checkRead(text: string): string {
  if (NOT_UZBEK.test(text)) throw new Error("OpenAI qo'lyozmani boshqa tilda qaytardi");
  return text;
}

/** Qo'lyozma varoqlarini matnga aylantiradi */
export const openaiRead = (opts: OpenAiOpts, images: AiImage[]) =>
  respond(opts, { user: [{ type: "input_text", text: OCR_PROMPT }, ...imageParts(images)], parse: checkRead });

/** Xato iboralarning varoqdagi joyi */
export async function openaiLocate(opts: OpenAiOpts, images: AiImage[], phrases: string[]) {
  if (!phrases.length) return [];
  const text = locatePrompt(images.length, phrases);
  return respond(opts, {
    user: [{ type: "input_text", text }, ...imageParts(images)],
    json: true,
    parse: (t) => parseLocated(t, images.length, phrases.length),
  });
}
