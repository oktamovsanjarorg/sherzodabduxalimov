import { ROLE_LABELS } from "@onatili/shared";
import { ChevronRight, CreditCard, LogOut, Tags, Users, type LucideIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { clearSession, loadSession } from "../lib/session";

const TEACHER_LINKS: { to: string; label: string; Icon: LucideIcon }[] = [
  { to: "/payments", label: "To'lovlar va obunachilar", Icon: CreditCard },
  { to: "/billing", label: "Tariflar va karta raqami", Icon: Tags },
  { to: "/staff", label: "Xodimlar (yordamchilar)", Icon: Users },
];

export function MorePage() {
  const navigate = useNavigate();
  const s = loadSession()!;
  const isTeacher = s.user.role === "TEACHER";
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="card flex items-center gap-3 p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">{s.user.firstName[0]}</span>
        <div className="min-w-0">
          <p className="truncate font-extrabold">
            {s.user.firstName} {s.user.lastName ?? ""}
          </p>
          <p className="text-sm text-slate-500">
            {s.user.username ? `@${s.user.username} · ` : ""}
            {ROLE_LABELS[s.user.role]}
          </p>
        </div>
      </div>

      <ul className="card divide-y divide-slate-100 overflow-hidden">
        {isTeacher &&
          TEACHER_LINKS.map(({ to, label, Icon }) => (
            <li key={to}>
              <Link to={to} className="flex h-14 items-center gap-3 px-5 text-sm font-semibold hover:bg-slate-50">
                <Icon size={18} className="text-brand" />
                <span className="flex-1">{label}</span>
                <ChevronRight size={18} className="text-slate-400" />
              </Link>
            </li>
          ))}
        <li>
          <button
            className="flex h-14 w-full items-center gap-3 px-5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
            onClick={() => {
              clearSession();
              navigate("/login");
            }}
          >
            <LogOut size={18} />
            Chiqish
          </button>
        </li>
      </ul>
      <p className="px-2 text-xs text-slate-500">Qayta kirish uchun botga /admin deb yozing.</p>
    </div>
  );
}
