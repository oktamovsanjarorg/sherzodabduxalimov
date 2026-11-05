import type { VoiceView } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { Mic } from "lucide-react";
import { api } from "../lib/api";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Ustozning ovozli izohi: M4A (iPhone va Android'da bir xil ijro etiladi) */
export function VoiceNote({ voice }: { voice: VoiceView }) {
  const q = useQuery({ queryKey: ["voice", voice.id, voice.status], queryFn: () => api.voiceBlob(voice.id), enabled: voice.status !== "FAILED", staleTime: Infinity });
  if (voice.status === "FAILED") return null;
  return (
    <div className="card flex flex-col gap-2 border border-brand/30">
      <p className="flex items-center gap-2 text-sm font-bold">
        <Mic size={18} className="text-brand" /> Ustozning ovozli izohi
        {voice.durationSec ? <span className="text-xs font-semibold text-hint">· {fmt(voice.durationSec)}</span> : null}
      </p>
      {voice.status === "PROCESSING" ? (
        <p className="text-xs text-hint">Tayyorlanmoqda… bir daqiqada bot orqali ham keladi.</p>
      ) : q.data ? (
        <audio controls preload="metadata" src={q.data} className="w-full" />
      ) : (
        <div className="skeleton h-10" />
      )}
    </div>
  );
}
