import { ADVICE_AREA_LABELS, type Advice, type AdvisorAiNote } from "@onatili/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ChevronRight, Lightbulb, Sparkles, TriangleAlert, X } from "lucide-react";
import { Link } from "react-router-dom";
import { errMsg } from "../lib/api";
import { useDismissed } from "../lib/dismiss";
import { fmtShortDateTime } from "../lib/format";
import { useToast } from "../lib/toast";
import { AiText } from "./AiText";
import { Spinner } from "./ui";

const LEVEL = {
  urgent: { Icon: TriangleAlert, cls: "border-red-200 bg-red-50 text-red-900", tag: "Shoshilinch" },
  important: { Icon: AlertCircle, cls: "border-amber-200 bg-amber-50 text-amber-900", tag: "Muhim" },
  idea: { Icon: Lightbulb, cls: "border-line bg-surface text-ink", tag: "G'oya" },
} as const;

/** Tavsiyalar: nega (faktlar) va nima qilish (havola); ✕ — bajarildi/yashirish, son oshsa qaytadi */
export function AdviceList({ items, scope, limit }: { items: Advice[]; scope: string; limit?: number }) {
  const { hidden, hide, restore } = useDismissed();
  const key = (a: Advice) => `adv:${scope}:${a.key}`;
  const shown = items.filter((a) => !hidden(key(a), a.count));
  const gone = items.filter((a) => hidden(key(a), a.count));
  return (
    <div className="space-y-2">
      {shown.slice(0, limit).map((a) => {
        const L = LEVEL[a.level];
        return (
          <div key={a.key} className={`flex gap-3 rounded-2xl border p-4 ${L.cls}`}>
            <L.Icon size={20} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">
                {L.tag} · {ADVICE_AREA_LABELS[a.area]}
              </p>
              <p className="font-bold">{a.title}</p>
              <p className="mt-0.5 text-sm opacity-85">{a.why}</p>
              {a.action && (
                <Link to={a.action.to} className="mt-2 inline-flex items-center gap-1 text-sm font-bold underline-offset-2 hover:underline">
                  {a.action.label} <ChevronRight size={15} />
                </Link>
              )}
            </div>
            <button className="tap -mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full opacity-60 hover:bg-black/5 hover:opacity-100" title="Bajarildi / yashirish" aria-label={`Yashirish: ${a.title}`} onClick={() => hide(key(a), a.count)}>
              <X size={17} />
            </button>
          </div>
        );
      })}
      {shown.length === 0 && limit === undefined && <p className="card p-4 text-sm font-semibold text-emerald-700">Hozircha tavsiya yo'q: hammasi joyida.</p>}
      {limit !== undefined && shown.length > limit && <p className="text-xs text-ink-3">Yana {shown.length - limit} ta tavsiya bor</p>}
      {gone.length > 0 && limit === undefined && (
        <button className="tap text-xs font-semibold text-ink-3 hover:text-ink hover:underline" onClick={() => restore(gone.map(key))}>
          Yashirilganlarni ko'rsatish ({gone.length})
        </button>
      )}
    </div>
  );
}

/** AI xulosa: saqlangan oxirgisi ko'rinadi, «Yangilash» yangisini tayyorlaydi (pullik, ismlar yuborilmaydi) */
export function AiNote({ note, queryKey, generate, intro }: { note: AdvisorAiNote | null; queryKey: unknown[]; generate: () => Promise<AdvisorAiNote>; intro: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const gen = useMutation({ mutationFn: generate, onSuccess: () => qc.invalidateQueries({ queryKey }), onError: (e) => toast(errMsg(e), "error") });
  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex flex-1 items-center gap-2 font-extrabold">
          <Sparkles size={17} className="text-violet-700" /> AI tavsiyasi
        </h2>
        <button className="btn-secondary btn-sm" disabled={gen.isPending} onClick={() => gen.mutate()}>
          {gen.isPending ? <Spinner /> : <Sparkles size={14} />} {note ? "Yangilash" : "Tavsiya tayyorlash"}
        </button>
      </div>
      {gen.isPending ? (
        <p className="mt-2 text-sm text-ink-3">Tahlil qilinmoqda… (10–30 soniya)</p>
      ) : note ? (
        <>
          <div className="mt-3">
            <AiText text={note.text} />
          </div>
          <p className="mt-3 text-[11px] text-ink-4">AI tayyorladi: {fmtShortDateTime(note.createdAt)} · faqat platformadagi raqamlar asosida</p>
        </>
      ) : (
        <p className="mt-2 text-sm text-ink-2">{intro}</p>
      )}
    </section>
  );
}
