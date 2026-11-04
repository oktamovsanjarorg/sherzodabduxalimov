import { z } from "zod";
import { ROLES } from "./roles";

export const authTelegramBody = z.object({ initData: z.string().min(1) });
export type AuthTelegramBody = z.infer<typeof authTelegramBody>;

export const meSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  username: z.string().nullable(),
  photoUrl: z.string().nullable(),
  role: z.enum(ROLES),
  /** Telegram orqali tasdiqlangan telefon (request_contact) */
  phone: z.string().nullable(),
  /** O'quvchi uchun: ota-ona ulanganmi (NONE bo'lsa ilova yopiq) */
  parentStatus: z.enum(["NONE", "PENDING", "APPROVED"]),
  subscription: z
    .object({ planName: z.string(), endsAt: z.string() })
    .nullable(),
  /** Offline guruh a'zosi: obunasiz hamma narsa ochiq */
  offlineGroup: z.object({ name: z.string() }).nullable().default(null),
});
export type Me = z.infer<typeof meSchema>;

export interface AuthResponse {
  token: string;
  expiresIn: string;
  user: Me;
}
