import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between px-1">
      <h2 className="text-[15px] font-bold">{children}</h2>
      {action}
    </div>
  );
}

export function QuickAction({ Icon, label, hint, onClick }: { Icon: LucideIcon; label: string; hint: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="card tap flex flex-col items-start gap-3 text-left">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon size={20} />
      </span>
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-xs text-hint">{hint}</span>
      </span>
    </button>
  );
}

export function Badge({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "muted" }) {
  const cls = tone === "brand" ? "bg-brand-soft text-brand" : "bg-hint/15 text-hint";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${cls}`}>{children}</span>;
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="card flex flex-col items-center gap-1 py-10 text-center">
      <p className="font-bold">{title}</p>
      <p className="text-sm text-hint">Tez orada qo'shiladi</p>
    </div>
  );
}
