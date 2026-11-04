import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { hapticResult } from "../lib/telegram";

/** Karta raqami: bosilsa nusxalanadi */
export function CopyLine({ text, display }: { text: string; display: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ba'zi Telegram webview'larida clipboard API yopiq: eski usul
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    hapticResult("success");
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <button onClick={copy} className="tap mt-1 flex w-full items-center justify-between gap-2 text-left">
      <span className="text-xl font-extrabold tabular-nums tracking-wider">{display}</span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-brand">
        {done ? <Check size={16} /> : <Copy size={16} />}
        {done ? "Nusxalandi" : "Nusxalash"}
      </span>
    </button>
  );
}
