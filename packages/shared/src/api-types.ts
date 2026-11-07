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
  /** O'quvchi uchun: ota-ona ulanganmi */
  parentStatus: z.enum(["NONE", "PENDING", "APPROVED"]),
  subscription: z
    .object({ planName: z.string(), endsAt: z.string() })
    .nullable(),
  /** Offline guruh a'zosi: obunasiz hamma narsa ochiq */
  offlineGroup: z.object({ name: z.string() }).nullable().default(null),
  /** Ustoz belgilagan kirish rejimi (o'quvchi uchun) */
  accessMode: z.enum(["AUTO", "FREE", "CLOSED"]).default("AUTO"),
  /** Cheklangan rejim: ustoz va ota-ona tasdig'i hamda to'lovgacha har bo'limdan bir martadan */
  trial: z
    .object({
      limited: z.boolean(),
      /** Ustoz o'quvchini tasdiqlaganmi */
      accepted: z.boolean(),
      /** Faol obuna yoki shu oy uchun belgilangan offline to'lov bor */
      paid: z.boolean(),
      used: z.array(z.enum(["LESSON", "TOPIC_TEST", "MOCK", "ESSAY"])),
    })
    .default({ limited: false, accepted: true, paid: true, used: [] }),
  /** Ota-ona havolasi orqali kelgan, raqamini hali ulashmagan */
  pendingParentInvite: z.boolean().default(false),
  /** O'quvchi haqiqiy ism-familiyasini hali yozmagan: hozir Telegram'dagi ism turibdi */
  needsName: z.boolean().default(false),
});
export type Me = z.infer<typeof meSchema>;

export interface AuthResponse {
  token: string;
  expiresIn: string;
  user: Me;
}
