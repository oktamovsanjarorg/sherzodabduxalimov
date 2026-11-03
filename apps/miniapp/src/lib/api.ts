import type { AuthResponse, Me } from "@onatili/shared";
import { useAuth } from "../store/auth";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuth.getState().token;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  loginTelegram: (initData: string) =>
    request<AuthResponse>("/auth/telegram", { method: "POST", body: JSON.stringify({ initData }) }),
  me: () => request<Me>("/me"),
};
