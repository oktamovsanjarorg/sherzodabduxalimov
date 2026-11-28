import { formatScore, type OfflineEssayAgreement } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { offlineApi } from "../lib/offline-essay-api";

const pct = (x: number) => `${Math.round(x * 100)}%`;
// Band farqi kichik (0,5 qadamli ballarning o'rtachasi): ikki xona aniqlikda
const signed = (x: number) => `${x > 0 ? "+" : ""}${String(Math.round(x * 100) / 100).replace(".", ",")}`;

/** «AI va ustoz»: ustoz baholagan har bir offline esse AI bahosi bilan solishtiriladi */
export function OfflineAgreement() {
  const q = useQuery({ queryKey: ["offline-essay-agreement"], queryFn: offlineApi.agreement });
  if (!q.data) return null;
  const a = q.data;
  if (!a.count && !a.transcripts.count)
    return (
      <p className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm text-ink-2">
        <Scale size={16} className="mt-0.5 shrink-0 text-ink-3" />
        Siz baholagan har bir esse AI bahosi bilan solishtiriladi: AI qaysi bandda adashishi va qo'lyozmani qanchalik to'g'ri o'qishi shu yerda ko'rinadi.
      </p>
    );
  return (
    <section className="card space-y-2 p-3 text-sm sm:p-4">
      <h3 className="flex items-center gap-2 font-extrabold">
        <Scale size={16} /> AI va ustoz
      </h3>
      {a.count > 0 && a.meanAbs != null && a.within2 != null && (
        <p className="text-ink-2">
          {a.count} ta esse: AI o'rtacha <b>{formatScore(a.meanAbs)} ball</b> farq qiladi, {pct(a.within2)} esseda farq 2 balldan oshmagan. AI yuqori qo'ygan{" "}
          {a.higher}, past {a.lower}, teng {a.equal}.
        </p>
      )}
      {a.transcripts.count > 0 && (
        <p className="text-ink-2">
          Qo'lyozmani o'qish ({a.transcripts.count} ta esse): {a.transcripts.words} so'zdan {a.transcripts.errors} tasini AI noto'g'ri o'qigan
          {a.transcripts.words ? ` (${pct(a.transcripts.errors / a.transcripts.words)})` : ""}.
        </p>
      )}
      {a.count < a.min && (
        <p className="text-xs font-semibold text-amber-800">
          Xulosa uchun kamida {a.min} ta baholangan esse kerak (hozir {a.count}). Hozircha bu raqamlar tasodifiy bo'lishi mumkin.
        </p>
      )}
      {a.bands.length > 0 && <Bands a={a} />}
    </section>
  );
}

function Bands({ a }: { a: OfflineEssayAgreement }) {
  return (
    <details>
      <summary className="cursor-pointer font-bold">Bandlar bo'yicha: AI qayerda ko'p adashadi</summary>
      <ul className="mt-2 divide-y divide-line">
        {a.bands.map((b) => (
          <li key={b.key} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
            <span className="min-w-0 flex-1">{b.label}</span>
            <span className="tabular-nums text-ink-2">
              {b.meanDiff === 0 ? "farq yo'q" : `${signed(b.meanDiff)} (AI ${b.meanDiff > 0 ? "oshiradi" : "pasaytiradi"})`} · aynan {pct(b.exact)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-ink-3">Farq — AI bali minus ustoz bali, o'rtacha. «Aynan» — AI ustoz bilan bir xil ball qo'ygan esselar ulushi.</p>
    </details>
  );
}
