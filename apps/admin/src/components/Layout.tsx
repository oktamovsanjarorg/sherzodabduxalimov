import { ROLE_LABELS } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, GraduationCap, Home, LogOut, MoreHorizontal, type LucideIcon } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { clearSession, loadSession } from "../lib/session";

interface NavGroup {
  to: string;
  label: string;
  Icon: LucideIcon;
  /** Shu guruhga tegishli sahifalar */
  match: RegExp;
  /** Guruh ichidagi bo'limlar (yuqorida almashtirgich sifatida chiqadi) */
  sub?: { to: string; label: string; match: RegExp; badge?: number }[];
  badge?: number;
  /** Kompyuter sidebar'ida shu guruh ichida ko'rsatiladi (telefonda pastki tugma alohida) */
  sidebarIn?: string;
}

export function useNavGroups(): NavGroup[] {
  const isTeacher = loadSession()?.user.role === "TEACHER";
  // Kutayotgan ota-ona so'rovlari soni: navigatsiya tugmasida ko'rsatiladi
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, refetchInterval: 30_000 });
  return [
    {
      to: "/",
      label: "Asosiy",
      Icon: Home,
      match: /^\/($|stats)/,
      sub: [
        { to: "/", label: "Bugun", match: /^\/$/ },
        { to: "/stats", label: "Statistika", match: /^\/stats/ },
      ],
    },
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
        { to: "/essays", label: "Esselar", match: /^\/essays/, badge: dash.data?.pendingEssays },
      ],
    },
    {
      to: "/students",
      label: "O'quvchilar",
      Icon: GraduationCap,
      match: /^\/(students|attendance|parents)/,
      // Yangi kelganlar va ota-ona so'rovlari O'quvchilar sahifasining tepasida ko'rib chiqiladi
      badge: (dash.data?.newStudents ?? 0) + (dash.data?.pendingParents ?? 0) || undefined,
      sub: [
        { to: "/students", label: "O'quvchilar", match: /^\/(students|parents)/, badge: (dash.data?.newStudents ?? 0) + (dash.data?.pendingParents ?? 0) || undefined },
        { to: "/attendance", label: "Davomat", match: /^\/attendance/ },
      ],
    },
    // Pul va xodimlar: faqat ega (yordamchida bu bo'lim umuman yo'q)
    ...(isTeacher
      ? [
          {
            to: "/payments",
            label: "Ko'proq",
            Icon: MoreHorizontal,
            match: /^\/(more|staff|payments|billing)/,
            badge: dash.data?.pendingPayments,
            sub: [
              { to: "/payments", label: "To'lovlar", match: /^\/payments/, badge: dash.data?.pendingPayments },
              { to: "/billing", label: "Tariflar", match: /^\/billing/ },
              { to: "/staff", label: "Xodimlar", match: /^\/staff/ },
            ],
          },
        ]
      : []),
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
  const navigate = useNavigate();
  const logout = () => {
    clearSession();
    navigate("/login");
  };
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
          {groups.filter((g) => !g.sidebarIn).map((g) => {
            const extra = groups.filter((x) => x.sidebarIn === g.to).map((x) => ({ to: x.to, label: x.label, match: x.match, badge: x.badge }));
            const items = [...(g.sub ?? [{ to: g.to, label: g.label, match: g.match, badge: g.badge }]), ...extra];
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
                          {t.badge ? (
                            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-extrabold text-white">
                              {t.badge > 99 ? "99+" : t.badge}
                            </span>
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
        <div className="flex items-center gap-2 border-t border-slate-200 px-5 py-3 text-xs leading-tight">
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{[s.user.firstName, s.user.lastName].filter(Boolean).join(" ")}</p>
            <p className="text-slate-500">{ROLE_LABELS[s.user.role]}</p>
          </div>
          <button className="btn-ghost btn-sm text-red-600" onClick={logout} title="Chiqish (qayta kirish: botga /admin)">
            <LogOut size={15} /> Chiqish
          </button>
        </div>
      </aside>

      {/* Telefon/planshet: yuqorida sarlavha va guruh ichidagi bo'limlar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur md:hidden" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex h-14 items-center gap-3 px-4">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
          <span className="flex-1 font-extrabold">{current.label}</span>
          <button className="btn-ghost btn-sm text-slate-500" onClick={logout} aria-label="Chiqish" title="Chiqish">
            <LogOut size={18} />
          </button>
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
                  {t.badge ? <span className={`ml-1.5 ${active ? "text-red-300" : "text-red-600"}`}>{t.badge}</span> : null}
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
        <ul className={`grid ${groups.length >= 5 ? "grid-cols-5" : "grid-cols-4"}`}>
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
