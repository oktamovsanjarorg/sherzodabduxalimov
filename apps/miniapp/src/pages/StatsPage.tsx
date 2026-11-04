import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight, ClipboardCheck, ListChecks, Target } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FullPage } from "../components/FullPage";
import { ScoreBadge } from "../components/TestCard";
import { api } from "../lib/api";
import { formatDate, useBackButton } from "../lib/hooks";
import { fmtPoints } from "./AttemptPage";

export function StatsPage() {
  const navigate = useNavigate();
  useBackButton(() => navigate("/profile"));
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const attempts = useQuery({ queryKey: ["my-attempts"], queryFn: api.myAttempts });
  const s = stats.data;
  const mocks = attempts.data?.filter((a) => a.testType === "MOCK") ?? [];
  const best = mocks.length ? Math.max(...mocks.map((m) => m.score)) : null;

  return (
    <FullPage>
      <h1 className="mb-4 px-1 text-xl font-extrabold">Statistika</h1>
      <div className="grid grid-cols-2 gap-3">
        <Tile Icon={BookOpen} value={s ? String(s.lessonsCompleted) : "…"} label="Tugatilgan dars" />
        <Tile Icon={ListChecks} value={s ? String(s.testsTaken) : "…"} label="Topshirilgan test" />
        <Tile Icon={Target} value={s?.averagePercent != null ? `${s.averagePercent}%` : "—"} label="O'rtacha natija" />
        <Tile Icon={ClipboardCheck} value={best !== null ? fmtPoints(best) : "—"} label="Eng yaxshi mock (ball)" />
      </div>

      <h2 className="mb-2 mt-6 px-1 text-[15px] font-bold">Natijalar tarixi</h2>
      {attempts.isPending && <div className="skeleton h-40" />}
      {attempts.data?.length === 0 && <p className="card text-center text-sm text-hint">Hali test topshirilmagan</p>}
      <ul className="space-y-2">
        {attempts.data?.map((a) => (
          <li key={a.id}>
            <button onClick={() => navigate(`/attempt/${a.id}`)} className="card tap flex w-full items-center gap-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{a.testTitle}</span>
                <span className="block text-xs text-hint">
                  {formatDate(a.finishedAt)} · {fmtPoints(a.score)}/{fmtPoints(a.maxScore)} ball
                  {a.essayPending && <span className="font-semibold text-brand"> · esse tekshirilmoqda</span>}
                </span>
              </span>
              {a.level && a.level !== "—" ? (
                <span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-extrabold text-brand">{a.level}</span>
              ) : (
                <ScoreBadge percent={a.percent} />
              )}
              <ChevronRight size={18} className="text-hint" />
            </button>
          </li>
        ))}
      </ul>
    </FullPage>
  );
}

function Tile({ Icon, value, label }: { Icon: typeof BookOpen; value: string; label: string }) {
  return (
    <div className="card">
      <Icon size={18} className="text-brand" />
      <p className="mt-2 text-2xl font-extrabold tabular-nums">{value}</p>
      <p className="text-xs text-hint">{label}</p>
    </div>
  );
}
