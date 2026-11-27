import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Permission, RoleName } from "@onatili/shared";

export interface JwtUser {
  sub: string;
  role: RoleName;
  /** Guard bazadan to'ldiradi: ustozda hammasi, yordamchida berilgani */
  permissions?: Permission[];
}

export const IS_PUBLIC = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = "roles";
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

export const PERMS_KEY = "perms";
/** Xodim uchun ruxsat: ustoz doim o'tadi, yordamchi shu ruxsatlardan biri bo'lsa. O'quvchi va ota-ona o'tmaydi */
export const Perm = (...perms: Permission[]) => SetMetadata(PERMS_KEY, perms);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): JwtUser => ctx.switchToHttp().getRequest().user);

/** Xizmat ichidagi tekshiruv (masalan, ro'yxatda pul ustunlarini ko'rsatish) */
export const can = (u: JwtUser, p: Permission) => !!u.permissions?.includes(p);
