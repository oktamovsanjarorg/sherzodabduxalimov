import type { AdminVideo } from "@onatili/shared";
import { ApiError, api } from "./api";

/**
 * Videoni bo'laklab yuklaydi va tarmoq uzilishiga chidamli ishlaydi:
 * - har bir bo'lak xato bersa, kutib qayta yuboriladi (5 martagacha);
 * - server 409 qaytarsa, uning receivedBytes qiymatidan davom etiladi;
 * - sahifa yangilansa: bir xil faylni tanlash yuklashni qolgan joyidan davom ettiradi (localStorage).
 */
const RESUME_KEY = "onatili-upload-resume";
const fingerprint = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

function resumeMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(RESUME_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function setResume(fp: string, id: string | null) {
  const m = resumeMap();
  if (id) m[fp] = id;
  else delete m[fp];
  localStorage.setItem(RESUME_KEY, JSON.stringify(m));
}

export interface UploadProgress {
  video: AdminVideo;
  sent: number;
  total: number;
  speedBps: number;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      rej(new DOMException("aborted", "AbortError"));
    });
  });

export async function uploadVideo(file: File, onProgress: (p: UploadProgress) => void, signal?: AbortSignal): Promise<AdminVideo> {
  const fp = fingerprint(file);
  let video: AdminVideo & { chunkSize?: number };
  let chunkSize = 8 * 1024 * 1024;

  // Oldingi tugallanmagan yuklashni davom ettirish
  const prevId = resumeMap()[fp];
  const prev = prevId ? await api.video(prevId).catch(() => null) : null;
  if (prev && prev.status === "UPLOADING" && prev.sizeBytes === file.size) {
    video = prev;
  } else {
    const created = await api.createVideo(file.name, file.size);
    chunkSize = created.chunkSize;
    video = created;
    setResume(fp, created.id);
  }

  let offset = video.receivedBytes;
  const started = Date.now();
  const startOffset = offset;
  onProgress({ video, sent: offset, total: file.size, speedBps: 0 });

  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(file.size, offset + chunkSize));
    let attempt = 0;
    for (;;) {
      try {
        video = await api.uploadChunk(video.id, offset, chunk, signal);
        offset = video.receivedBytes;
        break;
      } catch (e) {
        if (signal?.aborted) throw e;
        if (e instanceof ApiError && e.status === 409 && typeof e.body.receivedBytes === "number") {
          offset = e.body.receivedBytes; // server qayerda to'xtaganini aytdi, shu joydan davom etamiz
          break;
        }
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) throw e;
        if (++attempt > 5) throw new Error("Internet bilan muammo: yuklash to'xtadi. Faylni qayta tanlasangiz, shu joydan davom etadi.");
        await sleep(Math.min(30_000, 1000 * 2 ** attempt), signal);
      }
    }
    const secs = (Date.now() - started) / 1000;
    onProgress({ video, sent: offset, total: file.size, speedBps: secs > 0 ? (offset - startOffset) / secs : 0 });
  }

  setResume(fp, null);
  return api.video(video.id);
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
