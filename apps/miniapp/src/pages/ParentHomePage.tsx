import { ATTENDANCE_LABELS, type AttendanceStatusName } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { Clock, Users } from "lucide-react";
import { SafeTopBar } from "../components/AppLayout";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";

const TONE: Record<AttendanceStatusName, string> = {
  PRESENT: "bg-success/15 text-success",
  LATE: "bg-amber-500/15 text-amber-600",
  ABSENT: "bg-danger/15 text-danger",
  EXCUSED: "bg-hint/15 text-hint",
};

/** Ota-ona uchun: farzandlari va ularning so'nggi davomati */
export function ParentHomePage() {
  const user = useAuth((s) => s.user)!;
  const children = useQuery({ queryKey: ["children"], queryFn: api.myChildren });

  return (
    <div className="min-h-full">
      <SafeTopBar />
      <main className="mx-auto max-w-md px-4 pb-10 pt-[calc(theme(spacing.safe-top)+16px)]">
        <p className="px-1 text-xs text-hint">Assalomu alaykum</p>
        <h1 className="px-1 text-xl font-extrabold">{user.firstName}</h1>
        <h2 className="mb-2 mt-5 px-1 text-[15px] font-bold">Farzandlarim</h2>
        {children.isPending && <div className="skeleton h-32" />}
        {children.data?.length === 0 && (
          <div className="card flex flex-col items-center gap-2 py-8 text-center">
            <Users className="text-hint" />
            <p className="text-sm text-hint">Hali farzand ulanmagan. Farzandingiz yuborgan havolani oching.</p>
          </div>
        )}
        <div className="space-y-3">
          {children.data?.map((c, i) => (
            <div key={i} className="card">
              <div className="flex items-center justify-between">
                <p className="font-extrabold">{c.name}</p>
                {c.groupName && <span className="text-xs font-semibold text-hint">{c.groupName}</span>}
              </div>
              {c.status === "PENDING" ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-hint">
                  <Clock size={16} /> Ustoz tasdiqlashi kutilmoqda
                </p>
              ) : c.recent.length === 0 ? (
                <p className="mt-2 text-sm text-hint">Hali davomat olinmagan</p>
              ) : (
                <ul className="mt-3 divide-y divide-hint/10">
                  {c.recent.map((r) => (
                    <li key={r.date} className="flex items-center justify-between py-2 text-sm">
                      <span className="font-semibold">{r.date.split("-").reverse().join(".")}</span>
                      <span className="flex items-center gap-2">
                        {r.grade && <span className="font-extrabold tabular-nums">{r.grade}/5</span>}
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${TONE[r.status]}`}>{ATTENDANCE_LABELS[r.status]}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
