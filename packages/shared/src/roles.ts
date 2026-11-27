export const ROLES = ["STUDENT", "PARENT", "ASSISTANT", "TEACHER"] as const;
export type RoleName = (typeof ROLES)[number];

/** Admin paneliga kira oladigan rollar */
export const STAFF_ROLES: readonly RoleName[] = ["ASSISTANT", "TEACHER"];

export const ROLE_LABELS: Record<RoleName, string> = {
  STUDENT: "O'quvchi",
  PARENT: "Ota-ona",
  ASSISTANT: "Yordamchi",
  TEACHER: "Ustoz",
};

/**
 * Yordamchiga beriladigan ruxsatlar (admin panel bo'limlari).
 * Ustoz (ega) hammasiga ega. Xodimlar, zaxira va Excel eksport — faqat egada, ruxsat bilan berilmaydi.
 * Tartib va nomlar Prisma'dagi `Permission` enum bilan bir xil bo'lishi shart.
 */
export const PERMISSIONS = [
  "CONTENT",
  "ESSAYS",
  "EXTERNAL",
  "STUDENTS",
  "PARENTS",
  "GROUPS",
  "STATS",
  "STUDENT_ACCESS",
  "PAYMENTS",
  "BILLING",
  "ANNOUNCE",
  "TRASH",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_INFO: Record<Permission, { label: string; hint: string; group: "work" | "money" }> = {
  CONTENT: { label: "Kontent", hint: "Darslar, testlar, savollar banki, videolar", group: "work" },
  ESSAYS: { label: "Esselar", hint: "Esselarni baholash, ovozli izoh, oltin to'plam", group: "work" },
  EXTERNAL: { label: "Offline testlar", hint: "Qog'oz test natijalarini yuklash va xabar yuborish", group: "work" },
  STUDENTS: { label: "O'quvchilar", hint: "Kiritish, tahrirlash, yangi kelganlarni qabul qilish", group: "work" },
  PARENTS: { label: "Ota-onalar", hint: "Ota-ona so'rovlarini tasdiqlash yoki rad etish", group: "work" },
  GROUPS: { label: "Guruhlar va davomat", hint: "Guruh tuzish, o'quvchi qo'shish, davomat belgilash", group: "work" },
  STATS: { label: "Statistika", hint: "Statistika va «Yordamchi» tavsiyalari", group: "work" },
  STUDENT_ACCESS: { label: "O'quvchi kirishi", hint: "Bloklash, bepul ochish/yopish, hisoblarni birlashtirish, botdagi o'quvchini o'chirish", group: "money" },
  PAYMENTS: { label: "To'lovlar", hint: "Cheklar, obunalar, offline to'lovlar, qarzdorlar, daromad", group: "money" },
  BILLING: { label: "Tariflar va narxlar", hint: "Tariflar, karta raqami, esse tekshiruvi narxi", group: "money" },
  ANNOUNCE: { label: "E'lonlar", hint: "O'quvchi va ota-onalarga xabar yuborish", group: "money" },
  TRASH: { label: "Korzinka", hint: "O'chirilganlarni tiklash yoki butunlay o'chirish", group: "money" },
};

/** Yangi yordamchiga odatiy ruxsatlar: pulsiz kundalik ish (avvalgi «yordamchi» huquqlari) */
export const DEFAULT_ASSISTANT_PERMISSIONS: readonly Permission[] = ["CONTENT", "ESSAYS", "EXTERNAL", "STUDENTS", "PARENTS", "GROUPS", "STATS"];

/** Ustozda hamma ruxsat, yordamchida faqat berilgani, boshqalarda hech biri */
export function effectivePermissions(role: RoleName, permissions: readonly string[] | null | undefined): Permission[] {
  if (role === "TEACHER") return [...PERMISSIONS];
  if (role !== "ASSISTANT") return [];
  return PERMISSIONS.filter((p) => permissions?.includes(p));
}

export function hasPermission(user: { role: RoleName; permissions?: readonly string[] | null }, p: Permission): boolean {
  return effectivePermissions(user.role, user.permissions).includes(p);
}
