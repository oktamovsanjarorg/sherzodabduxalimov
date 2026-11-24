import type { GoldCreateInput, GoldDetail, GoldList, GoldRatingInput, GoldTranscriptInput } from "@onatili/shared";
import { ApiError, json, request } from "./api";
import { compressImage } from "./image";
import { loadSession } from "./session";

const auth = () => ({ Authorization: `Bearer ${loadSession()?.token}` });

/** Esse AI o'lchovi uchun sinov to'plami */
export const goldApi = {
  list: () => request<GoldList>("/admin/gold"),
  detail: (id: string) => request<GoldDetail>(`/admin/gold/${id}`),
  create: (d: GoldCreateInput) => request<GoldDetail>("/admin/gold", json("POST", d)),
  fromEssay: (essayId: string) => request<GoldDetail>(`/admin/gold/from-essay/${essayId}`, json("POST", { consent: true })),
  /** Telefondagi katta rasm siqiladi (uzun tomoni 2400px: qo'lyozma o'qilishi uchun yetarli aniq) */
  addPage: async (id: string, file: File) => {
    const body = await compressImage(file, 2400, 0.9);
    return request<GoldDetail>(`/admin/gold/${id}/pages`, { method: "POST", body, headers: { "Content-Type": "image/jpeg" } });
  },
  removePage: (id: string, n: number) => request<GoldDetail>(`/admin/gold/${id}/pages/${n}`, { method: "DELETE" }),
  page: async (id: string, n: number) => {
    const res = await fetch(`/api/admin/gold/${id}/pages/${n}`, { headers: auth() });
    if (!res.ok) throw new ApiError(res.status, "Rasmni yuklab bo'lmadi");
    return URL.createObjectURL(await res.blob());
  },
  saveTranscript: (id: string, d: GoldTranscriptInput) => request<GoldDetail>(`/admin/gold/${id}/transcript`, json("PUT", d)),
  rate: (id: string, d: GoldRatingInput) => request<GoldDetail>(`/admin/gold/${id}/rating`, json("PUT", d)),
  remove: (id: string) => request<{ ok: true }>(`/admin/gold/${id}`, { method: "DELETE" }),
  /** O'lchov uchun zip (faqat ustoz) */
  exportZip: async () => {
    const res = await fetch("/api/admin/gold/export.zip", { headers: auth() });
    if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => ({}))) as { message?: string }).message ?? "Faylni tayyorlab bo'lmadi");
    const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "gold.zip";
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { essays: Number(res.headers.get("x-gold-essays") ?? 0), skippedMarks: Number(res.headers.get("x-gold-skipped-marks") ?? 0) };
  },
};
