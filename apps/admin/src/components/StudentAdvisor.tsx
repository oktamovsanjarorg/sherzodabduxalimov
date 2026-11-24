import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { api, errMsg } from "../lib/api";
import { AdviceList, useReconcileAdvice } from "./Advisor";
import { Spinner } from "./ui";

const bar = (p: number) => (p >= 75 ? "bg-emerald-500" : p >= 55 ? "bg-amber-400" : "bg-red-500");

/** O'quvchi sahifasi: kuchli/zaif tomonlar, tavsiyalar, keyingi qadamlar va AI reja */
export function StudentAdvisor({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["student-advisor", id], queryFn: () => api.studentAdvisor(id) });
  useReconcileAdvice(q.data?.advice, `student:${id}`);
  if (q.isPending) return <Spinner className="text-ink-4" />;
  if (q.isError) return <p className="text-sm text-red-600">{errMsg(q.error)}</p>;
  const d = q.data;
  const rows = [...d.weaknesses.map((x) => ({ ...x, weak: true })), ...d.strengths.map((x) => ({ ...x, weak: false }))];
  return (
    <div className="space-y-4">
      {rows.length > 0 ? (
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={`${r.weak}-${r.label}`} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="truncate">
                  {r.weak ? "▼" : "▲"} {r.label}
                </span>
                <b className="tabular-nums">{r.percent}%</b>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className={`h-full rounded-full ${bar(r.percent)}`} style={{ width: `${Math.max(3, r.percent)}%` }} />
              </div>
              <p className="text-[11px] text-ink-4">{r.source}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-3">Kuchli va zaif tomonlarni aniqlash uchun hali natija yetarli emas: offline test, ilovadagi test yoki esse kerak.</p>
      )}
      <AdviceList items={d.advice} scope={`student:${id}`} />
      {d.next.length > 0 && (
        <div>
          <p className="label mb-1">Keyingi qadamlar</p>
          <ul className="space-y-1 text-sm">
            {d.next.map((n) => (
              <li key={n.label} className="flex items-center gap-2">
                <ArrowRight size={14} className="shrink-0 text-brand" />
                {n.to ? (
                  <Link to={n.to} className="font-semibold text-brand hover:underline">
                    {n.label}
                  </Link>
                ) : (
                  n.label
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
