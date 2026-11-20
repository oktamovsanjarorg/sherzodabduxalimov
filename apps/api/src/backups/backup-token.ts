import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Zaxira faylini yuklab olish havolasi uchun qisqa muddatli imzo: "<exp>.<userShort>.<sig>".
 * Brauzer faylni o'zi (oddiy havola orqali) yuklashi uchun: sarlavha qo'sha olmaydi, shuning uchun token URL'da.
 * Faylni JS xotirasiga yig'ib saqlash katta media arxivida va telefonda ishlamay qolardi.
 */
export const BACKUP_TOKEN_TTL_SEC = 10 * 60;

const mac = (secret: string, name: string, u: string, exp: number) => createHmac("sha256", secret).update(`backup:${name}:${u}:${exp}`).digest("base64url");

export function signBackupToken(secret: string, name: string, userId: string, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + BACKUP_TOKEN_TTL_SEC;
  const u = Buffer.from(userId).toString("base64url");
  return `${exp}.${u}.${mac(secret, name, u, exp)}`;
}

/** To'g'ri va muddati o'tmagan bo'lsa userId, aks holda null */
export function verifyBackupToken(secret: string, name: string, token: string | undefined, nowMs = Date.now()): string | null {
  const parts = token?.split(".") ?? [];
  if (parts.length !== 3) return null;
  const [expStr, u, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(secret, name, u, exp));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Buffer.from(u, "base64url").toString();
}
