import { formatScore } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { Award, Users } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { FullPage } from "../components/FullPage";
import { api } from "../lib/api";
import { formatDate, useBackButton } from "../lib/hooks";

const CELL: Record<string, string> = {
  c: "bg-success/15 text-success",
  w: "bg-danger/15 text-danger",
  p: "bg-amber-500/15 text-amber-600",
  b: "bg-hint/10 text-hint",
  v: "bg-hint/10 text-hint",
  "-": "bg-hint/10 text-hint",
};

/** Offline testda topshirilgan test natijasi: bo'limlar, har savol, guruhdagi o'rin */
export function ExternalResultPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  useBackButton(() => navigate("/stats"));
  const q = useQuery({ queryKey: ["external", id], queryFn: () => api.myExternal(id) });
  const r = q.data;
  return (
    <FullPage>
      {q.isPending && <div className="skeleton h-60" />}
      {q.isError && <p className="card text-center text-sm text-hint">Natija topilmadi</p>}
      {r && (
        <>
          <p className="px-1 text-xs text-hint">{[r.subject, r.takenAt && formatDate(r.takenAt)].filter(Boolean).join(" · ")}</p>
          <h1 className="mb-4 px-1 text-xl font-extrabold">{r.title}</h1>
          <div className="card text-center">
            <p className="text-5xl font-extrabold tabular-nums text-brand">{formatScore(r.percent)}%</p>
            <p className="mt-1 text-sm text-hint">
              {r.correct} to'g'ri · {r.wrong} xato · {r.blank} bo'sh{r.scaledScore != null ? ` · ${formatScore(r.scaledScore)} ball` : ""}
              {r.grade ? ` · ${r.grade}` : ""}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-brand-soft p-3">
                <Award size={18} className="mx-auto text-brand" />
                <p className="mt-1 font-extrabold">
                  {r.rank}-o'rin <span className="font-normal text-hint">/ {r.participants}</span>
                </p>
              </div>
              <div className="rounded-xl bg-hint/10 p-3">
                <Users size={18} className="mx-auto text-hint" />
                <p className="mt-1 font-extrabold">
                  {formatScore(r.avgPercent)}% <span className="font-normal text-hint">o'rtacha</span>
                </p>
              </div>
            </div>
          </div>

          {r.sections.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 px-1 text-[15px] font-bold">Bo'limlar</h2>
              <div className="card space-y-3">
                {r.sections.map((s, i) => (
                  <div key={i}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-semibold">{s.title ?? `${s.fromQ}–${s.toQ} savollar`}</span>
                      <span className="tabular-nums text-hint">
                        {s.correct}/{s.toQ - s.fromQ + 1}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-hint/15">
                      <div className={`h-full rounded-full ${s.percent >= 60 ? "bg-brand" : "bg-danger"}`} style={{ width: `${s.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <h2 className="mb-2 mt-6 px-1 text-[15px] font-bold">Har savol</h2>
          <div className="card">
            <div className="grid grid-cols-6 gap-1.5">
              {[...r.answers].map((a, i) => (
                <span key={i} className={`rounded-lg py-2 text-center text-xs font-bold tabular-nums ${CELL[a] ?? CELL["-"]}`}>
                  {i + 1}
                </span>
              ))}
            </div>
            <p className="mt-3 flex flex-wrap gap-3 text-xs text-hint">
              <span><b className="text-success">■</b> to'g'ri</span>
              <span><b className="text-danger">■</b> xato</span>
              <span><b className="text-hint">■</b> bo'sh</span>
            </p>
          </div>
        </>
      )}
    </FullPage>
  );
}
