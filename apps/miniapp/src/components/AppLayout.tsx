import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";

export function AppLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <SafeTopBar />
      <main className="flex-1 px-4 pb-28 pt-[calc(theme(spacing.safe-top)+16px)]">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

/**
 * Telegram to'liq ekran rejimida tizim paneli va "Yopish / ⋮" tugmalari sahifa ustida turadi.
 * Shu balandlikdagi xira fon scroll qilingan kontent ular ostidan ko'rinmasligini ta'minlaydi.
 * Oddiy rejimda balandligi 0 bo'ladi.
 */
export function SafeTopBar() {
  return <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-safe-top bg-surface/90 backdrop-blur" />;
}
