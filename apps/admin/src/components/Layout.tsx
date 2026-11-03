import { ROLE_LABELS } from "@onatili/shared";
import { BookOpen, ClipboardList, LibraryBig, LogOut, Users } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearSession, loadSession } from "../lib/session";

export function Layout() {
  const navigate = useNavigate();
  const s = loadSession()!;
  const isTeacher = s.user.role === "TEACHER";
  const links = [
    { to: "/", label: "Darslar", Icon: BookOpen, end: true },
    { to: "/questions", label: "Savollar banki", Icon: LibraryBig },
    { to: "/tests", label: "Testlar", Icon: ClipboardList },
    ...(isTeacher ? [{ to: "/staff", label: "Xodimlar", Icon: Users }] : []),
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
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
              className={({ isActive }) =>
                `flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
                  isActive ? "bg-brand-soft text-brand-dark" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <div className="px-2 pb-2">
            <p className="truncate text-sm font-bold">{s.user.firstName} {s.user.lastName ?? ""}</p>
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
      </aside>

      {/* Planshet/telefon: yuqori menyu */}
      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden">
          {links.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `btn-sm btn ${isActive ? "bg-brand-soft text-brand-dark" : "text-slate-600"}`}>
              {label}
            </NavLink>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
