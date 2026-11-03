import { Loader2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card w-full ${wide ? "max-w-4xl" : "max-w-xl"} shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button className="btn-ghost h-8 w-8 p-0" onClick={onClose} aria-label="Yopish">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${checked ? "bg-brand" : "bg-slate-300"}`}
      >
        <span className={`h-5 w-5 rounded-full bg-white shadow transition ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
      <span>
        <span className="block text-sm font-bold">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

const tones = {
  green: "bg-emerald-100 text-emerald-800",
  gray: "bg-slate-100 text-slate-600",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  blue: "bg-sky-100 text-sky-800",
  brand: "bg-brand-soft text-brand-dark",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}

/** Ikki bosqichli o'chirish tugmasi: birinchi bosishda tasdiq so'raydi */
export function ConfirmButton({ onConfirm, children, label = "O'chirilsinmi?", className = "btn-danger btn-sm" }: { onConfirm: () => void; children: ReactNode; label?: string; className?: string }) {
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if (!ask) return;
    const t = setTimeout(() => setAsk(false), 4000);
    return () => clearTimeout(t);
  }, [ask]);
  return ask ? (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs font-bold text-red-600">{label}</span>
      <button className="btn-sm btn bg-red-600 text-white hover:bg-red-700" onClick={() => { setAsk(false); onConfirm(); }}>
        Ha
      </button>
      <button className="btn-ghost btn-sm" onClick={() => setAsk(false)}>
        Yo'q
      </button>
    </span>
  ) : (
    <button className={className} onClick={() => setAsk(true)}>
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} size={18} />;
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="font-bold">{title}</p>
      {hint && <p className="max-w-md text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
