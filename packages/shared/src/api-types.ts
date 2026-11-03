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
  subscription: z
    .object({ planName: z.string(), endsAt: z.string() })
    .nullable(),
});
export type Me = z.infer<typeof meSchema>;

export interface AuthResponse {
  token: string;
  expiresIn: string;
  user: Me;
}
