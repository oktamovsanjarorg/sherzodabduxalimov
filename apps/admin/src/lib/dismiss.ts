import { isDismissed, parseDismissed, reconcileDismissed, type DismissMap } from "@onatili/shared";
import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Bosh sahifadagi «Bugun» xabarlari va Yordamchi tavsiyalarini yashirish (shu qurilmada).
 * Mantiq va testlari: packages/shared/src/dismiss.ts.
 */
const KEY = "onatili-admin-dismissed";
const EVENT = "onatili-dismissed";

function read(): DismissMap {
  try {
    return parseDismissed(localStorage.getItem(KEY));
  } catch {
    return {};
  }
}

let cache = read();
const subscribe = (cb: () => void) => {
  // "storage" — boshqa oynada o'zgargan; o'zimizning o'zgarish cache'da turibdi
  const onStorage = () => ((cache = read()), cb());
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => (window.removeEventListener(EVENT, cb), window.removeEventListener("storage", onStorage));
};

function write(next: DismissMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* saqlab bo'lmasa: faqat shu sessiyada */
  }
  cache = next;
  window.dispatchEvent(new Event(EVENT));
}

export function useDismissed(snoozeMs?: number) {
  const map = useSyncExternalStore(subscribe, () => cache);
  /** Yashirinmi: shu kalit shu son (yoki kattaroq son) bilan yashirilgan bo'lsa */
  const hidden = useCallback((key: string, count = 1) => isDismissed(map, key, count, Date.now(), snoozeMs), [map, snoozeMs]);
  const hide = useCallback((key: string, count = 1) => write({ ...cache, [key]: { count, at: Date.now() } }), []);
  const restore = useCallback((keys: string[]) => {
    const next = { ...cache };
    for (const k of keys) delete next[k];
    write(next);
  }, []);
  return { hidden, hide, restore };
}

/**
 * Ish bajarilib son kamaysa, yashirilgan son ham kamayadi: keyingi yangi ishlar ko'rinadi.
 * `current` — TO'LIQ ro'yxat (yuklanmagan bo'lsa undefined): unda yo'q kalit bajarilgan hisoblanadi.
 */
export function useReconcileDismissed(current: Record<string, number> | undefined, owns: (key: string) => boolean) {
  useEffect(() => {
    if (!current) return;
    const next = reconcileDismissed(cache, current, owns);
    if (next !== cache) write(next);
  });
}
