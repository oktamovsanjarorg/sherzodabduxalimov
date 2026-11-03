import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  API_PORT: z.coerce.number().default(4100),
  API_HOST: z.string().default("127.0.0.1"),
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN kerak"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET kamida 16 belgi"),
  JWT_TTL: z.string().default("1h"),
  INIT_DATA_MAX_AGE_SEC: z.coerce.number().default(86400),
  CORS_ORIGINS: z.string().default("http://localhost:5180"),
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
