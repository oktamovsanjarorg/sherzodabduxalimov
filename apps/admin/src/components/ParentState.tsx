import type { AdminStudent } from "@onatili/shared";
import { Clock, ShieldAlert, ShieldCheck } from "lucide-react";

/** O'quvchining ota-onasi holati (qisqa belgi) */
export function ParentState({ s }: { s: AdminStudent }) {
  const approved = s.parents.filter((p) => p.status === "APPROVED");
  if (approved.length)
    return (
      <span title={approved.map((p) => p.name).join(", ")} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
        <ShieldCheck size={13} /> Ota-ona
      </span>
    );
  if (s.parents.length)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
        <Clock size={13} /> Tekshirilmoqda
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
      <ShieldAlert size={13} /> Ota-ona yo'q
    </span>
  );
}
