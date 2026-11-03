import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { isInTelegram } from "../lib/telegram";
import { SafeTopBar } from "./AppLayout";

/** Pastki navigatsiyasiz ichki sahifa (dars, test). Orqaga qaytish Telegram BackButton orqali. */
export function FullPage({ children, bottom }: { children: ReactNode; bottom?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-full">
      <SafeTopBar />
      <main className={`mx-auto max-w-md px-4 pt-[calc(theme(spacing.safe-top)+16px)] ${bottom ? "pb-32" : "pb-10"}`}>
        {/* Telegram'dan tashqarida (brauzerda) BackButton yo'q, shuning uchun o'zimizniki */}
        {!isInTelegram && (
          <button onClick={() => navigate(-1)} className="tap -ml-1 mb-2 flex h-9 items-center gap-1 pr-2 text-sm font-semibold text-hint">
            <ChevronLeft size={18} /> Orqaga
          </button>
        )}
        {children}
      </main>
      {bottom && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t border-hint/15 bg-section/95 px-4 pt-3 backdrop-blur"
          style={{ paddingBottom: "max(12px, var(--tg-safe-area-inset-bottom, 0px), env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="mx-auto max-w-md">{bottom}</div>
        </div>
      )}
    </div>
  );
}
