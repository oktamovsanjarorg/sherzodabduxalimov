import type { OfflineEssayDetail, OfflineEssayTest, OfflineEssayTestDetail } from "@onatili/shared";
import { ApiError, json, request } from "./api";
import { compressImage } from "./image";
import { loadSession } from "./session";

const base = "/admin/offline-essays";

/** Offline test essesi: varoq rasmi → AI taxminiy baho → ustoz tasdig'i */
export const offlineApi = {
  tests: () => request<OfflineEssayTest[]>(`${base}/tests`),
  test: (id: string) => request<OfflineEssayTestDetail>(`${base}/tests/${id}`),
  setPrompt: (id: string, prompt: string) => request(`${base}/tests/${id}/prompt`, json("PUT", { prompt })),
  check: (id: string, resultIds: string[] = []) => request<{ queued: number }>(`${base}/tests/${id}/check`, json("POST", { resultIds })),
  detail: (resultId: string) => request<OfflineEssayDetail>(`${base}/${resultId}`),
  /** Telefondagi katta rasm siqiladi (uzun tomoni 2400px: qo'lyozma o'qilishi uchun yetarli aniq) */
  addPage: async (resultId: string, file: File) => {
    const body = await compressImage(file, 2400, 0.9);
    return request<OfflineEssayDetail>(`${base}/${resultId}/pages`, { method: "POST", body, headers: { "Content-Type": "image/jpeg" } });
  },
  removePage: (resultId: string, n: number) => request<OfflineEssayDetail>(`${base}/${resultId}/pages/${n}`, { method: "DELETE" }),
  page: async (resultId: string, n: number) => {
    const res = await fetch(`/api${base}/${resultId}/pages/${n}`, { headers: { Authorization: `Bearer ${loadSession()?.token}` } });
    if (!res.ok) throw new ApiError(res.status, "Rasmni yuklab bo'lmadi");
    return URL.createObjectURL(await res.blob());
  },
  confirm: (resultId: string, score: number) => request<OfflineEssayDetail>(`${base}/${resultId}/confirm`, json("POST", { score })),
};
