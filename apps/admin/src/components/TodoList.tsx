import { CheckCircle2, ChevronRight, EyeOff, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useDismissed } from "../lib/dismiss";
import type { TodoItem } from "../lib/todo";

/** Birdaniga ko'rinadigan xabarlar; qolgani «Yana N ta» tugmasi ostida */
const LIMIT = 8;

const TONES: Record<TodoItem["tone"], string> = {
  amber: "border-amber-300 bg-amber-50 text-amber-900",
  brand: "border-brand/30 bg-brand-soft/40 text-brand-dark",
  red: "border-red-300 bg-red-50 text-red-800",
  gray: "border-line bg-surface text-ink-2",
};
const LINK_BTN = "tap text-xs font-semibold text-ink-3 hover:text-ink hover:underline";

/** Bosh sahifadagi «Bugun» bo'limi */
export function TodoList({ items }: { items: TodoItem[] }) {
  const { hidden, hide, restore } = useDismissed();
  const [all, setAll] = useState(false);
  const visible = items.filter((i) => !hidden(i.key, i.count));
  const gone = items.filter((i) => hidden(i.key, i.count));
  const rest = visible.length - LIMIT;

  return (
    <section className="space-y-2">
      <h2 className="label">Bugun</h2>
      {visible.slice(0, all ? undefined : LIMIT).map((i) => (
        <Todo key={i.key} i={i} onHide={() => hide(i.key, i.count)} />
      ))}
      {rest > 0 && (
        <button className="btn-secondary w-full" onClick={() => setAll(!all)}>
          {all ? "Kamroq ko'rsatish" : `Yana ${rest} ta ish`}
        </button>
      )}
      {items.length === 0 && (
        <div className="card flex items-center gap-3 p-4 text-sm font-semibold text-emerald-700">
          <CheckCircle2 size={20} /> Hammasi joyida, kutayotgan ish yo'q
        </div>
      )}
      {visible.length === 0 && gone.length > 0 && (
        <div className="card flex items-center gap-3 p-4 text-sm font-semibold text-ink-2">
          <EyeOff size={20} className="shrink-0" /> Kutayotgan {gone.length} ta ish bor, hammasi yashirilgan
        </div>
      )}
      {gone.length > 0 && (
        <button className={LINK_BTN} onClick={() => restore(gone.map((i) => i.key))}>
          Yashirilganlarni ko'rsatish ({gone.length})
        </button>
      )}
    </section>
  );
}

/** Xabar: bosilsa tegishli sahifaga o'tadi; ✕ — yashirish (yangi ish qo'shilsa qaytadi) */
function Todo({ i, onHide }: { i: TodoItem; onHide: () => void }) {
  return (
    <div className={`flex items-center rounded-2xl border transition hover:shadow-sm ${TONES[i.tone]}`}>
      <Link to={i.to} className="flex min-w-0 flex-1 items-center gap-3 p-4">
        <i.Icon size={22} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{i.title}</span>
          <span className="block text-xs opacity-80">{i.hint}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 opacity-60" />
      </Link>
      <button
        className="tap mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full opacity-60 hover:bg-black/5 hover:opacity-100"
        onClick={onHide}
        title="Yashirish"
        aria-label={`Yashirish: ${i.title}`}
      >
        <X size={17} />
      </button>
    </div>
  );
}
