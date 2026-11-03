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
