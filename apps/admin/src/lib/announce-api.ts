import type { AnnounceAudience, AnnounceDetail, AnnounceInput, AnnouncePreview, AnnounceRow } from "@onatili/shared";
import { loadSession } from "./session";
import { ApiError, json, request } from "./api";

/** E'lonlar (ommaviy xabarlar) API'si */
export const announceApi = {
  list: () => request<AnnounceRow[]>("/admin/announcements"),
  get: (id: string) => request<AnnounceDetail>(`/admin/announcements/${id}`),
  preview: (audience: AnnounceAudience) => request<AnnouncePreview>("/admin/announcements/preview", json("POST", { audience })),
  create: (d: AnnounceInput) => request<AnnounceDetail>("/admin/announcements", json("POST", d)),
  update: (id: string, d: AnnounceInput) => request<AnnounceDetail>(`/admin/announcements/${id}`, json("PATCH", d)),
  remove: (id: string) => request(`/admin/announcements/${id}`, json("DELETE")),
  send: (id: string, scheduledAt: string | null) => request<AnnounceDetail>(`/admin/announcements/${id}/send`, json("POST", { scheduledAt })),
  cancel: (id: string) => request<AnnounceDetail>(`/admin/announcements/${id}/cancel`, json("POST")),
  retry: (id: string) => request<{ queued: number }>(`/admin/announcements/${id}/retry`, json("POST")),
  recall: (id: string) => request<{ queued: number }>(`/admin/announcements/${id}/recall`, json("POST")),
  duplicate: (id: string) => request<AnnounceDetail>(`/admin/announcements/${id}/duplicate`, json("POST")),
  test: (d: AnnounceInput) => request<{ ok: true }>("/admin/announcements/test", json("POST", d)),
  uploadPhoto: (file: File) =>
    request<{ fileId: string }>("/admin/announcements/photo", {
      method: "POST",
      body: file,
      headers: { "Content-Type": file.type },
    }),
  /** Rasm Authorization bilan olinadi (img src sarlavha yubora olmaydi) */
  photoUrl: async (fileId: string) => {
    const res = await fetch(`/api/admin/announcements/photo/${encodeURIComponent(fileId)}`, { headers: { Authorization: `Bearer ${loadSession()?.token ?? ""}` } });
    if (!res.ok) throw new ApiError(res.status, "Rasm topilmadi");
    return URL.createObjectURL(await res.blob());
  },
};
