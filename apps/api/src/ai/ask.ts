import type { z } from "zod";

/** JSON javob so'raydigan model: qaysi provayder ekanini esse tekshiruvi bilmaydi */
export interface AskModel {
  /** Bazaga yoziladigan provayder nomi */
  provider: "gpt" | "deepseek";
  model: string;
  effort: string;
  ask<S extends z.ZodTypeAny>(system: string, user: string, schema: S): Promise<z.output<S>>;
}

export interface AiImage {
  mime: string;
  data: Buffer;
}
export const dataUrl = (i: AiImage) => `data:${i.mime};base64,${i.data.toString("base64")}`;

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
