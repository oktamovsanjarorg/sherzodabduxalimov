import { z } from "zod";
import { PERMISSIONS, type Permission } from "./roles";

const permissionList = z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length);

/** Ega yordamchi qo'shadi: username va ruxsatlar */
export const staffAddBody = z.object({
  username: z.string().min(1).max(64),
  permissions: permissionList,
});
export type StaffAddInput = z.infer<typeof staffAddBody>;

/** Yordamchi (yoki taklif) ruxsatlarini o'zgartirish */
export const staffPermissionsBody = z.object({ permissions: permissionList });

export interface StaffList {
  staff: {
    id: string;
    firstName: string;
    lastName: string | null;
    username: string | null;
    role: "TEACHER" | "ASSISTANT";
    isOwner: boolean;
    /** Ustozda doim hammasi */
    permissions: Permission[];
  }[];
  invites: { username: string; role: string; permissions: Permission[]; createdAt: string }[];
}
