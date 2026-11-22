import type { Prisma, PrismaClient, Role } from "@onatili/db";
import { ANNOUNCE_ROLE_LABELS, announceAudience, type AnnounceAudience, type AnnouncePreview } from "@onatili/shared";

export interface Target {
  userId: string;
  chatId: bigint | null;
  role: Role;
  name: string;
}

const userSelect = { id: true, telegramId: true, firstName: true, lastName: true, role: true } as const;
type U = Prisma.UserGetPayload<{ select: typeof userSelect }>;

/** DB'dagi JSON'ni (eski yoki buzuq bo'lsa ham) xavfsiz o'qish */
export function readAudience(json: unknown): AnnounceAudience {
  const r = announceAudience.safeParse(json);
  return r.success ? r.data : { roles: [], groupIds: [], modes: [], onlyAccepted: true, userIds: [] };
}

/**
 * Auditoriyani aniq odamlar ro'yxatiga aylantiradi. Har bir odam bir marta (birinchi mos kelgan roli bilan).
 * Bloklangan foydalanuvchilar kirmaydi. Guruh/rejim filtri o'quvchilarga va ularning ota-onalariga ta'sir qiladi.
 */
export async function resolveAudience(prisma: PrismaClient, a: AnnounceAudience): Promise<Target[]> {
  const student: Prisma.StudentProfileWhereInput = {
    ...(a.groupIds.length ? { groupId: { in: a.groupIds } } : {}),
    ...(a.modes.length ? { mode: { in: a.modes } } : {}),
    ...(a.onlyAccepted ? { acceptedAt: { not: null } } : {}),
    user: { isBlocked: false },
  };
  const out = new Map<string, Target>();
  const add = (users: U[], role?: Role) => {
    for (const u of users) {
      if (!out.has(u.id)) out.set(u.id, { userId: u.id, chatId: u.telegramId, role: role ?? u.role, name: [u.firstName, u.lastName].filter(Boolean).join(" ") });
    }
  };
  const orderBy = { firstName: "asc" } as const;
  if (a.roles.includes("STUDENT")) {
    add(await prisma.user.findMany({ where: { role: "STUDENT", isBlocked: false, student: { is: student } }, select: userSelect, orderBy }), "STUDENT");
  }
  if (a.roles.includes("PARENT")) {
    add(await prisma.user.findMany({ where: { isBlocked: false, parentLinks: { some: { status: "APPROVED", student } } }, select: userSelect, orderBy }), "PARENT");
  }
  if (a.roles.includes("ASSISTANT")) {
    add(await prisma.user.findMany({ where: { role: { in: ["ASSISTANT", "TEACHER"] }, isBlocked: false }, select: userSelect, orderBy }));
  }
  if (a.userIds.length) add(await prisma.user.findMany({ where: { id: { in: a.userIds }, isBlocked: false }, select: userSelect, orderBy }));
  return [...out.values()];
}

export function previewOf(targets: Target[]): AnnouncePreview {
  const reach = targets.filter((t) => t.chatId !== null);
  const byRole: AnnouncePreview["byRole"] = {};
  for (const t of reach) {
    const k = t.role === "STUDENT" || t.role === "PARENT" || t.role === "TEACHER" ? t.role : "ASSISTANT";
    byRole[k] = (byRole[k] ?? 0) + 1;
  }
  return { reachable: reach.length, noTelegram: targets.length - reach.length, byRole, sample: reach.slice(0, 8).map((t) => t.name) };
}

/** Ro'yxatda ko'rsatish uchun qisqa tavsif: «O'quvchilar, Ota-onalar · 9-A guruh · online · +2 kishi» */
export function audienceLabel(a: AnnounceAudience, groupNames: Map<string, string>): string {
  const parts: string[] = [];
  if (a.roles.length) parts.push(a.roles.map((r) => ANNOUNCE_ROLE_LABELS[r]).join(", "));
  const filtered = a.roles.some((r) => r !== "ASSISTANT");
  if (filtered && a.groupIds.length) {
    const names = a.groupIds.map((id) => groupNames.get(id)).filter(Boolean);
    parts.push(names.length && names.length <= 2 ? names.join(", ") : `${a.groupIds.length} ta guruh`);
  }
  if (filtered && a.modes.length === 1) parts.push(a.modes[0] === "ONLINE" ? "online" : "offline");
  if (a.userIds.length) parts.push(a.roles.length ? `+${a.userIds.length} kishi` : `${a.userIds.length} kishi`);
  return parts.join(" · ");
}
