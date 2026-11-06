import { ATTENDANCE_LABELS, type AttendanceStatusName } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FullPage } from "../components/FullPage";
import { api } from "../lib/api";
import { useBackButton } from "../lib/hooks";

const TONE: Record<AttendanceStatusName, string> = {
  PRESENT: "bg-success/15 text-success",
  LATE: "bg-amber-500/15 text-amber-600",
  ABSENT: "bg-danger/15 text-danger",
  EXCUSED: "bg-hint/15 text-hint",
};

export function MyAttendancePage() {
  const navigate = useNavigate();
  useBackButton(() => navigate("/profile"));
  const q = useQuery({ queryKey: ["my-attendance"], queryFn: api.myAttendance });
  const d = q.data;
  const total = d ? d.records.length : 0;
  const came = d ? d.counts.PRESENT + d.counts.LATE : 0;

  return (
    <FullPage>
      <h1 className="mb-4 px-1 text-xl font-extrabold">Davomatim</h1>
      {q.isPending && <div className="skeleton h-40" />}
      {d && !d.group && total === 0 && (
        <div className="card flex flex-col items-center gap-2 py-8 text-center">
          <CalendarCheck className="text-hint" />
          <p className="font-bold">Siz online o'quvchisiz</p>
          <p className="text-sm text-hint">Davomat faqat offline guruhlarda olinadi. Ustoz sizni guruhga qo'shsa, shu yerda ko'rinadi.</p>
        </div>
      )}
      {d && (d.group || total > 0) && (
        <>
          {d.group && (
            <div className="card mb-3">
              <p className="text-xs text-hint">Guruh</p>
              <p className="font-extrabold">{d.group.name}</p>
              {d.group.schedule && <p className="text-sm text-hint">{d.group.schedule}</p>}
            </div>
          )}
          <div className="card mb-3 grid grid-cols-4 divide-x divide-hint/15 text-center">
            {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const).map((k) => (
              <div key={k}>
                <p className="text-xl font-extrabold tabular-nums">{d.counts[k]}</p>
                <p className="text-[11px] text-hint">{ATTENDANCE_LABELS[k]}</p>
              </div>
            ))}
          </div>
          {total > 0 && (
            <p className="mb-3 px-1 text-sm text-hint">
              Qatnashish: <b className="text-text">{Math.round((came / total) * 100)}%</b> ({came}/{total} dars)
            </p>
          )}
          {total === 0 ? (
            <p className="card text-center text-sm text-hint">Hali davomat olinmagan</p>
          ) : (
            <ul className="card divide-y divide-hint/10 py-1">
              {d.records.map((r) => (
                <li key={r.date} className="flex items-center gap-3 py-2.5">
                  <span className="flex-1 text-sm font-semibold">
                    {r.date.split("-").reverse().join(".")}
                    {r.note && <span className="block text-xs font-normal text-hint">{r.note}</span>}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${TONE[r.status]}`}>{ATTENDANCE_LABELS[r.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </FullPage>
  );
}
