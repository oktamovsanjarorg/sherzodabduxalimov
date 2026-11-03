import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { RoleName } from "@onatili/shared";

export interface JwtUser {
  sub: string;
  role: RoleName;
}

export const IS_PUBLIC = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = "roles";
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtUser => ctx.switchToHttp().getRequest().user,
);
