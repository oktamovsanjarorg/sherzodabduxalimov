/**
 * O'lchov uchun model provayderlari: bitta savol yuboriladi; matn, haqiqiy model versiyasi va token sarfi qaytadi.
 */
export interface Usage {
  input: number;
  cached: number;
  output: number;
}
export interface Answer {
  text: string | null;
  model: string | null;
  usage: Usage | null;
}
export interface Image {
  mime: string;
  data: Buffer;
}
export interface Provider {
  /** .env dagi kalit nomi */
  key: string;
  defaultModel: string;
  /** Rasm o'qiydigan odatiy model (yo'q bo'lsa rasm qabul qilinmaydi) */
  vision?: string;
  ask: (model: string, effort: string, text: string, images?: Image[]) => Promise<Answer>;
}

export const env = (k: string) => process.env[k]?.split("#")[0].trim() || undefined;

/** Kalit noto'g'ri yoki balans tugagan: qayta urinish ham, qolgan savollar ham foydasiz */
const isFatalStatus = (status: number) => [401, 402, 403].includes(status);

export class ApiError extends Error {
  status: number;
  fatal: boolean;
  constructor(message: string, status: number, fatal = isFatalStatus(status)) {
    super(message);
    this.status = status;
    this.fatal = fatal;
  }
}

const dataUrl = (i: Image) => `data:${i.mime};base64,${i.data.toString("base64")}`;

function keyOf(name: string): string {
  const key = env(name);
  if (!key) throw new Error(`.env da ${name} yo'q`);
  return key;
}

async function post<T>(url: string, headers: Record<string, string>, body: object): Promise<{ ok: boolean; status: number; json: T | null }> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  return { ok: r.ok, status: r.status, json: (await r.json().catch(() => null)) as T | null };
}

interface DeepSeekJson {
  model?: string;
  error?: { message?: string };
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; prompt_cache_hit_tokens?: number; completion_tokens?: number };
}

async function askDeepSeek(model: string, effort: string, text: string, images: Image[] = []): Promise<Answer> {
  const thinking = effort !== "off";
  const {
    ok,
    status,
    json: j,
  } = await post<DeepSeekJson>(
    "https://api.deepseek.com/chat/completions",
    { authorization: `Bearer ${keyOf("DEEPSEEK_API_KEY")}` },
    {
      model,
      max_tokens: thinking ? 32_000 : 1024,
      thinking: { type: thinking ? "enabled" : "disabled" },
      ...(thinking ? { reasoning_effort: effort } : { temperature: 0 }),
      messages: [
        {
          role: "user",
          content: images.length ? [{ type: "text", text }, ...images.map((i) => ({ type: "image_url", image_url: { url: dataUrl(i) } }))] : text,
        },
      ],
    },
  );
  if (!ok) throw new ApiError(`DeepSeek ${status}: ${j?.error?.message ?? ""}`, status);
  const u = j?.usage;
  return {
    text: j?.choices?.[0]?.message?.content ?? null,
    model: j?.model ?? null,
    usage: u ? { input: u.prompt_tokens ?? 0, cached: u.prompt_cache_hit_tokens ?? 0, output: u.completion_tokens ?? 0 } : null,
  };
}

