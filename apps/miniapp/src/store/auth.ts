import type { Me } from "@onatili/shared";
import { create } from "zustand";

interface AuthState {
  token: string | null;
  user: Me | null;
  setSession: (token: string, user: Me) => void;
}

// Token faqat xotirada saqlanadi: Mini App har ochilganda initData bilan qayta kiriladi.
export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  setSession: (token, user) => set({ token, user }),
}));
