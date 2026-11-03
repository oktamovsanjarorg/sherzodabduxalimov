import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { isInTelegram, tg } from "./telegram";

/** Ichki sahifalarda Telegram'ning "orqaga" tugmasini ko'rsatadi */
export function useBackButton(onBack?: () => void) {
  const navigate = useNavigate();
  const cb = useRef(onBack);
  cb.current = onBack;

  useEffect(() => {
    const back = tg?.BackButton;
    if (!back || !isInTelegram) return;
    const handler = () => (cb.current ? cb.current() : navigate(-1));
    back.show();
    back.onClick(handler);
    return () => {
      back.offClick(handler);
      back.hide();
    };
  }, [navigate]);
}

/** Taymer: server vaqtiga nisbatan qolgan soniyalar (klient soati noto'g'ri bo'lsa ham to'g'ri ishlaydi) */
export function useCountdown(deadlineAt: string | null, serverNow: string | undefined, onExpire: () => void) {
  const offset = useRef(0);
  const expired = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (serverNow) offset.current = new Date(serverNow).getTime() - Date.now();
  }, [serverNow]);

  const calc = () =>
    deadlineAt ? Math.max(0, Math.round((new Date(deadlineAt).getTime() - (Date.now() + offset.current)) / 1000)) : null;

  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!deadlineAt) return;
    expired.current = false;
    const tick = () => {
      const left = calc();
      if (ref.current && left !== null) {
        ref.current.textContent = formatClock(left);
        ref.current.dataset.low = String(left <= 60);
      }
      if (left === 0 && !expired.current) {
        expired.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineAt]);

  return ref; // har soniyada butun sahifani qayta chizmaslik uchun matn to'g'ridan-to'g'ri yangilanadi
}

export function formatClock(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatDuration(sec: number | null) {
  if (!sec) return null;
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} soat ${m % 60 ? `${m % 60} daq` : ""}`.trim() : `${m} daq`;
}
