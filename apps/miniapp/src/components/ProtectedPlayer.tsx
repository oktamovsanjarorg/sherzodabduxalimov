import Hls from "hls.js";
import { Loader2, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatClock } from "../lib/hooks";
import { enterImmersive, isTelegramAndroid, isTelegramMobile } from "../lib/telegram";

const SPEEDS = [1, 1.25, 1.5, 2];

/** Faol pseudo-fullscreen'dan chiqish (Telegram "Orqaga" tugmasi uchun) */
let activeExit: (() => void) | null = null;
export function exitPlayerFullscreen(): boolean {
  if (!activeExit) return false;
  activeExit();
  return true;
}

function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);
  return v;
}

/**
 * Himoyalangan video pleyer:
 * - AES-128 HLS (kalit faqat imzolangan token bilan beriladi)
 * - doimiy "Sherzod-Abduxalimov" suv belgisi (to'liq ekranda ham)
 * - o'z boshqaruv paneli (tizim pleyerining to'liq ekrani suv belgisini yashirmasligi uchun)
 * - ilova fonga o'tganda pauza va xiralashtirish; yuklab olish va kontekst menyusi o'chirilgan
 */
export function ProtectedPlayer({ src, onExpired }: { src: string; onExpired?: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  // native: brauzer Fullscreen API (kompyuter); pseudo: o'zimiz (Telegram mobil webview, iPhone)
  const [mode, setMode] = useState<"none" | "native" | "pseudo">("none");
  const full = mode !== "none";
  const viewport = useViewport();
  const [hidden, setHidden] = useState(false);
  const [controls, setControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  // Har renderda yangi funksiya kelsa ham pleyer qayta ishga tushmasligi uchun ref'da saqlaymiz
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  // HLS ulash: MSE bo'lsa hls.js, aks holda (eski iOS) native HLS
  useEffect(() => {
    const v = video.current!;
    setError(null);
    if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30, enableWorker: true });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        const status = (data.response as { code?: number } | undefined)?.code;
        if (status === 403) {
          setError("Video havolasi eskirdi");
          onExpiredRef.current?.();
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else setError("Videoni ochib bo'lmadi");
      });
      hls.loadSource(src);
      hls.attachMedia(v);
      return () => hls.destroy();
    }
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = src;
      return () => {
        v.removeAttribute("src");
        v.load();
      };
    }
    setError("Bu qurilmada video qo'llab-quvvatlanmaydi");
  }, [src]);

  // Ilova fonga o'tsa (boshqa ilova, ekran yozish paneli va h.k.): pauza va xiralashtirish
  useEffect(() => {
    const onVis = () => {
      const h = document.visibilityState === "hidden";
      setHidden(h);
      if (h) video.current?.pause();
    };
    // window "blur" ishlatilmaydi: Telegram fullscreen'ga o'tganda yoki ekran burilganda ham ishga tushib, videoni to'xtatib qo'yardi
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setMode((m) => (m === "native" ? "none" : m));
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Pseudo-fullscreen: Telegram panelini yashirish, swipe'ni o'chirish, sahifa scroll'ini qotirish
  useEffect(() => {
    if (mode !== "pseudo") return;
    const restore = enterImmersive();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    activeExit = () => setMode("none");
    return () => {
      restore();
      document.body.style.overflow = prevOverflow;
      activeExit = null;
    };
  }, [mode]);

  const poke = useCallback(() => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!video.current?.paused) setControls(false);
    }, 3000);
  }, []);

  const toggle = () => {
    const v = video.current!;
    if (v.paused) void v.play();
    else v.pause();
    poke();
  };
  const seekBy = (d: number) => {
    const v = video.current!;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d));
    poke();
  };
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    video.current!.playbackRate = next;
    setSpeed(next);
    poke();
  };
  const toggleFull = async () => {
    poke();
    if (mode === "native") return void document.exitFullscreen().catch(() => setMode("none"));
    if (mode === "pseudo") return setMode("none");
    const el = wrap.current!;
    // iPhone'da Fullscreen API yo'q. Android Telegram webview'ida ba'zan ishlaydi (status panel ham yashirinadi),
    // ba'zan esa jimgina e'tiborsiz qoladi: shuning uchun 600ms kutamiz, bo'lmasa o'zimizning rejimga o'tamiz.
    const tryNative = typeof el.requestFullscreen === "function" && (!isTelegramMobile() || isTelegramAndroid());
    if (tryNative) {
      try {
        await Promise.race([
          el.requestFullscreen({ navigationUI: "hide" }),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 600)),
        ]);
        if (document.fullscreenElement === el) {
          setMode("native");
          await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.("landscape").catch(() => {});
          return;
        }
      } catch {
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      }
    }
    setMode("pseudo");
  };

  // Telefon tik turgan bo'lsa, pleyerni 90° buramiz: yonboshga qo'yganda video butun ekranni egallaydi
  const rotate = mode === "pseudo" && viewport.h > viewport.w;
  const pseudoStyle: React.CSSProperties | undefined =
    mode !== "pseudo"
      ? undefined
      : rotate
        ? {
            position: "fixed",
            top: "50%",
            left: "50%",
            width: viewport.h,
            height: viewport.w,
            transform: "translate(-50%, -50%) rotate(90deg)",
            zIndex: 60,
          }
        : { position: "fixed", inset: 0, zIndex: 60 };

  return (
    <div
      ref={wrap}
      onContextMenu={(e) => e.preventDefault()}
      onMouseMove={poke}
      style={pseudoStyle}
      className={`relative select-none overflow-hidden bg-black ${full ? "flex items-center" : "aspect-video w-full rounded-card"}`}
    >
      <video
        ref={video}
        className="h-full w-full"
        playsInline
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
        onClick={toggle}
        onPlay={() => {
          setPlaying(true);
          poke();
        }}
        onPause={() => {
          setPlaying(false);
          setControls(true);
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />

      <Watermark offsetTop={mode === "pseudo" && !rotate} />

      {hidden && <div className="absolute inset-0 z-20 bg-black/90 backdrop-blur-xl" />}

      {error ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6 text-center text-sm font-semibold text-white">{error}</div>
      ) : (
        <>
          {waiting && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <Loader2 size={40} className="animate-spin text-white/80" />
            </div>
          )}

          <div
            className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 text-white transition-opacity ${
              controls ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            style={
              rotate
                ? // burilganda pleyerning chap tomoni = telefonning tepasi (Telegram tugmalari, notch)
                  { paddingLeft: "calc(12px + var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px))", paddingRight: 12 }
                : full
                  ? { paddingBottom: "max(8px, env(safe-area-inset-bottom, 0px))" }
                  : undefined
            }
          >
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={time}
              onChange={(e) => {
                video.current!.currentTime = Number(e.target.value);
                poke();
              }}
              className="h-1 w-full cursor-pointer accent-white"
              aria-label="Videoni siljitish"
            />
            <div className="mt-1 flex items-center gap-1">
              <Btn onClick={toggle} label={playing ? "Pauza" : "Ijro"}>
                {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
              </Btn>
              <Btn onClick={() => seekBy(-10)} label="10 soniya orqaga">
                <RotateCcw size={18} />
              </Btn>
              <Btn onClick={() => seekBy(10)} label="10 soniya oldinga">
                <RotateCw size={18} />
              </Btn>
              <span className="ml-1 text-xs font-semibold tabular-nums">
                {formatClock(Math.floor(time))} / {formatClock(Math.floor(duration || 0))}
              </span>
              <span className="flex-1" />
              <button onClick={cycleSpeed} className="h-9 rounded-lg px-2 text-xs font-extrabold" aria-label="Tezlik">
                {speed}×
              </button>
              <Btn onClick={toggleFull} label="To'liq ekran">
                {full ? <Minimize size={18} /> : <Maximize size={18} />}
              </Btn>
            </div>
          </div>

          {!playing && !waiting && (
            <button onClick={toggle} className="absolute inset-0 z-20 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/50 text-white" aria-label="Ijro">
              <Play size={30} fill="currentColor" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Btn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex h-9 w-9 items-center justify-center rounded-lg active:bg-white/15">
      {children}
    </button>
  );
}

/** Ustoz talabi bilan: doimiy brend yozuvi, o'ng yuqori burchakda, qimirlamaydi */
const WATERMARK_TEXT = "Sherzod-Abduxalimov";

function Watermark({ offsetTop }: { offsetTop?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
      <span
        className="absolute right-3 top-2 whitespace-nowrap text-[11px] font-bold text-white/50 sm:text-sm"
        style={{
          textShadow: "0 0 3px rgba(0,0,0,.6)",
          // Telegram to'liq ekranida tepada status panel va Telegram tugmalari turadi
          ...(offsetTop ? { top: "calc(8px + var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px))" } : {}),
        }}
      >
        {WATERMARK_TEXT}
      </span>
    </div>
  );
}