interface GeminiJson {
  modelVersion?: string;
  error?: { message?: string };
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  usageMetadata?: { promptTokenCount?: number; cachedContentTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

async function askGemini(model: string, effort: string, text: string): Promise<Answer> {
  const {
    ok,
    status,
    json: j,
  } = await post<GeminiJson>(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": keyOf("GEMINI_API_KEY") },
    { contents: [{ role: "user", parts: [{ text }] }], generationConfig: effort === "off" ? {} : { thinkingConfig: { thinkingLevel: effort } } },
  );
  if (!ok) throw new ApiError(`Gemini ${status}: ${j?.error?.message ?? ""}`, status);
  const parts = j?.candidates?.[0]?.content?.parts ?? [];
  const u = j?.usageMetadata;
  return {
    text:
      parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("") || null,
    // Javobdagi haqiqiy versiya: so'ralgan model jim almashtirilsa ham ko'rinadi
    model: j?.modelVersion ?? null,
    usage: u
      ? { input: u.promptTokenCount ?? 0, cached: u.cachedContentTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) }
      : null,
  };
}

interface OpenAiJson {
  model?: string;
  status?: string;
  error?: { message?: string; code?: string } | null;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
  usage?: { input_tokens?: number; input_tokens_details?: { cached_tokens?: number }; output_tokens?: number };
}

/**
 * OpenAI Responses API. effort=medium — leaderboard'dagi sozlama. Fikrlash tokenlari output_tokens ichida va chiqish narxida.
 * store=false: javob OpenAI'da keyin o'qiladigan holat sifatida saqlanmaydi.
 */
async function askOpenAi(model: string, effort: string, text: string, images: Image[] = []): Promise<Answer> {
  const content = [{ type: "input_text", text }, ...images.map((i) => ({ type: "input_image", image_url: dataUrl(i), detail: "high" }))];
  const input = images.length ? [{ role: "user", content }] : text;
  const {
    ok,
    status,
    json: j,
  } = await post<OpenAiJson>(
    `${env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1"}/responses`,
    { authorization: `Bearer ${keyOf("OPENAI_API_KEY")}` },
    { model, input, max_output_tokens: 32_000, reasoning: { effort: effort === "off" ? "none" : effort }, store: false },
  );
  if (!ok) {
    // Balans tugaganda ham 429 keladi: oddiy tezlik limitidan farqi — kodi
    const fatal = isFatalStatus(status) || j?.error?.code === "insufficient_quota";
    throw new ApiError(`OpenAI ${status}: ${j?.error?.message ?? ""}`, status, fatal);
  }
  if (j?.status === "failed") throw new ApiError(`OpenAI: ${j.error?.message ?? "javob failed"}`, 500);
  const u = j?.usage;
  return {
    text:
      (j?.output ?? [])
        .filter((o) => o.type === "message")
        .flatMap((o) => o.content ?? [])
        .filter((c) => c.type === "output_text")
        .map((c) => c.text ?? "")
        .join("") || null,
    model: j?.model ?? null,
    usage: u ? { input: u.input_tokens ?? 0, cached: u.input_tokens_details?.cached_tokens ?? 0, output: u.output_tokens ?? 0 } : null,
  };
}

export const PROVIDERS: Partial<Record<string, Provider>> = {
  deepseek: { key: "DEEPSEEK_API_KEY", defaultModel: "deepseek-v4-pro", vision: "deepseek-flash", ask: askDeepSeek },
  gemini: { key: "GEMINI_API_KEY", defaultModel: "gemini-3.8-flash", ask: askGemini },
  openai: { key: "OPENAI_API_KEY", defaultModel: "gpt-6-luna", vision: "gpt-6-luna", ask: askOpenAi },
};

/**
 * 1M token narxi ($), 2026-11-24 da tekshirilgan. DeepSeek — PEAK (yuqori chegara): api-docs.deepseek.com/quick_start/pricing.
 * OpenAI — Standard: developers.openai.com/api/docs/pricing.
 */
const PRICE: Partial<Record<string, { hit: number; miss: number; out: number }>> = {
  "deepseek-v4-pro": { hit: 0.044, miss: 1.32, out: 3.96 },
  "deepseek-flash": { hit: 0.006, miss: 0.3, out: 1.2 },
  "gpt-6-luna": { hit: 0.01, miss: 0.1, out: 0.5 },
};

/** Narx ($); narxi ro'yxatda yo'q model uchun null */
export function costOf(model: string, u: Usage): number | null {
  const p = PRICE[model];
  return p ? ((u.input - u.cached) * p.miss + u.cached * p.hit + u.output * p.out) / 1e6 : null;
}
