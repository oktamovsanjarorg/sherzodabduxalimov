import { ROLE_LABELS } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, GraduationCap, Home, MoreHorizontal, ShieldCheck, type LucideIcon } from "lucide-react";
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
    {
      to: "/students",
      label: "O'quvchilar",
      Icon: GraduationCap,
      match: /^\/(students|attendance)/,
      sub: [
        { to: "/students", label: "O'quvchilar", match: /^\/students/ },
        { to: "/attendance", label: "Davomat", match: /^\/attendance/ },
      ],
    },
    { to: "/parents", label: "Ota-onalar", Icon: ShieldCheck, match: /^\/parents/, badge: dash.data?.pendingParents },
    {
      to: "/more",
      label: "Ko'proq",
      Icon: MoreHorizontal,
      match: /^\/(more|staff|payments|billing)/,
      // Yangi to'lov cheklari faqat egaga ko'rinadi (yordamchilar to'lovlarga kira olmaydi)
      badge: isTeacher ? dash.data?.pendingPayments : undefined,
      sub: isTeacher
        ? [
            { to: "/more", label: "Profil", match: /^\/more/ },
            { to: "/payments", label: `To'lovlar${dash.data?.pendingPayments ? ` (${dash.data.pendingPayments})` : ""}`, match: /^\/payments/ },
            { to: "/billing", label: "Tariflar", match: /^\/billing/ },
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
      {/* Kompyuter: chap tomonda sidebar, barcha bo'limlar ochiq */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex h-16 items-center gap-3 px-5">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
          <span className="text-sm font-extrabold">Ona tili · Admin</span>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {groups.map((g) => {
            const items = g.sub ?? [{ to: g.to, label: g.label, match: g.match }];
            return (
              <div key={g.to}>
                {g.sub && (
                  <p className="mb-1 flex items-center gap-2 px-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    <g.Icon size={13} /> {g.label}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {items.map((t) => {
                    const active = t.match.test(pathname);
                    return (
                      <li key={t.to}>
                        <NavLink
                          to={t.to}
                          className={`relative flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-semibold transition ${
                            active ? "bg-brand-soft text-brand-dark" : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {!g.sub && <g.Icon size={16} />}
                          <span className="min-w-0 flex-1 truncate">{t.label}</span>
                          {!g.sub && g.badge ? (
                            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-extrabold text-white">{g.badge}</span>
                          ) : null}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 px-5 py-3 text-xs leading-tight">
          <p className="font-bold">{s.user.firstName}</p>
          <p className="text-slate-500">{ROLE_LABELS[s.user.role]}</p>
        </div>
      </aside>

      {/* Telefon/planshet: yuqorida sarlavha va guruh ichidagi bo'limlar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur md:hidden" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex h-14 items-center gap-3 px-4">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
          <span className="font-extrabold">{current.label}</span>
        </div>
        {current.sub && (
          <div className="flex gap-1 overflow-x-auto px-4 pb-2">
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

      <div className="md:pl-60">
        <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-28 pt-5 sm:px-8 sm:pt-8 md:pb-10">
          <Outlet />
        </main>
      </div>

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
