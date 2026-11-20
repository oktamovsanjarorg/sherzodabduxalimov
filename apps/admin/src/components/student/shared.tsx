import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";

/** Bo'lim kartasi: sarlavha (ixtiyoriy izoh bilan) va mazmun */
export function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="font-extrabold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function CopyField({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input readOnly aria-label="Havola" className="input h-9 min-w-0 flex-1 bg-surface text-xs" value={value} onFocus={(e) => e.target.select()} />
      <button
        className="btn-primary btn-sm shrink-0"
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => {});
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      >
        {done ? <Check size={14} /> : <Copy size={14} />} {done ? "Nusxalandi" : "Nusxalash"}
      </button>
    </div>
  );
}
