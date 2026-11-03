import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { STAFF_ROLES, type AuthResponse, type RoleName } from "@onatili/shared";
import { createHash, randomBytes } from "node:crypto";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";

export interface TelegramProfile {
  id: number | bigint;
  username?: string | null;
  first_name: string;
  last_name?: string | null;
  photo_url?: string | null;
  language_code?: string | null;
}

const LOGIN_TOKEN_TTL_MS = 5 * 60 * 1000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const normUsername = (u?: string | null) => (u ?? "").trim().replace(/^@/, "").toLowerCase();

@Injectable()
export class StaffService {
  private readonly owners: Set<string>;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {
    this.owners = new Set(env.OWNER_USERNAMES.split(",").map(normUsername).filter(Boolean));
  }

  isOwnerUsername(username?: string | null) {
    return this.owners.has(normUsername(username));
  }

  /**
   * Telegram foydalanuvchisini yaratadi yoki yangilaydi va rolini belgilaydi:
   * ega ro'yxatidagi username: TEACHER; taklif qilingan username: taklifdagi rol.
   */
  async upsertTelegramUser(tg: TelegramProfile) {
    const profile = {
      username: tg.username ?? null,
      firstName: tg.first_name,
      lastName: tg.last_name ?? null,
      photoUrl: tg.photo_url ?? null,
      languageCode: tg.language_code ?? null,
    };
    let user = await this.prisma.user.upsert({
      where: { telegramId: BigInt(tg.id) },
      update: profile,
      create: {
        telegramId: BigInt(tg.id),
        ...profile,
        student: { create: { parentLinkCode: randomBytes(4).toString("hex").toUpperCase() } },
      },
    });

    const uname = normUsername(tg.username);
    if (uname && this.owners.has(uname) && user.role !== "TEACHER") {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { role: "TEACHER" } });
    } else if (uname) {
      const invite = await this.prisma.staffInvite.findUnique({ where: { username: uname } });
      if (invite) {
        [user] = await this.prisma.$transaction([
          this.prisma.user.update({ where: { id: user.id }, data: { role: invite.role } }),
          this.prisma.staffInvite.delete({ where: { username: uname } }),
        ]);
      }
    }
    return user;
  }

  /** Bot /admin: xodim uchun bir martalik kirish havolasi. Xodim bo'lmasa null. */
  async createLoginLink(tg: TelegramProfile): Promise<string | null> {
    const user = await this.upsertTelegramUser(tg);
    if (user.isBlocked || !STAFF_ROLES.includes(user.role)) return null;
    const token = randomBytes(32).toString("base64url");
    await this.prisma.loginToken.create({
      data: { tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS) },
    });
    return `${this.env.ADMIN_URL.replace(/\/$/, "")}/login#t=${token}`;
  }

  /** Havoladagi tokenni JWT'ga almashtiradi. Token bir marta ishlaydi. */
  async consumeLoginToken(token: string): Promise<AuthResponse> {
    const row = await this.prisma.loginToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException("Havola eskirgan yoki ishlatilgan. Botga /admin deb qayta yozing.");
    }
    // Parallel so'rovlar uchun: faqat birinchisi muvaffaqiyatli bo'ladi
    const { count } = await this.prisma.loginToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (count === 0) throw new UnauthorizedException("Havola allaqachon ishlatilgan");
    if (row.user.isBlocked || !STAFF_ROLES.includes(row.user.role)) throw new ForbiddenException("Ruxsat yo'q");

    const tokenJwt = await this.jwt.signAsync({ sub: row.user.id, role: row.user.role }, { expiresIn: this.env.ADMIN_JWT_TTL });
    return { token: tokenJwt, expiresIn: this.env.ADMIN_JWT_TTL, user: await this.users.me(row.user.id) };
  }

  // ---------------- Xodimlarni boshqarish (faqat TEACHER) ----------------

  async list() {
    const [staff, invites] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: { in: ["TEACHER", "ASSISTANT"] } },
        orderBy: [{ role: "desc" }, { createdAt: "asc" }],
        select: { id: true, firstName: true, lastName: true, username: true, role: true, createdAt: true },
      }),
      this.prisma.staffInvite.findMany({ orderBy: { createdAt: "asc" } }),
    ]);
    return {
      staff: staff.map((s) => ({ ...s, isOwner: this.isOwnerUsername(s.username) })),
      invites: invites.map((i) => ({ username: i.username, role: i.role, createdAt: i.createdAt })),
    };
  }

  /** Yordamchi qo'shadi: username bo'yicha. Foydalanuvchi hali botga kirmagan bo'lsa, taklif saqlanadi. */
  async addAssistant(actorId: string, rawUsername: string) {
    const username = normUsername(rawUsername);
    if (!/^[a-z0-9_]{4,32}$/.test(username)) throw new BadRequestException("Telegram username noto'g'ri");
    if (this.owners.has(username)) throw new BadRequestException("Bu foydalanuvchi allaqachon ega");

    const existing = await this.prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } } });
    if (existing) {
      if (existing.role === "TEACHER") throw new BadRequestException("Bu foydalanuvchi allaqachon ega");
      await this.prisma.user.update({ where: { id: existing.id }, data: { role: "ASSISTANT" } });
      await this.audit(actorId, "staff.add", existing.id, { username });
      return { status: "added" as const };
    }
    await this.prisma.staffInvite.upsert({
      where: { username },
      update: { role: "ASSISTANT", invitedById: actorId },
      create: { username, role: "ASSISTANT", invitedById: actorId },
    });
    await this.audit(actorId, "staff.invite", null, { username });
    return { status: "invited" as const };
  }

  async removeStaff(actorId: string, userId: string) {
    if (userId === actorId) throw new BadRequestException("O'zingizni o'chira olmaysiz");
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !STAFF_ROLES.includes(u.role as RoleName)) throw new NotFoundException("Xodim topilmadi");
    if (this.isOwnerUsername(u.username)) throw new ForbiddenException("Egani o'chirib bo'lmaydi");
    await this.prisma.user.update({ where: { id: userId }, data: { role: "STUDENT" } });
    await this.audit(actorId, "staff.remove", userId, { username: u.username });
    return { ok: true };
  }

  async removeInvite(actorId: string, username: string) {
    await this.prisma.staffInvite.deleteMany({ where: { username: normUsername(username) } });
    await this.audit(actorId, "staff.invite.remove", null, { username });
    return { ok: true };
  }

  private audit(actorId: string, action: string, entityId: string | null, meta: object) {
    return this.prisma.auditLog.create({ data: { actorId, action, entity: "User", entityId, meta } });
  }
}
