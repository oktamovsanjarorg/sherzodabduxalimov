import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Video uchun qisqa muddatli imzolangan token: "<exp>.<userShort>.<sig>".
 * HLS pleyer (ayniqsa iOS'dagi native pleyer) sarlavha qo'sha olmaydi, shuning uchun token URL'da yuriladi.
 */
export const MEDIA_TOKEN_TTL_SEC = 3 * 3600;

export function signMediaToken(secret: string, videoId: string, userId: string, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + MEDIA_TOKEN_TTL_SEC;
  const u = Buffer.from(userId).toString("base64url");
  const sig = createHmac("sha256", secret).update(`media:${videoId}:${u}:${exp}`).digest("base64url");
  return `${exp}.${u}.${sig}`;
}

/** To'g'ri bo'lsa userId'ni qaytaradi, aks holda null */
export function verifyMediaToken(secret: string, videoId: string, token: string | undefined, nowMs = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [expStr, u, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return null;
  const expected = createHmac("sha256", secret).update(`media:${videoId}:${u}:${exp}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Buffer.from(u, "base64url").toString();
}
