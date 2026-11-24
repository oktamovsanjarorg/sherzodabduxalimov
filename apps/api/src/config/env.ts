import { z } from "zod";

/** .env qiymatidagi "# izoh" qismi olib tashlanadi; bo'sh qiymat — standart qiymat */
const noComment = (v: unknown) => (typeof v === "string" ? v.split("#")[0].trim() || undefined : v);

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  API_PORT: z.coerce.number().default(4100),
  API_HOST: z.string().default("127.0.0.1"),
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN kerak"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET kamida 16 belgi"),
  JWT_TTL: z.string().default("1h"),
  INIT_DATA_MAX_AGE_SEC: z.coerce.number().default(86400),
  CORS_ORIGINS: z.string().default("http://localhost:5180"),
  // Ega (TEACHER) bo'ladigan Telegram username'lar, vergul bilan, @ belgisisiz
  OWNER_USERNAMES: z.string().default(""),
  // Bot username (@ belgisisiz): ota-onaga yuboriladigan t.me havolasi uchun
  BOT_USERNAME: z.string().default("sherzodabduxalimovbot"),
  // Admin panel manzili (bot yuboradigan kirish havolasi uchun)
  ADMIN_URL: z.string().default("http://127.0.0.1:5181/admin"),
  ADMIN_JWT_TTL: z.string().default("12h"),
  MEDIA_DIR: z.string().default("./.media"),
  // Kechalik zaxira nusxalari papkasi (read-only ulangan). Bo'lmasa admin paneldagi "Zaxira" bo'limi o'chiq
  BACKUP_DIR: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6381"),
  QUEUE_PREFIX: z.string().default("onatili"),
  // HLS segmentlari qayerdan beriladi: dev'da API'ning o'zi, prod'da nginx (/media-files/v)
  MEDIA_SEGMENT_BASE: z.string().default("/api/media-seg"),
  // AI esse tekshiruvi. Qiymatdagi "# izoh" qismi olib tashlanadi (.env da shunday yozilgan bo'lishi mumkin)
  AI_PROVIDER: z.preprocess((v) => (typeof v === "string" ? v.split("#")[0].trim() : v), z.enum(["deepseek", "none"]).catch("none")).default("none"),
  DEEPSEEK_API_KEY: z.preprocess((v) => (typeof v === "string" ? v.split("#")[0].trim() || undefined : v), z.string().optional()),
  // Hisobotlar uchun tezkor model ("deepseek-chat" nomi 2026-07-24 da o'chirilgan)
  DEEPSEEK_MODEL: z.preprocess(noComment, z.string().default("deepseek-flash")),
  // Esse: OpenAI kaliti bo'lsa GPT qo'lyozmani o'qiydi, tahlil qiladi va xato topadi; DeepSeek qayta tekshiradi va taqriz yozadi.
  // Kalit bo'lmasa hammasini DeepSeek bajaradi (GPT'ni o'chirish uchun kalitni olib tashlash yetadi).
  OPENAI_API_KEY: z.preprocess(noComment, z.string().optional()),
  OPENAI_MODEL: z.preprocess(noComment, z.string().default("gpt-6-luna")),
  OPENAI_ESSAY_EFFORT: z.preprocess(noComment, z.enum(["none", "low", "medium", "high", "xhigh", "max"]).catch("medium").default("medium")),
  // Esse uchun DeepSeek modeli, fikrlash rejimida (off | low | high | max)
  DEEPSEEK_ESSAY_MODEL: z.preprocess(noComment, z.string().default("deepseek-flash")),
  DEEPSEEK_ESSAY_EFFORT: z.preprocess(noComment, z.enum(["off", "low", "high", "max"]).catch("high").default("high")),
  // OpenAI kaliti bo'lmagandagina ishlatiladi: qo'lyozma esseni o'qish. Ikkala kalit ham bo'lmasa AI faqat yozilgan matnni tekshiradi
  GEMINI_API_KEY: z.preprocess((v) => (typeof v === "string" ? v.split("#")[0].trim() || undefined : v), z.string().optional()),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  // Mini App manzili: bot xabaridagi "Obunani uzaytirish" tugmasi uchun (bo'lmasa tugmasiz yuboriladi)
  MINIAPP_URL: z.string().url().startsWith("https://").optional().catch(undefined),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Env xato: ${msg}`);
  }
  return parsed.data;
}

export const ENV = Symbol("ENV");
