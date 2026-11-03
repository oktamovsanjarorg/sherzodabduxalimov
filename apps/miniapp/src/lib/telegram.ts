/** telegram-web-app.js beradigan window.Telegram.WebApp ustidan yupqa, tiplangan qatlam. */
interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: { first_name: string } };
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  HapticFeedback?: { selectionChanged(): void; impactOccurred(s: "light" | "medium"): void };
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  MainButton: {
    setText(t: string): void; show(): void; hide(): void;
    onClick(cb: () => void): void; offClick(cb: () => void): void;
  };
}

declare global {
  interface Window { Telegram?: { WebApp: TgWebApp } }
}

export const tg: TgWebApp | undefined = window.Telegram?.WebApp;

/** Telegram ichida ochilganmi (initData bo'sh bo'lmasa) */
export const isInTelegram = Boolean(tg?.initData);

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.setHeaderColor("secondary_bg_color");
  tg.setBackgroundColor("secondary_bg_color");
}

export function getInitData(): string | undefined {
  if (tg?.initData) return tg.initData;
  // Lokal dev: brauzerda ochilganda imzolangan test initData (scripts/dev-init-data.ts)
  if (import.meta.env.DEV) return import.meta.env.VITE_DEV_INIT_DATA || undefined;
  return undefined;
}

export const haptic = () => tg?.HapticFeedback?.selectionChanged();
