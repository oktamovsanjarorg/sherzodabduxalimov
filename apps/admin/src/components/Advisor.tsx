import { ADVICE_AREA_LABELS, type Advice, type AdviceArea } from "@onatili/shared";
import { Activity, BookOpen, CalendarCheck, ChevronRight, GraduationCap, PenLine, Users, Wallet, X, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useDismissed } from "../lib/dismiss";

export const LEVEL = {
  urgent: { dot: "bg-red-500", bar: "border-l-red-500", tag: "Shoshilinch", tagCls: "bg-red-50 text-red-700" },
  important: { dot: "bg-amber-400", bar: "border-l-amber-400", tag: "Muhim", tagCls: "bg-amber-50 text-amber-800" },
  idea: { dot: "bg-sky-400", bar: "border-l-sky-400", tag: "G'oya", tagCls: "bg-sky-50 text-sky-800" },
} as const;

export const AREA_ICON: Record<AdviceArea, LucideIcon> = {
  payments: Wallet,
  essays: PenLine,
  attendance: CalendarCheck,
  learning: GraduationCap,
  activity: Activity,
  parents: Users,
  content: BookOpen,
};

/** Bitta tavsiya: nima (sarlavha), nega (faktlar), nima qilish (tugma). ✕ — bajarildi; son oshsa qaytadi */
export function AdviceItem({ a, onHide, showArea = true }: { a: Advice; onHide: () => void; showArea?: boolean }) {
  const L = LEVEL[a.level];
  const Icon = AREA_ICON[a.area];
  return (
    <div className={`card flex gap-3 border-l-4 p-3.5 sm:p-4 ${L.bar}`}>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
          <span className={`rounded-full px-2 py-0.5 ${L.tagCls}`}>{L.tag}</span>
          {showArea && (
            <span className="inline-flex items-center gap-1 text-ink-3">
              <Icon size={12} /> {ADVICE_AREA_LABELS[a.area]}
            </span>
          )}
        </p>
        <p className="mt-1.5 font-bold leading-snug">{a.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-3">{a.why}</p>
        {a.action && (
          <Link to={a.action.to} className="btn-secondary btn-sm mt-2.5">
            {a.action.label} <ChevronRight size={14} />
          </Link>
        )}
      </div>
      <button
        className="tap -mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-4 hover:bg-surface-2 hover:text-ink"
        title="Bajarildi / yashirish"
        aria-label={`Yashirish: ${a.title}`}
        onClick={onHide}
      >
        <X size={17} />
      </button>
    </div>
  );
}

/** Yashirish holati bilan tavsiyalar: shown — ko'rinadiganlar, gone — yashirilganlar */
export function useAdvice(items: Advice[], scope: string) {
  const { hidden, hide, restore } = useDismissed();
  const key = (a: Advice) => `adv:${scope}:${a.key}`;
  return {
    shown: items.filter((a) => !hidden(key(a), a.count)),
    gone: items.filter((a) => hidden(key(a), a.count)),
    hide: (a: Advice) => hide(key(a), a.count),
    restoreAll: (l: Advice[]) => restore(l.map(key)),
  };
}

/** Oddiy ro'yxat (bosh sahifa, o'quvchi sahifasi) */
export function AdviceList({ items, scope, limit }: { items: Advice[]; scope: string; limit?: number }) {
  const { shown, gone, hide, restoreAll } = useAdvice(items, scope);
  return (
    <div className="space-y-2">
      {shown.slice(0, limit).map((a) => (
        <AdviceItem key={a.key} a={a} onHide={() => hide(a)} />
      ))}
      {shown.length === 0 && limit === undefined && <p className="card p-4 text-sm font-semibold text-emerald-700">Hozircha tavsiya yo'q: hammasi joyida.</p>}
      {limit !== undefined && shown.length > limit && <p className="text-xs text-ink-3">Yana {shown.length - limit} ta tavsiya bor</p>}
      {gone.length > 0 && limit === undefined && (
        <button className="tap text-xs font-semibold text-ink-3 hover:text-ink hover:underline" onClick={() => restoreAll(gone)}>
          Yashirilganlarni ko'rsatish ({gone.length})
        </button>
      )}
    </div>
  );
}
