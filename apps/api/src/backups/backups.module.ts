import { Controller, Get, Inject, Injectable, Module, NotFoundException, Param, Res } from "@nestjs/common";
import { BACKUP_NAME_RE, type BackupList } from "@onatili/shared";
import type { FastifyReply } from "fastify";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

/** "db-20261115-220001.dump" -> 2026-11-15T22:00:01Z (server soati UTC) */
function stampOf(name: string): Date | null {
  const m = /-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\./.exec(name);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}

/**
 * Kechalik zaxira nusxalari (serverdagi ~/onatili-backups, scripts/backup.sh yozadi).
 * API ularni faqat o'qiydi: BACKUP_DIR ga read-only ulangan papka. O'rnatilmagan bo'lsa bo'lim o'chiq.
 */
@Injectable()
export class BackupsService {
  constructor(@Inject(ENV) private readonly env: Env, private readonly prisma: PrismaService) {}

  async list(): Promise<BackupList> {
    const dir = this.env.BACKUP_DIR;
    if (!dir) return { enabled: false, files: [] };
    const names = (await readdir(dir).catch(() => null)) ?? null;
    if (!names) return { enabled: false, files: [] };
    const files = await Promise.all(
      names
        .filter((n) => BACKUP_NAME_RE.test(n))
        .map(async (name) => {
          const s = await stat(join(dir, name)).catch(() => null);
          if (!s?.isFile()) return null;
          return {
            name,
            kind: name.startsWith("db-") ? ("db" as const) : ("media" as const),
            sizeBytes: s.size,
            createdAt: (stampOf(name) ?? s.mtime).toISOString(),
          };
        }),
    );
    return { enabled: true, files: files.filter((f) => f !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.kind.localeCompare(b.kind)) };
  }

  async open(actorId: string, name: string) {
    const dir = this.env.BACKUP_DIR;
    // Faqat zaxira nomi qolipidagi fayl: yo'l (../) va boshqa fayllar umuman o'tmaydi
    if (!dir || !BACKUP_NAME_RE.test(name)) throw new NotFoundException("Zaxira topilmadi");
    const path = join(dir, name);
    const s = await stat(path).catch(() => null);
    if (!s?.isFile()) throw new NotFoundException("Zaxira topilmadi");
    // Bazada barcha o'quvchilarning shaxsiy ma'lumoti bor: kim qachon yuklab olgani yoziladi
    await this.prisma.auditLog.create({ data: { actorId, action: "backup.download", entity: "Backup", entityId: name, meta: { bytes: s.size } } });
    return { stream: createReadStream(path), size: s.size };
  }
}

/** Zaxira nusxalarini yuklab olish: faqat ega */
@Roles("TEACHER")
@Controller("admin/backups")
export class BackupsController {
  constructor(private readonly svc: BackupsService) {}

  @Get() list() {
    return this.svc.list();
  }

  @Get(":name") async download(@CurrentUser() u: JwtUser, @Param("name") name: string, @Res() res: FastifyReply) {
    const { stream, size } = await this.svc.open(u.sub, name);
    return res
      .header("Content-Type", "application/octet-stream")
      .header("Content-Length", String(size))
      .header("Content-Disposition", `attachment; filename="${name}"`)
      .header("Cache-Control", "private, no-store")
      .send(stream);
  }
}

@Module({ controllers: [BackupsController], providers: [BackupsService] })
export class BackupsModule {}
