import { ImagePlus, Loader2, X } from "lucide-react";
import { useId } from "react";

export interface PickedPhoto {
  blob: Blob;
  url: string;
}

/**
 * Varoq rasmlarini tanlash. <label> + ko'rinmas (lekin display:none emas) input:
 * Telegram webview'larida dasturiy .click() ba'zan fayl oynasini ochmaydi, label bosilishi esa doim ochadi.
 */
export function PhotoPicker({ photos, max, busy, onAdd, onRemove }: { photos: PickedPhoto[]; max: number; busy?: boolean; onAdd: (files: File[]) => void; onRemove: (i: number) => void }) {
  const id = useId();
  return (
    <div className="grid grid-cols-2 gap-2">
      {photos.map((p, i) => (
        <div key={p.url} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-section">
          <img src={p.url} alt={`${i + 1}-varoq`} className="h-full w-full object-contain" />
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">{i + 1}</span>
          <button onClick={() => onRemove(i)} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white" aria-label="O'chirish">
            <X size={16} />
          </button>
        </div>
      ))}
      {photos.length < max && (
        <label
          htmlFor={id}
          className={`tap flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand/50 bg-brand-soft text-brand ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          {busy ? <Loader2 size={30} className="animate-spin" /> : <ImagePlus size={30} />}
          <span className="px-3 text-center text-sm font-bold">{photos.length ? "Yana varoq qo'shish" : "📷 Varoq rasmini qo'shish"}</span>
          <span className="px-3 text-center text-[11px] text-hint">Kamera yoki galereya</span>
          <input
            id={id}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) onAdd(files.slice(0, max - photos.length));
            }}
          />
        </label>
      )}
    </div>
  );
}
