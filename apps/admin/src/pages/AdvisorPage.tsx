import { ADVICE_AREA_LABELS, type Advice, type AdviceArea } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { AREA_ICON, AdviceItem, LEVEL, useAdvice, useReconcileAdvice } from "../components/Advisor";
import { Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { loadSession } from "../lib/session";

/** Bo'limlar tartibi: kundalik ish (pul, esse, davomat) tepada, sekin o'zgaradiganlar pastda */
const AREAS: AdviceArea[] = ["payments", "essays", "attendance", "learning", "activity", "parents", "content"];

/**
 * Ustoz yordamchisi: bazadagi faktlardan chiqqan aniq ishlar.
 * Tepada — shoshilinchlari (bugun), keyin bo'limlar bo'yicha, oxirida joyida bo'lgan bo'limlar.
 */
export function AdvisorPage() {
  const q = useQuery({ queryKey: ["advisor"], queryFn: api.advisor });
  useReconcileAdvice(q.data?.advice, "platform");
  const adv = useAdvice(q.data?.advice ?? [], "platform");
  if (q.isPending) return <Spinner className="text-ink-4" />;
  if (q.isError) return <p className="text-sm text-red-600">{errMsg(q.error)}</p>;
  const d = q.data;
  const isTeacher = loadSession()?.user.role === "TEACHER";
  const areas = AREAS.filter((a) => isTeacher || a !== "payments");
  const urgent = adv.shown.filter((a) => a.level === "urgent");
  const rest = adv.shown.filter((a) => a.level !== "urgent");
  const byArea = (area: AdviceArea) => rest.filter((a) => a.area === area);
  const busy = areas.filter((a) => byArea(a).length);
  const calm = areas.filter((a) => !adv.shown.some((x) => x.area === a));
  const important = rest.filter((a) => a.level === "important").length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-[2rem] leading-none">Yordamchi</h1>
        <p className="mt-2 text-sm text-ink-3">
          {adv.shown.length === 0
            ? "Hamma narsa joyida: hozir qiladigan ish yo'q."
            : `${urgent.length ? `${urgent.length} ta shoshilinch` : "Shoshilinch ish yo'q"}${important ? `, ${important} ta muhim` : ""} ish bor. ✕ bilan yashiring: son oshsa yoki 7 kunda hal bo'lmasa yana chiqadi.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {d.pulse.map((p) => (
          <div key={p.label} className="card p-3">
            <p className="truncate text-xs font-bold text-ink-3" title={p.label}>
              {p.label}
            </p>
            <p className="mt-1 text-xl font-extrabold tabular-nums">{p.value}</p>
            {p.hint && <p className="text-[11px] text-ink-3">{p.hint}</p>}
          </div>
        ))}
      </div>

      {urgent.length > 0 && (
        <section>
          <SectionTitle dot={LEVEL.urgent.dot} title="Birinchi navbatda" n={urgent.length} />
          <div className="grid gap-2 lg:grid-cols-2">
            {urgent.map((a) => (
              <AdviceItem key={a.key} a={a} onHide={() => adv.hide(a)} />
            ))}
          </div>
        </section>
      )}

      {busy.length > 0 && (
        <section>
          <SectionTitle title="Bo'limlar bo'yicha" n={rest.length} />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {busy.map((area) => (
              <AreaBlock key={area} area={area} items={byArea(area)} onHide={adv.hide} />
            ))}
          </div>
        </section>
      )}

      {calm.length > 0 && (
        <section>
          <SectionTitle title="Joyida" />
          <div className="flex flex-wrap gap-2">
            {calm.map((a) => {
              const Icon = AREA_ICON[a];
              return (
                <span
                  key={a}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800"
                >
                  <CheckCircle2 size={15} />
                  <Icon size={14} className="opacity-70" /> {ADVICE_AREA_LABELS[a]}
                </span>
              );
            })}
          </div>
        </section>
      )}

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-4">
        <span>Hisoblangan: {fmtDateTime(d.generatedAt)}. Har tavsiya bazadagi raqamlardan, taxmin emas.</span>
        {adv.gone.length > 0 && (
          <button className="tap font-semibold text-ink-3 hover:text-ink hover:underline" onClick={() => adv.restoreAll(adv.gone)}>
            Yashirilganlarni qaytarish ({adv.gone.length})
          </button>
        )}
      </p>
    </div>
  );
}

function SectionTitle({ title, n, dot }: { title: string; n?: number; dot?: string }) {
  return (
    <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-ink-2">
      {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}
      {title}
      {n !== undefined && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-ink-3">{n}</span>}
    </h2>
  );
}

/** Bitta bo'lim (To'lovlar, Esselar...): sarlavha va shu bo'limdagi muhim/g'oya tavsiyalari */
function AreaBlock({ area, items, onHide }: { area: AdviceArea; items: Advice[]; onHide: (a: Advice) => void }) {
  const Icon = AREA_ICON[area];
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 font-bold">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Icon size={16} />
        </span>
        {ADVICE_AREA_LABELS[area]}
        <span className="text-sm font-semibold text-ink-4">{items.length}</span>
      </p>
      <div className="space-y-2">
        {items.map((a) => (
          <AdviceItem key={a.key} a={a} onHide={() => onHide(a)} showArea={false} />
        ))}
      </div>
    </div>
  );
}
