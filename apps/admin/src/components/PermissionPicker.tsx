import { DEFAULT_ASSISTANT_PERMISSIONS, PERMISSIONS, PERMISSION_INFO, type Permission } from "@onatili/shared";
import { Check } from "lucide-react";

const GROUPS: { key: "work" | "money"; title: string }[] = [
  { key: "work", title: "Kundalik ish" },
  { key: "money", title: "Pul va boshqaruv" },
];

/** Yordamchi ruxsatlarini belgilash: ikki guruh, har birida izohli belgilar */
export function PermissionPicker({ value, onChange }: { value: Permission[]; onChange: (v: Permission[]) => void }) {
  const toggle = (p: Permission) => onChange(PERMISSIONS.filter((x) => (x === p ? !value.includes(p) : value.includes(x))));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([...DEFAULT_ASSISTANT_PERMISSIONS])}>
          Odatiy (pulsiz)
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([...PERMISSIONS])}>
          Hammasi
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => onChange([])}>
          Tozalash
        </button>
      </div>
      {GROUPS.map((g) => (
        <fieldset key={g.key}>
          <legend className="label mb-1.5">{g.title}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PERMISSIONS.filter((p) => PERMISSION_INFO[p].group === g.key).map((p) => {
              const on = value.includes(p);
              return (
                <label
                  key={p}
                  className={`flex min-h-[56px] cursor-pointer items-start gap-3 rounded-xl border p-3 transition focus-within:ring-2 focus-within:ring-brand/30 ${
                    on ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"
                  }`}
                >
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(p)} />
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? "border-brand bg-brand text-white" : "border-line-strong bg-surface"}`}
                    aria-hidden
                  >
                    {on && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{PERMISSION_INFO[p].label}</span>
                    <span className="block text-xs text-ink-3">{PERMISSION_INFO[p].hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <p className="text-xs text-ink-4">Xodimlar, zaxira nusxalar va Excel eksport faqat egada qoladi.</p>
    </div>
  );
}

/** Ro'yxatda qisqa ko'rinish: nechta ruxsat va nomlari */
export function PermissionSummary({ value }: { value: Permission[] }) {
  if (!value.length) return <p className="text-xs font-semibold text-amber-700">Ruxsat yo'q: faqat «Bugun» sahifasi</p>;
  return (
    <div className="flex flex-wrap gap-1">
      {value.map((p) => (
        <span
          key={p}
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${PERMISSION_INFO[p].group === "money" ? "bg-amber-100 text-amber-800" : "bg-surface-3 text-ink-2"}`}
        >
          {PERMISSION_INFO[p].label}
        </span>
      ))}
    </div>
  );
}
