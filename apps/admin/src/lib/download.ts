import { ApiError } from "./api";
import { loadSession } from "./session";

/** Avtorizatsiya talab qiladigan faylni yuklab olish (oddiy havola sarlavha yubora olmaydi) */
export async function downloadAuthed(path: string, fallbackName: string) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${loadSession()?.token}` } });
  if (!res.ok) throw new ApiError(res.status, "Faylni tayyorlab bo'lmadi");
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}
