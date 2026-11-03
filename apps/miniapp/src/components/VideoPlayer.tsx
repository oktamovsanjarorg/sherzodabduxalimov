import { PlayCircle } from "lucide-react";
import { openExternal } from "../lib/telegram";

function youtubeId(url: string): string | null {
  const m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  return m ? m[1] : null;
}

/** YouTube: o'rnatilgan pleyer. To'g'ridan-to'g'ri fayl (.mp4, .m3u8): <video>. Telegram post va boshqalar: tashqi havola. */
export function VideoPlayer({ url }: { url: string }) {
  const yt = youtubeId(url);
  if (yt) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-card bg-black">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1&playsinline=1`}
          title="Videodars"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }
  if (/\.(mp4|webm|m3u8)(\?|$)/i.test(url)) {
    return (
      <video
        className="aspect-video w-full rounded-card bg-black"
        src={url}
        controls
        playsInline
        controlsList="nodownload"
        onContextMenu={(e) => e.preventDefault()}
      />
    );
  }
  return (
    <button
      onClick={() => openExternal(url)}
      className="tap flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-card bg-brand text-white"
    >
      <PlayCircle size={48} strokeWidth={1.5} />
      <span className="text-sm font-bold">Videoni ochish</span>
    </button>
  );
}
