import { Loader2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        <h1 className="break-words text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 sm:overflow-y-auto sm:p-8" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex h-full w-full flex-col bg-white shadow-xl sm:h-auto sm:rounded-2xl sm:border sm:border-slate-200 ${wide ? "sm:max-w-4xl" : "sm:max-w-xl"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4" style={{ paddingTop: "max(12px, env(safe-area-inset-top, 0px))" }}>
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button className="btn-ghost h-10 w-10 p-0" onClick={onClose} aria-label="Yopish">
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:max-h-[70vh] sm:flex-none sm:px-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}>
            {footer}
          </div>
        )}
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
  // Telefonda uzun yorliq ekrandan chiqib ketmasin: kerak bo'lsa keyingi qatorga o'tadi
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold leading-tight [overflow-wrap:anywhere] sm:shrink-0 sm:whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
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

/**
 * Sahifaning asosiy ko'rinishlarini almashtirish (masalan: Kunlik / Oylik, Umumiy / To'lovlar tahlili).
 * Ro'yxatni saralash uchun Chips ishlatiladi — admin panel bo'ylab bitta qoida.
 */
export function Segmented<T extends string>({ value, onChange, options, className = "" }: { value: T; onChange: (v: T) => void; options: readonly (readonly [T, ReactNode])[]; className?: string }) {
  return (
    <div className={`max-w-full overflow-x-auto ${className}`}>
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm font-bold">
        {options.map(([k, l]) => (
          <button
            key={k}
            type="button"
            ref={value === k ? (el) => el?.scrollIntoView({ block: "nearest", inline: "nearest" }) : undefined}
            onClick={() => onChange(k)}
            className={`h-9 whitespace-nowrap rounded-md px-3 ${value === k ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Ro'yxat filtri: yumaloq tugmalar (guruh, holat, tur) */
export function Chips<T extends string>({ value, onChange, options, className = "" }: { value: T; onChange: (v: T) => void; options: readonly (readonly [T, ReactNode])[]; className?: string }) {
  return (
    <div className={`flex gap-2 overflow-x-auto pb-1 ${className}`}>
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-bold ${value === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
