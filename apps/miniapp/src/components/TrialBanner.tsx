import type { Me } from "@onatili/shared";
import { Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

const LABELS = { LESSON: "Dars", TOPIC_TEST: "Mavzu testi", MOCK: "Mock", ESSAY: "Esse" } as const;

/** Cheklangan rejim: nima kutilayotgani va nimalar ishlatib bo'lingani */
export function TrialBanner({ user }: { user: Me }) {
  const navigate = useNavigate();
  const { limited, accepted, paid, used } = user.trial;
  if (!limited || user.role !== "STUDENT") return null;
  const parentOk = user.parentStatus === "APPROVED";
  const waiting = [!accepted && "ustoz tasdig'i", !parentOk && "ota-ona tasdig'i", !paid && "to'lov"].filter(Boolean).join(", ");
  return (
    <div className="card mt-4">
      <p className="flex items-center gap-2 text-sm font-bold">
        <Clock size={16} className="shrink-0 text-brand" /> Kutilmoqda: {waiting}
      </p>
      <p className="mt-1 text-xs text-hint">Hozircha har bo'limdan bir martadan foydalana olasiz.</p>
      {used.length > 0 && <p className="mt-1 text-xs text-hint">Ishlatilgan: {used.map((k) => LABELS[k]).join(", ")}</p>}
      {!paid && (
        <button className="btn-ghost mt-3" onClick={() => navigate("/subscribe")}>
          To'lov qilish
        </button>
      )}
      {user.parentStatus === "NONE" && (
        <button className="btn-primary mt-3" onClick={() => navigate("/parents")}>
          Ota-onamni ulash
        </button>
      )}
    </div>
  );
}
