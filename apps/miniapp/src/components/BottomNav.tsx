import { BookOpen, Home, User } from "lucide-react";
import { NavLink } from "react-router-dom";
import { haptic } from "../lib/telegram";

// Eskiz bo'yicha: 3 ta tab, o'rtada "Asosiy"
const tabs = [
  { to: "/lessons", label: "Darslar", Icon: BookOpen },
  { to: "/", label: "Asosiy", Icon: Home, end: true },
  { to: "/profile", label: "Profil", Icon: User },
];

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-hint/15 bg-section/95 backdrop-blur"
      style={{ paddingBottom: "max(var(--tg-safe-area-inset-bottom, 0px), env(safe-area-inset-bottom, 0px))" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {tabs.map(({ to, label, Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={haptic}
              className={({ isActive }) =>
                `flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-bold tracking-wide transition ${
                  isActive ? "text-brand" : "text-hint"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`mb-0.5 h-0.5 w-5 rounded-full ${isActive ? "bg-gold" : "bg-transparent"}`} />
                  <Icon size={22} strokeWidth={isActive ? 2.25 : 1.75} />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
