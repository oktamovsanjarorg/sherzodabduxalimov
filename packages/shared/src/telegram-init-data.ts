import { createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramInitUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface ValidatedInitData {
  user: TelegramInitUser;
  authDate: Date;
  startParam?: string;
}

export class InitDataError extends Error {}

/**
 * Telegram Mini App initData'ni HMAC-SHA256 orqali tekshiradi.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 86400,
  now: Date = new Date(),
): ValidatedInitData {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new InitDataError("hash yo'q");
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new InitDataError("imzo noto'g'ri");
  }

  const authDateSec = Number(params.get("auth_date"));
  if (!authDateSec) throw new InitDataError("auth_date yo'q");
  if (now.getTime() / 1000 - authDateSec > maxAgeSec) {
    throw new InitDataError("initData eskirgan");
  }

  const userRaw = params.get("user");
  if (!userRaw) throw new InitDataError("user yo'q");
  const user = JSON.parse(userRaw) as TelegramInitUser;

  return {
    user,
    authDate: new Date(authDateSec * 1000),
    startParam: params.get("start_param") ?? undefined,
  };
}

/** Testlar va lokal dev uchun: imzolangan initData yasaydi */
export function signInitData(
  fields: Record<string, string>,
  botToken: string,
): string {
  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}
