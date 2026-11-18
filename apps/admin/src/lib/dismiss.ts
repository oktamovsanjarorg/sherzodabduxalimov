import { useCallback, useSyncExternalStore } from "react";

/**
 * Bosh sahifadagi «Bugun» xabarlarini yashirish (shu qurilmada). Har xabar kalit + son bilan yashiriladi:
 * son oshsa (yangi esse, yangi o'quvchi) xabar yana chiqadi, kamaysa yoki o'zgarmasa yashirin qoladi.
 */
const KEY = "onatili-admin-dismissed";
const EVENT = "onatili-dismissed";

function read(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

let cache = read();
const subscribe = (cb: () => void) => {
  const on = () => ((cache = read()), cb());
  window.addEventListener(EVENT, on);
  window.addEventListener("storage", on);
  return () => (window.removeEventListener(EVENT, on), window.removeEventListener("storage", on));
};

function write(next: Record<string, number>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* saqlab bo'lmasa: faqat shu sessiyada */
  }
  cache = next;
  window.dispatchEvent(new Event(EVENT));
}

export function useDismissed() {
  const map = useSyncExternalStore(subscribe, () => cache);
  /** Yashirinmi: shu kalit shu son (yoki kattaroq son) bilan yashirilgan bo'lsa */
  const hidden = useCallback((key: string, count = 1) => (map[key] ?? -1) >= count, [map]);
  const hide = useCallback((key: string, count = 1) => write({ ...read(), [key]: count }), []);
  const restore = useCallback((keys: string[]) => {
    const next = read();
    for (const k of keys) delete next[k];
    write(next);
  }, []);
  return { hidden, hide, restore };
}
