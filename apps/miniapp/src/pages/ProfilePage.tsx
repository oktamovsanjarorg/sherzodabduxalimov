import { ROLE_LABELS } from "@onatili/shared";
import { ChevronRight, CreditCard, BarChart3, CalendarCheck, Settings } from "lucide-react";
import { useAuth } from "../store/auth";

const items = [
  { Icon: BarChart3, label: "Statistika" },
  { Icon: CreditCard, label: "To'lov va obuna" },
  { Icon: CalendarCheck, label: "Davomat" },
  { Icon: Settings, label: "Sozlamalar" },
];

export function ProfilePage() {
  const user = useAuth((s) => s.user)!;
  return (
    <div className="mx-auto max-w-md">
      <div className="card flex flex-col items-center gap-1 py-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-2xl font-bold text-white">
          {user.firstName[0]}
        </span>
        <p className="mt-2 text-lg font-extrabold">
          {user.firstName} {user.lastName ?? ""}
        </p>
        <p className="text-sm text-hint">
          {user.username ? `@${user.username} · ` : ""}
          {ROLE_LABELS[user.role]}
        </p>
      </div>
      <ul className="card mt-4 divide-y divide-hint/15 p-0">
        {items.map(({ Icon, label }) => (
          <li key={label}>
            <button className="tap flex h-14 w-full items-center gap-3 px-4 text-left">
              <Icon size={20} className="text-brand" />
              <span className="flex-1 text-sm font-semibold">{label}</span>
              <ChevronRight size={18} className="text-hint" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
