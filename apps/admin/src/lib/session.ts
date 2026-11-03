import type { Me } from "@onatili/shared";

const KEY = "onatili-admin-session";

export interface Session {
  token: string;
  user: Me;
  expiresAt: number;
}

/** sessionStorage: brauzer yopilsa sessiya ham tugaydi (umumiy kompyuterlarda xavfsizroq) */
export function loadSession(): Session | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Session | null;
    return s && s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  sessionStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession() {
  sessionStorage.removeItem(KEY);
}

export function parseTtl(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return 3600_000;
  return Number(m[1]) * { s: 1000, m: 60_000, h: 3600_000, d: 86_400_000 }[m[2] as "s" | "m" | "h" | "d"];
}
