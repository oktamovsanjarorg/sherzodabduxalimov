import { ROLE_LABELS } from "@onatili/shared";
import { BookOpen, ClipboardList, LibraryBig, LogOut, Menu, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearSession, loadSession } from "../lib/session";

function useLinks() {
  const isTeacher = loadSession()?.user.role === "TEACHER";
  return [
    { to: "/", label: "Darslar", Icon: BookOpen, end: true },
    { to: "/questions", label: "Savollar banki", Icon: LibraryBig },
    { to: "/tests", label: "Testlar", Icon: ClipboardList },
    ...(isTeacher ? [{ to: "/staff", label: "Xodimlar", Icon: Users }] : []),
  ];
}

/** Sidebar ichi: kompyuterda doimiy, telefonda drawer ichida */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const s = loadSession()!;
  const links = useLinks();
  return (
    <>
      <div className="flex items-center gap-2 px-5 py-5">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
        <div>
          <p className="text-sm font-extrabold leading-tight">Ona tili</p>
          <p className="text-xs text-slate-500">Admin panel</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {links.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
                isActive ? "bg-brand-soft text-brand-dark" : "text-slate-600 hover:bg-slate-100"
              }`
            }
          >
            <Icon size={18} /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}>
        <div className="px-2 pb-2">
          <p className="truncate text-sm font-bold">
            {s.user.firstName} {s.user.lastName ?? ""}
          </p>
          <p className="text-xs text-slate-500">{ROLE_LABELS[s.user.role]}</p>
        </div>
        <button
          className="btn-ghost w-full justify-start"
          onClick={() => {
            clearSession();
            navigate("/login");
          }}
        >
          <LogOut size={16} /> Chiqish
        </button>
      </div>
    </>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const links = useLinks();
  // Dars muharriri (/lessons/:id) "Darslar" bo'limiga tegishli
  const path = location.pathname.startsWith("/lessons") ? "/" : location.pathname;
  const current = links.find((l) => (l.end ? path === l.to : path.startsWith(l.to)))?.label ?? "Admin";

  // Sahifa almashganda drawer yopiladi; ochiq paytda orqa fon scroll qilinmaydi
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen">
      {/* Kompyuter: doimiy sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <SidebarContent />
      </aside>

      {/* Telefon/planshet: drawer */}
      <div className={`fixed inset-0 z-40 md:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div className={`absolute inset-0 bg-slate-900/40 transition-opacity ${open ? "opacity-100" : "opacity-0"}`} onClick={() => setOpen(false)} />
        <aside
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-200 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <button className="btn-ghost absolute right-2 top-4 h-10 w-10 p-0" onClick={() => setOpen(false)} aria-label="Menyuni yopish">
            <X size={20} />
          </button>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/95 px-2 backdrop-blur md:hidden"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <button className="btn-ghost h-11 w-11 p-0" onClick={() => setOpen(true)} aria-label="Menyuni ochish" aria-expanded={open}>
            <Menu size={22} />
          </button>
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-7 w-7" />
          <span className="truncate font-extrabold">{current}</span>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-5 sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
