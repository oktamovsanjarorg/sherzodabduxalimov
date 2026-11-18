import { useQuery } from "@tanstack/react-query";
import { AdviceList } from "../components/Advisor";
import { Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";

/** Ustoz yordamchisi: platforma holati va bazadagi faktlardan chiqqan aniq tavsiyalar */
export function AdvisorPage() {
  const q = useQuery({ queryKey: ["advisor"], queryFn: api.advisor });
  if (q.isPending) return <Spinner className="text-ink-4" />;
  if (q.isError) return <p className="text-sm text-red-600">{errMsg(q.error)}</p>;
  const d = q.data;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-[2rem] leading-none">Yordamchi</h1>
        <p className="mt-2 text-sm text-ink-3">
          Nima joyida emas va nima qilish kerak. Bajarganingizni ✕ bilan yashiring.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {d.pulse.map((p) => (
          <div key={p.label} className="card p-3">
            <p className="truncate text-xs font-bold text-ink-3">{p.label}</p>
            <p className="mt-1 text-xl font-extrabold tabular-nums">{p.value}</p>
            {p.hint && <p className="text-[11px] text-ink-3">{p.hint}</p>}
          </div>
        ))}
      </div>
      <section>
        <h2 className="label mb-2">Tavsiyalar</h2>
        <AdviceList items={d.advice} scope="platform" />
      </section>
    </div>
  );
}
