import type { Me } from "@onatili/shared";
import { create } from "zustand";

interface AuthState {
  token: string | null;
  user: Me | null;
  /** Hisob bloklangan: sababi bilan (har qanday so'rovda server shuni qaytarsa) */
  blocked: string | null;
  setSession: (token: string, user: Me) => void;
}

// Token faqat xotirada saqlanadi: Mini App har ochilganda initData bilan qayta kiriladi.
export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  blocked: null,
  setSession: (token, user) => set({ token, user }),
}));
