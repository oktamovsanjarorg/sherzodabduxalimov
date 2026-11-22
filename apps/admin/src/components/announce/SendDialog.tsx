import type { AnnouncePreview } from "@onatili/shared";
import { Clock, Send } from "lucide-react";
import { useState } from "react";
import { Modal, Segmented } from "../ui";

/** datetime-local qiymati (mahalliy vaqt) <-> ISO */
const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** Yuborishdan oldingi tasdiq: hozir yoki belgilangan vaqtda, nechta odamga */
export function SendDialog({ preview, initial, busy, onClose, onSend }: { preview: AnnouncePreview; initial: string | null; busy: boolean; onClose: () => void; onSend: (at: string | null) => void }) {
  const future = initial && new Date(initial).getTime() > Date.now();
  const [when, setWhen] = useState<"now" | "later">(future ? "later" : "now");
  const [at, setAt] = useState(() => toLocal(future ? new Date(initial!) : new Date(Date.now() + 3600_000)));
  const date = new Date(at);
  const bad = when === "later" && (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 60_000);
  return (
    <Modal
      title="Yuborish"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Bekor
          </button>
          <button className="btn-primary" disabled={busy || bad} onClick={() => onSend(when === "now" ? null : date.toISOString())}>
            {when === "now" ? <Send size={16} /> : <Clock size={16} />} {when === "now" ? `${preview.reachable} kishiga yuborish` : "Rejalashtirish"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={when}
          onChange={setWhen}
          options={
            [
              ["now", "Hozir"],
              ["later", "Vaqtini belgilash"],
            ] as const
          }
        />
        {when === "later" && (
          <div>
            <label className="label" htmlFor="announce-at">
              Qachon yuborilsin
            </label>
            <input id="announce-at" type="datetime-local" className="input" value={at} min={toLocal(new Date())} onChange={(e) => setAt(e.target.value)} />
            {bad && <p className="mt-1 text-xs text-red-600">Kamida 1 daqiqa keyingi vaqtni tanlang</p>}
          </div>
        )}
        <p className="text-sm text-ink-2">
          Xabar <b>{preview.reachable} kishiga</b> boradi
          {preview.noTelegram ? `, ${preview.noTelegram} kishi botga kirmagani uchun olmaydi` : ""}. Yuborilgandan keyin 48 soat ichida qaytarib olish (hammadan o'chirish) mumkin.
        </p>
      </div>
    </Modal>
  );
}
