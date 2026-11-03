/** telegram-web-app.js beradigan window.Telegram.WebApp ustidan yupqa, tiplangan qatlam. */
type ThemeParams = Partial<
  Record<
    | "bg_color"
    | "secondary_bg_color"
    | "section_bg_color"
    | "text_color"
    | "hint_color"
    | "link_color"
    | "destructive_text_color",
    string
  >
>;

interface TgWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  themeParams: ThemeParams;
  ready(): void;
  expand(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  onEvent(event: "themeChanged", cb: () => void): void;
  HapticFeedback?: {
    selectionChanged(): void;
    impactOccurred(s: "light" | "medium"): void;
    notificationOccurred(t: "success" | "error" | "warning"): void;
  };
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  MainButton: {
    setText(t: string): void;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TgWebApp };
  }
}

export const tg: TgWebApp | undefined = window.Telegram?.WebApp;

/** Telegram ichida ochilganmi (initData bo'sh bo'lmasa) */
export const isInTelegram = Boolean(tg?.initData);

/** Mavzu ranglari: Telegram bermasa, shu qiymatlar ishlatiladi */
const LIGHT: Required<ThemeParams> = {
  bg_color: "#ffffff",
  secondary_bg_color: "#f3f4f6",
  section_bg_color: "#ffffff",
  text_color: "#111827",
  hint_color: "#6b7280",
  link_color: "#0f766e",
  destructive_text_color: "#dc2626",
};

const VARS: Record<keyof ThemeParams, string> = {
  bg_color: "--c-bg",
  secondary_bg_color: "--c-surface",
  section_bg_color: "--c-section",
  text_color: "--c-text",
  hint_color: "--c-hint",
  link_color: "--c-link",
  destructive_text_color: "--c-danger",
};

function hexToRgb(hex: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/**
 * Ranglarni "r g b" ko'rinishida CSS o'zgaruvchilariga yozamiz, Tailwind ularni `rgb(var(--c) / a)` qilib ishlatadi.
 * color-mix() ishlatilmaydi, chunki Telegram Desktop'ning eski webview'lari uni qo'llamaydi.
 */
function applyTheme() {
  const params = tg?.themeParams ?? {};
  const root = document.documentElement.style;
  for (const key of Object.keys(VARS) as (keyof ThemeParams)[]) {
    const rgb = hexToRgb(params[key] ?? "") ?? hexToRgb(LIGHT[key])!;
    root.setProperty(VARS[key], rgb);
  }
  document.documentElement.dataset.scheme = tg?.colorScheme ?? "light";
}

export function initTelegram() {
  applyTheme();
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.setHeaderColor("secondary_bg_color");
  tg.setBackgroundColor("secondary_bg_color");
  tg.onEvent("themeChanged", applyTheme);
}

export function getInitData(): string | undefined {
  if (tg?.initData) return tg.initData;
  // Lokal dev: brauzerda ochilganda imzolangan test initData (scripts/dev-init-data.ts)
  if (import.meta.env.DEV) return import.meta.env.VITE_DEV_INIT_DATA || undefined;
  return undefined;
}

export const haptic = () => tg?.HapticFeedback?.selectionChanged();
