import { wordChanges } from "@onatili/shared";

export interface TranscriptValue {
  text: string;
  /** Ustoz matnni varoq bilan solishtirdi: faqat shunda AI o'qish aniqligi o'lchovga kiradi */
  checked: boolean;
}

/**
 * AI o'qigan matn: ustoz qayta yozmaydi, varoqqa qarab faqat noto'g'ri o'qilgan so'zni tuzatadi.
 * Ixtiyoriy: belgilanmasa baho baribir saqlanadi, matn o'lchovga kirmaydi.
 */
export function OfflineTranscript({ aiText, value, onChange }: { aiText: string; value: TranscriptValue; onChange: (v: TranscriptValue) => void }) {
  const fixed = wordChanges(aiText, value.text).errors;
  return (
    <details className="rounded-lg border border-line p-3 text-sm" open={value.checked}>
      <summary className="cursor-pointer font-bold">
        AI o'qigan matn
        {value.checked && <span className="ml-2 font-semibold text-green-700">· solishtirildi{fixed ? `, ${fixed} ta so'z tuzatildi` : ""}</span>}
      </summary>
      <p className="mt-2 text-xs text-ink-3">
        Ixtiyoriy, lekin AI'ni o'rgatish uchun juda foydali. Qayta yozmang: varoqqa qarab faqat AI noto'g'ri o'qigan so'zni tuzating. AI ko'pincha o'quvchining
        imlo yoki vergul xatosini o'zi «tuzatib» yuboradi: shu joylarni varoqdagidek qaytaring. <code>[?]</code> — AI o'qiy olmagan so'z.
      </p>
      <textarea
        className="input mt-2 min-h-[30vh] font-mono text-[16px] leading-relaxed sm:text-[15px]"
        value={value.text}
        onChange={(e) => onChange({ text: e.target.value, checked: true })}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
      />
      <label className="mt-2 flex items-center gap-2 font-semibold">
        <input type="checkbox" checked={value.checked} onChange={(e) => onChange({ ...value, checked: e.target.checked })} />
        Matnni varoq bilan solishtirdim
      </label>
      {value.text !== aiText && (
        <button type="button" className="btn-ghost btn-sm mt-1" onClick={() => onChange({ text: aiText, checked: false })}>
          AI matniga qaytarish
        </button>
      )}
    </details>
  );
}
