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
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {tabs.map(({ to, label, Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={haptic}
              className={({ isActive }) =>
                `flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition ${
                  isActive ? "text-brand" : "text-hint"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`flex h-8 w-14 items-center justify-center rounded-full ${isActive ? "bg-brand-soft" : ""}`}>
                    <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
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
