import { MAX_VOICE_BYTES, type VoiceView } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { Mic, Square, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const MAX_SEC = 10 * 60;

/** Brauzer qo'llaydigan format: Chrome/Android — webm/opus, iPhone Safari — mp4/aac */
function pickMime() {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported?.(m)) return m;
  return "";
}

/** Saqlangan ovozli izohni tinglash (avtorizatsiya bilan blob) */
export function VoicePlayer({ voice }: { voice: VoiceView }) {
  const q = useQuery({ queryKey: ["voice", voice.id, voice.status], queryFn: () => api.voiceBlob(voice.id), staleTime: Infinity });
  if (voice.status === "FAILED") return <p className="text-xs text-red-600">Ovozli izohni o'girib bo'lmadi, qayta yozing</p>;
  return (
    <div className="flex items-center gap-2">
      {q.data ? <audio controls src={q.data} className="h-9 w-full max-w-xs" /> : <span className="text-xs text-slate-400">Yuklanmoqda…</span>}
      {voice.status === "PROCESSING" && <span className="text-xs text-slate-500">o'quvchiga yuborilmoqda…</span>}
      {voice.durationSec && voice.status === "READY" && <span className="text-xs text-slate-500">{fmt(voice.durationSec)} · yuborilgan</span>}
    </div>
  );
}

/**
 * Ovozli izoh yozish: yozib, tinglab ko'rib, qayta yozish mumkin. Yoki tayyor audio faylni yuklash.
 * Natija (Blob) yuqoriga beriladi; yuborish baholash bilan birga bo'ladi.
 */
export function VoiceRecorder({ value, onChange }: { value: Blob | null; onChange: (b: Blob | null) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [sec, setSec] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number>();

  useEffect(() => {
    if (!value) return setUrl(null);
    const u = URL.createObjectURL(value);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);
  useEffect(() => () => window.clearInterval(timer.current), []);

  const start = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = pickMime();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        window.clearInterval(timer.current);
        const blob = new Blob(chunks.current, { type: (r.mimeType || mime || "audio/webm").split(";")[0] });
        setRec(null);
        if (blob.size > 1000) onChange(blob);
      };
      r.start(1000);
      setRec(r);
      setSec(0);
      const t0 = Date.now();
      timer.current = window.setInterval(() => {
        const s = (Date.now() - t0) / 1000;
        setSec(s);
        if (s >= MAX_SEC) r.stop();
      }, 250);
    } catch {
      setErr("Mikrofonga ruxsat berilmadi. Brauzer sozlamalarida mikrofonni yoqing yoki tayyor audio faylni yuklang.");
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="mb-2 text-sm font-bold">🎙 Ovozli izoh (ixtiyoriy)</p>
      {rec ? (
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 animate-pulse rounded-full bg-red-600" />
          <span className="font-mono text-sm font-bold">{fmt(sec)}</span>
          <button type="button" className="btn-danger btn-sm" onClick={() => rec.stop()}>
            <Square size={13} /> To'xtatish
          </button>
        </div>
      ) : url ? (
        <div className="flex flex-wrap items-center gap-2">
          <audio controls src={url} className="h-9 w-full max-w-xs" />
          <button type="button" className="btn-secondary btn-sm" onClick={start}>
            <Mic size={13} /> Qayta yozish
          </button>
          <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => onChange(null)} aria-label="O'chirish">
            <Trash2 size={13} />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary btn-sm" onClick={start}>
            <Mic size={13} /> Ovoz yozish
          </button>
          <label className="btn-secondary btn-sm cursor-pointer">
            <Upload size={13} /> Fayl yuklash
            <input
              type="file"
              accept="audio/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > MAX_VOICE_BYTES) return setErr("Fayl juda katta (ko'pi bilan 12 MB)");
                onChange(f);
              }}
            />
          </label>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <p className="mt-2 text-xs text-slate-500">Baholash bilan birga o'quvchiga Telegram'da ovozli xabar bo'lib boradi va ilovada ham eshitiladi.</p>
    </div>
  );
}
