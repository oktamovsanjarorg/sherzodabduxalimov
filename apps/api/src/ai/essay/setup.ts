import type { Env } from "../../config/env";
import type { AiImage } from "../ask";
import { type AiEssayResult, deepseekModel } from "../deepseek";
import { locatePhrases, transcribeHandwriting } from "../gemini";
import type { LocatedPhrase } from "../handwriting";
import { openaiLocate, openaiModel, openaiRead } from "../openai";
import { gradeEssay } from "./grade";

type AiEnv = Pick<
  Env,
  | "AI_PROVIDER"
  | "OPENAI_API_KEY"
  | "OPENAI_MODEL"
  | "OPENAI_ESSAY_EFFORT"
  | "DEEPSEEK_API_KEY"
  | "DEEPSEEK_ESSAY_MODEL"
  | "DEEPSEEK_ESSAY_EFFORT"
  | "GEMINI_API_KEY"
  | "GEMINI_MODEL"
>;

export interface EssayAi {
  grade: (topic: string, text: string, handwritten: boolean) => Promise<AiEssayResult>;
  /** Qo'lyozmani o'qish; yo'q bo'lsa AI faqat yozilgan matnni tekshiradi */
  read?: (images: AiImage[]) => Promise<string>;
  locate?: (images: AiImage[], phrases: string[]) => Promise<LocatedPhrase[]>;
}

/**
 * Esse tekshiruvini qaysi modellar bajarishi. OPENAI_API_KEY bor — GPT (o'qish, tahlil, xatolar) + DeepSeek (qayta tekshiruv, taqriz);
 * yo'q — faqat DeepSeek (qo'lyozmani Gemini o'qiydi). Taqrizni GPT emas, DeepSeek yozadi: gpt-6-luna o'zbekcha uzun matnda
 * boshqa tilga o'tib ketadi (docs/ESSAY_AI_RESEARCH.md).
 * GPT yoqilgan bo'lsa, xatoda boshqa modelga jim o'tilmaydi: vazifa qayta uriniladi, sababi bazaga yoziladi.
 */
export function essayAi(env: AiEnv): EssayAi | null {
  if (env.AI_PROVIDER !== "deepseek" || !env.DEEPSEEK_API_KEY) return null;
  const deepseek = deepseekModel({ apiKey: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_ESSAY_MODEL, effort: env.DEEPSEEK_ESSAY_EFFORT });
  if (env.OPENAI_API_KEY) {
    const opts = { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL, effort: env.OPENAI_ESSAY_EFFORT };
    const main = openaiModel(opts);
    return {
      grade: (topic, text, handwritten) => gradeEssay({ main, reviewer: deepseek, topic, text, handwritten }),
      read: (images) => openaiRead(opts, images),
      locate: (images, phrases) => openaiLocate(opts, images, phrases),
    };
  }
  const grade: EssayAi["grade"] = (topic, text, handwritten) => gradeEssay({ main: deepseek, reviewer: deepseek, topic, text, handwritten });
  if (!env.GEMINI_API_KEY) return { grade };
  const gemini = { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL };
  return {
    grade,
    read: (images) => transcribeHandwriting({ ...gemini, images }),
    locate: (images, phrases) => locatePhrases({ ...gemini, images, phrases }),
  };
}
