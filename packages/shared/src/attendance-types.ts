import { z } from "zod";

export const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const;
export type AttendanceStatusName = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LABELS: Record<AttendanceStatusName, string> = {
  PRESENT: "Keldi",
  LATE: "Kechikdi",
  ABSENT: "Kelmadi",
  EXCUSED: "Sababli",
};

export const PARENT_FLAG_LABELS: Record<string, string> = {
  same_phone: "Ota-ona raqami o'quvchining raqami bilan bir xil",
  student_activity: "Bu akkaunt ilovada o'quvchi sifatida dars ko'rgan yoki test yechgan",
  many_children: "Bu akkaunt 3 tadan ortiq o'quvchiga ulangan",
  no_student_phone: "O'quvchi o'z raqamini ulashmagan",
};

export const groupInput = z.object({
  name: z.string().trim().min(1, "Guruh nomi kerak").max(100),
  schedule: z.string().trim().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type GroupInput = z.infer<typeof groupInput>;

export const attendanceSaveInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana YYYY-MM-DD bo'lishi kerak"),
  items: z
    .array(z.object({ studentId: z.string(), status: z.enum(ATTENDANCE_STATUSES), note: z.string().max(300).nullable().optional() }))
    .max(500),
});
export type AttendanceSaveInput = z.infer<typeof attendanceSaveInput>;

export interface AdminParentInfo {
  linkId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  name: string;
  username: string | null;
  phone: string | null;
  relation: string | null;
}

export interface AdminStudent {
  userId: string;
  studentId: string; // StudentProfile id
  name: string;
  username: string | null;
  phone: string | null;
  groupId: string | null;
  groupName: string | null;
  parents: AdminParentInfo[];
}

export interface AdminGroup {
  id: string;
  name: string;
  schedule: string | null;
  isActive: boolean;
  studentCount: number;
}

export interface AdminParentLink {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  relation: string | null;
  phone: string | null;
  flags: string[];
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectReason: string | null;
  parent: { id: string; name: string; username: string | null; telegramId: string };
  student: { userId: string; name: string; username: string | null; phone: string | null; telegramId: string; groupName: string | null };
}

export interface AttendanceDay {
  date: string;
  group: AdminGroup;
  rows: {
    student: AdminStudent;
    status: AttendanceStatusName | null;
    note: string | null;
    notifiedAt: string | null;
  }[];
}

export interface AttendanceMonth {
  month: string; // YYYY-MM
  days: string[]; // davomat olingan kunlar
  rows: { student: AdminStudent; marks: Record<string, AttendanceStatusName> }[];
}

/** Ota-ona ko'rinishi (Mini App) */
export interface ChildView {
  name: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  groupName: string | null;
  recent: { date: string; status: AttendanceStatusName }[];
}
