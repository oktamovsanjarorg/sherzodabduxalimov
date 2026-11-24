import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Admin panel Telegram Mini App ichida ham ochiladi (ustoz ilovani ochganda shu yerga o'tadi).
 * Bu holatda telegram-web-app.js yuklanadi (index.html), Telegram tepa paneli rangi moslanadi
 * va "Orqaga" tugmasi ishlaydi. Surish (scroll, swipe) Telegram'ning odatdagidek qoladi.
 */
interface TgWebApp {
  platform: string;
  isFullscreen?: boolean;
  isVersionAtLeast(v: string): boolean;
  ready(): void;
  expand(): void;
  setHeaderColor(c: string): void;
  setBackgroundColor(c: string): void;
  setBottomBarColor?(c: string): void;
  onEvent(e: "fullscreenChanged", cb: () => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
}

const tg = (): TgWebApp | undefined => {
  const w = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  return w && w.platform && w.platform !== "unknown" ? w : undefined;
};
const supports = (v: string) => tg()?.isVersionAtLeast(v) ?? false;

const NAVY = "#0b3b36";
const PAGE = "#f6f3ec";

export function initTelegram() {
  const t = tg();
  if (!t) return;
  const root = document.documentElement;
  root.classList.add("in-telegram");
  const syncFullscreen = () => root.classList.toggle("tg-fullscreen", Boolean(t.isFullscreen));
  syncFullscreen();
  try {
    t.ready();
    t.expand();
    if (supports("6.1")) {
      // Tepadagi Telegram paneli admin sarlavhasi bilan bir rangda
      t.setHeaderColor(NAVY);
      t.setBackgroundColor(PAGE);
    }
    if (supports("7.10")) t.setBottomBarColor?.("#ffffff");
    if (supports("8.0")) t.onEvent("fullscreenChanged", syncFullscreen);
  } catch {
    /* eski Telegram klienti */
  }
}

/** Telegram'ning "Orqaga" tugmasi: bosh sahifadan boshqa joyda ko'rinadi va bir qadam orqaga qaytaradi */
export function useTelegramBackButton() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const t = tg();
    if (!t || !supports("6.1")) return;
    const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));
    if (pathname === "/") {
      t.BackButton.hide();
      return;
    }
    t.BackButton.show();
    t.BackButton.onClick(back);
    return () => t.BackButton.offClick(back);
  }, [pathname, navigate]);
}
