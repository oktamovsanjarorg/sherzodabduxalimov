import { formatDate } from "../lib/hooks";
import { ROLE_LABELS } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarCheck, ChevronRight, CreditCard, Settings, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { haptic } from "../lib/telegram";
import { useAuth } from "../store/auth";

export function ProfilePage() {
  const user = useAuth((s) => s.user)!;
  const navigate = useNavigate();
  const parents = useQuery({ queryKey: ["my-parents"], queryFn: api.myParents });
  const approved = parents.data?.parents.filter((p) => p.status === "APPROVED").length ?? 0;
  const pending = parents.data?.parents.filter((p) => p.status === "PENDING").length ?? 0;
  const sub = user.subscription;

  const items = [
    { Icon: BarChart3, label: "Statistika", hint: "Natijalar tarixi", to: "/stats" },
    { Icon: CreditCard, label: "To'lov va obuna", hint: sub ? `Faol · ${formatDate(sub.endsAt)} gacha` : "Obuna yo'q", to: "/subscribe" },
    { Icon: CalendarCheck, label: "Davomatim", hint: "Offline darslar", to: "/my-attendance" },
    {
      Icon: Users,
      label: "Ota-onam",
      hint: approved ? `${approved} ta tasdiqlangan` : pending ? "Tekshirilmoqda" : "Ulanmagan",
      to: "/parents",
    },
    { Icon: Settings, label: "Sozlamalar", hint: "Hisob, telefon, yordam", to: "/settings" },
  ];

  return (
    <div className="mx-auto max-w-md">
      <div className="card flex flex-col items-center gap-1 py-6 text-center">
        {user.photoUrl ? (
          <img src={user.photoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-2xl font-bold text-white">{user.firstName[0]}</span>
        )}
        <p className="mt-2 text-lg font-extrabold">
          {user.firstName} {user.lastName ?? ""}
        </p>
        <p className="text-sm text-hint">
          {user.username ? `@${user.username} · ` : ""}
          {ROLE_LABELS[user.role]}
        </p>
        <span className={`mt-2 rounded-full px-3 py-1 text-xs font-bold ${sub ? "bg-brand-soft text-brand" : "bg-hint/15 text-hint"}`}>
          {sub ? `Obuna faol: ${sub.planName}` : "Bepul foydalanuvchi"}
        </span>
      </div>
      <ul className="card mt-4 divide-y divide-hint/15 p-0">
        {items.map(({ Icon, label, hint, to }) => (
          <li key={label}>
            <button
              className="tap flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left"
              onClick={() => {
                haptic();
                navigate(to);
              }}
            >
              <Icon size={20} className="shrink-0 text-brand" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block truncate text-xs text-hint">{hint}</span>
              </span>
              <ChevronRight size={18} className="text-hint" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
