/**
 * Admin paneldagi xabar va tavsiyalarni yashirish mantig'i (saqlash joyi — admin `lib/dismiss`).
 * Xabar kalit + son bilan yashiriladi: son oshsa qaytadi. Ish bajarilib son kamaysa, saqlangan son ham
 * kamayadi (`reconcile`), aks holda keyingi yangi ishlar ko'rinmay qolardi.
 */
export interface DismissEntry {
  count: number;
  /** Yashirilgan vaqt (ms). Eski yozuvlarda 0 */
  at: number;
}
export type DismissMap = Record<string, DismissEntry>;

/** Yordamchi tavsiyasi bajarilmagan bo'lsa, shuncha vaqtdan keyin yana chiqadi */
export const ADVICE_SNOOZE_MS = 7 * 86_400_000;

/** Saqlangan JSON'ni o'qiydi; eski format: { kalit: son } */
export function parseDismissed(json: string | null): DismissMap {
  try {
    const raw: unknown = JSON.parse(json ?? "{}");
    if (!raw || typeof raw !== "object") return {};
    const out: DismissMap = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "number") out[k] = { count: v, at: 0 };
      else if (v && typeof v.count === "number" && typeof v.at === "number") out[k] = { count: v.count, at: v.at };
    }
    return out;
  } catch {
    return {};
  }
}

/** snoozeMs berilsa, muddat o'tgach xabar yana ko'rinadi */
export function isDismissed(map: DismissMap, key: string, count: number, now: number, snoozeMs?: number): boolean {
  const e = map[key];
  if (!e || e.count < count) return false;
  return snoozeMs === undefined || now - e.at < snoozeMs;
}

/**
 * Hozirgi sonlarga moslaydi: ish tugagan bo'lsa yozuv o'chadi, son kamaygan bo'lsa kamayadi.
 * Faqat `owns` ga tegishli kalitlar; o'zgarish bo'lmasa o'sha obyektning o'zi qaytadi.
 */
export function reconcileDismissed(map: DismissMap, current: Record<string, number>, owns: (key: string) => boolean): DismissMap {
  const next: DismissMap = {};
  let changed = false;
  for (const [k, e] of Object.entries(map)) {
    const count = owns(k) ? (current[k] ?? 0) : e.count;
    if (count <= 0 && owns(k)) changed = true;
    else if (count < e.count) {
      next[k] = { ...e, count };
      changed = true;
    } else next[k] = e;
  }
  return changed ? next : map;
}
