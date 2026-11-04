import { ROLE_LABELS } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarCheck, Home, MoreHorizontal, ShieldCheck, type LucideIcon } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { loadSession } from "../lib/session";

interface NavGroup {
  to: string;
  label: string;
  Icon: LucideIcon;
  /** Shu guruhga tegishli sahifalar */
  match: RegExp;
  /** Guruh ichidagi bo'limlar (yuqorida almashtirgich sifatida chiqadi) */
  sub?: { to: string; label: string; match: RegExp }[];
  badge?: number;
}

export function useNavGroups(): NavGroup[] {
  const isTeacher = loadSession()?.user.role === "TEACHER";
  // Kutayotgan ota-ona so'rovlari soni: navigatsiya tugmasida ko'rsatiladi
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, refetchInterval: 30_000 });
  return [
    { to: "/", label: "Asosiy", Icon: Home, match: /^\/$/ },
    {
      to: "/content",
      label: "Kontent",
      Icon: BookOpen,
      match: /^\/(content|lessons|questions|tests|essays)/,
      badge: dash.data?.pendingEssays,
      sub: [
        { to: "/content", label: "Darslar", match: /^\/(content|lessons)/ },
        { to: "/questions", label: "Savollar", match: /^\/questions/ },
        { to: "/tests", label: "Testlar", match: /^\/tests/ },
        { to: "/essays", label: `Esselar${dash.data?.pendingEssays ? ` (${dash.data.pendingEssays})` : ""}`, match: /^\/essays/ },
      ],
    },
    { to: "/attendance", label: "Davomat", Icon: CalendarCheck, match: /^\/attendance/ },
    { to: "/parents", label: "Ota-onalar", Icon: ShieldCheck, match: /^\/parents/, badge: dash.data?.pendingParents },
    {
      to: "/more",
      label: "Ko'proq",
      Icon: MoreHorizontal,
      match: /^\/(more|staff)/,
      sub: isTeacher
        ? [
            { to: "/more", label: "Profil", match: /^\/more/ },
            { to: "/staff", label: "Xodimlar", match: /^\/staff/ },
          ]
        : undefined,
    },
  ];
}

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="absolute -right-2 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-extrabold text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const groups = useNavGroups();
  const s = loadSession()!;
  const current = groups.find((g) => g.match.test(pathname)) ?? groups[0];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-8">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
          <span className="font-extrabold md:hidden">{current.label}</span>
          <span className="hidden text-sm font-extrabold md:inline">Ona tili · Admin</span>

          {/* Kompyuter: guruhlar tepada */}
          <nav className="ml-4 hidden flex-1 items-center gap-1 md:flex">
            {groups.map((g) => {
              const active = g.match.test(pathname);
              return (
                <NavLink
                  key={g.to}
                  to={g.to}
                  className={`relative flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${
                    active ? "bg-brand-soft text-brand-dark" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <g.Icon size={16} />
                  <span className="relative">
                    {g.label}
                    <Badge n={g.badge} />
                  </span>
                </NavLink>
              );
            })}
          </nav>
          <span className="hidden text-right text-xs leading-tight md:block">
            <span className="block font-bold">{s.user.firstName}</span>
            <span className="text-slate-500">{ROLE_LABELS[s.user.role]}</span>
          </span>
        </div>

        {/* Guruh ichidagi bo'limlar */}
        {current.sub && (
          <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 sm:px-8">
            {current.sub.map((t) => {
              const active = t.match.test(pathname);
              return (
                <NavLink
                  key={t.to}
                  to={t.to}
                  className={`h-9 shrink-0 rounded-full px-4 text-sm font-bold leading-9 transition ${
                    active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {t.label}
                </NavLink>
              );
            })}
          </div>
        )}
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-28 pt-5 sm:px-8 sm:pt-8 md:pb-10">
        <Outlet />
      </main>

      {/* Telefon/planshet: pastki navigatsiya */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul className="grid grid-cols-5">
          {groups.map((g) => {
            const active = g.match.test(pathname);
            return (
              <li key={g.to}>
                <NavLink to={g.to} className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold ${active ? "text-brand" : "text-slate-500"}`}>
                  <span className={`relative flex h-8 w-12 items-center justify-center rounded-full ${active ? "bg-brand-soft" : ""}`}>
                    <g.Icon size={21} strokeWidth={active ? 2.4 : 2} />
                    <Badge n={g.badge} />
                  </span>
                  {g.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
