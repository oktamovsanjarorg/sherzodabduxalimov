import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@onatili/db";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

export const TRASH_DAYS = 30;
export type TrashKind = "STUDENT" | "LESSON" | "QUESTION" | "TEST" | "TOPIC" | "COURSE" | "GROUP" | "PASSAGE";
/** Prisma modeli -> jadval nomi (Prisma jadvallarni model nomi bilan yaratadi) */
const TABLE: Record<TrashKind, string> = {
  STUDENT: "User",
  LESSON: "Lesson",
  QUESTION: "Question",
  TEST: "Test",
  TOPIC: "Topic",
  COURSE: "Course",
  GROUP: "Group",
  PASSAGE: "Passage",
};

type Tx = Prisma.TransactionClient | PrismaClient;
type Row = Record<string, unknown>;
interface Fk {
  child: string;
  childCol: string;
  parent: string;
  parentCol: string;
  /** c = CASCADE, n = SET NULL, boshqasi — o'chirishga to'sqinlik qiladi */
  onDelete: string;
}
interface Snapshot {
  payload: Record<string, Row[]>;
  setNull: { table: string; pk: Row; col: string; value: unknown }[];
  rows: number;
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

/**
 * Korzinka. O'chirishdan oldin yozuv va Postgres'dagi ON DELETE CASCADE bo'yicha u bilan birga o'chadigan
 * barcha qatorlar (o'quvchi: urinishlar, javoblar, esselar, to'lovlar, davomat...) JSON sifatida saqlanadi.
 * Tiklashda jadvallar bog'liqlik tartibida (avval ota, keyin bola) aynan o'sha id'lar bilan qaytariladi.
 * Bog'liqliklar bazaning o'zidan o'qiladi: sxemaga yangi jadval qo'shilsa ham qo'lda yozish shart emas.
 */
@Injectable()
export class TrashService {
  private meta: Promise<{ fks: Fk[]; pks: Map<string, string[]> }> | null = null;
  private readonly mediaRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    this.mediaRoot = resolve(env.MEDIA_DIR);
  }

  /** Yozuvni korzinkaga olib, o'chiradi (bitta tranzaksiyada) */
  async remove(opts: { kind: TrashKind; id: string; title: string; actorId: string | null; videoIds?: string[] }) {
    const table = TABLE[opts.kind];
    const actor = opts.actorId ? await this.prisma.user.findUnique({ where: { id: opts.actorId }, select: { firstName: true, lastName: true } }) : null;
    const actorName = actor ? [actor.firstName, actor.lastName].filter(Boolean).join(" ") : null;
    return this.prisma.$transaction(
      async (tx) => {
        const snap = await this.capture(tx, table, opts.id);
        if (!snap.rows) throw new NotFoundException("Topilmadi");
        await tx.$executeRawUnsafe(`DELETE FROM ${q(table)} WHERE "id" = $1`, opts.id);
        const item = await tx.trashItem.create({
          data: {
            kind: opts.kind,
            entityId: opts.id,
            title: opts.title,
            payload: snap.payload as Prisma.InputJsonValue,
            setNull: snap.setNull as Prisma.InputJsonValue,
            files: filesOf(snap.payload),
            videoIds: opts.videoIds ?? [],
            rows: snap.rows,
            deletedById: opts.actorId,
            deletedBy: actorName,
            purgeAt: new Date(Date.now() + TRASH_DAYS * 86_400_000),
          },
        });
        return { trashId: item.id, rows: snap.rows };
      },
      { timeout: 60_000 },
    );
  }

  async list() {
    const items = await this.prisma.trashItem.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, kind: true, title: true, rows: true, deletedBy: true, createdAt: true, purgeAt: true },
    });
    return items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString(), purgeAt: i.purgeAt.toISOString() }));
  }

  /** Aynan joyiga tiklaydi. To'qnashuv bo'lsa (masalan, o'quvchi botga qayta kirib yangi hisob ochgan) — tushunarli xato */
  async restore(id: string) {
    const item = await this.prisma.trashItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException("Korzinkada topilmadi");
    const payload = item.payload as Record<string, Row[]>;
    const setNull = item.setNull as Snapshot["setNull"];
    const { fks, pks } = await this.loadMeta();
    const order = topoOrder(Object.keys(payload), fks);
    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (const t of order) {
            const rows = payload[t];
            if (!rows?.length) continue;
            await tx.$executeRawUnsafe(`INSERT INTO ${q(t)} SELECT * FROM jsonb_populate_recordset(NULL::${q(t)}, $1::jsonb)`, JSON.stringify(rows));
          }
          for (const s of setNull) {
            const cols = pks.get(s.table) ?? ["id"];
            const where = cols.map((c, i) => `${q(c)}::text = $${i + 2}`).join(" AND ");
            await tx.$executeRawUnsafe(
              `UPDATE ${q(s.table)} SET ${q(s.col)} = $1 WHERE ${where} AND ${q(s.col)} IS NULL`,
              s.value,
              ...cols.map((c) => String(s.pk[c])),
            );
          }
          await tx.trashItem.delete({ where: { id } });
        },
        { timeout: 60_000 },
      );
    } catch (e) {
      const code = (e as { code?: string; meta?: { code?: string } }).meta?.code ?? (e as { code?: string }).code;
      const msg = String((e as Error).message ?? "");
      if (code === "23505" || /23505|unique/i.test(msg))
        throw new ConflictException(
          item.kind === "STUDENT"
            ? "Tiklab bo'lmadi: bu o'quvchi botga qayta kirib, yangi hisob ochgan. Avval yangi hisobni o'chiring, keyin tiklang."
            : "Tiklab bo'lmadi: xuddi shunday yozuv allaqachon mavjud.",
        );
      if (code === "23503" || /23503|foreign key/i.test(msg))
        throw new ConflictException("Tiklab bo'lmadi: unga bog'liq ma'lumot (masalan, test, guruh yoki mavzu) o'chib ketgan. Avval o'shani tiklang.");
      throw e;
    }
    return { ok: true, kind: item.kind, entityId: item.entityId };
  }

  /** Butunlay o'chirish: korzinkadan va diskdan (fayllar, dars videosi) */
  async purge(id: string) {
    const item = await this.prisma.trashItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException("Korzinkada topilmadi");
    await this.prisma.trashItem.delete({ where: { id } });
    await purgeFiles(this.prisma, this.mediaRoot, item);
    return { ok: true };
  }

  // ---------------- ichki ----------------

  private loadMeta() {
    this.meta ??= (async () => {
      const fks = await this.prisma.$queryRawUnsafe<Fk[]>(`
        SELECT cl.relname AS child, att.attname AS "childCol", pcl.relname AS parent, patt.attname AS "parentCol", con.confdeltype::text AS "onDelete"
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_class pcl ON pcl.oid = con.confrelid
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
        JOIN pg_attribute patt ON patt.attrelid = con.confrelid AND patt.attnum = con.confkey[1]
        WHERE con.contype = 'f' AND array_length(con.conkey, 1) = 1 AND cl.relnamespace = 'public'::regnamespace`);
      const pkRows = await this.prisma.$queryRawUnsafe<{ table: string; col: string }[]>(`
        SELECT cl.relname AS "table", a.attname AS col
        FROM pg_index i JOIN pg_class cl ON cl.oid = i.indrelid
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indisprimary AND cl.relnamespace = 'public'::regnamespace
        ORDER BY cl.relname, array_position(i.indkey, a.attnum)`);
      const pks = new Map<string, string[]>();
      for (const r of pkRows) pks.set(r.table, [...(pks.get(r.table) ?? []), r.col]);
      return { fks, pks };
    })();
    return this.meta;
  }

  /** Ildiz qator va kaskad bo'yicha o'chadigan barcha qatorlar */
  private async capture(tx: Tx, rootTable: string, rootId: string): Promise<Snapshot> {
    const { fks, pks } = await this.loadMeta();
    const payload: Record<string, Row[]> = {};
    const seen = new Map<string, Set<string>>();
    const key = (t: string, r: Row) => (pks.get(t) ?? ["id"]).map((c) => String(r[c])).join("|");
    const add = (t: string, rows: Row[]) => {
      const s = seen.get(t) ?? new Set<string>();
      seen.set(t, s);
      const fresh = rows.filter((r) => !s.has(key(t, r)));
      fresh.forEach((r) => s.add(key(t, r)));
      if (fresh.length) payload[t] = [...(payload[t] ?? []), ...fresh];
      return fresh;
    };
    const select = (t: string, col: string, values: string[]) =>
      tx.$queryRawUnsafe<{ r: Row }[]>(`SELECT to_jsonb(x) AS r FROM ${q(t)} x WHERE x.${q(col)}::text = ANY($1::text[])`, values).then((rs) => rs.map((x) => x.r));

    const queue: { table: string; rows: Row[] }[] = [{ table: rootTable, rows: add(rootTable, await select(rootTable, "id", [rootId])) }];
    const nulls: Snapshot["setNull"] = [];
    while (queue.length) {
      const { table, rows } = queue.shift()!;
      if (!rows.length) continue;
      for (const fk of fks.filter((f) => f.parent === table)) {
        const values = [...new Set(rows.map((r) => r[fk.parentCol]).filter((v) => v !== null && v !== undefined).map(String))];
        if (!values.length) continue;
        const children = await select(fk.child, fk.childCol, values);
        if (fk.onDelete === "c") {
          const fresh = add(fk.child, children);
          if (fresh.length) queue.push({ table: fk.child, rows: fresh });
        } else if (fk.onDelete === "n") {
          const cols = pks.get(fk.child) ?? ["id"];
          for (const c of children) nulls.push({ table: fk.child, pk: Object.fromEntries(cols.map((k) => [k, c[k]])), col: fk.childCol, value: c[fk.childCol] });
        }
      }
    }
    // Korzinkadagi qatorlarning o'ziga tegishli SET NULL'lar kerak emas (ular to'liq tiklanadi)
    const setNull = nulls.filter((n) => !seen.get(n.table)?.has((pks.get(n.table) ?? ["id"]).map((c) => String(n.pk[c])).join("|")));
    return { payload, setNull, rows: Object.values(payload).reduce((s, r) => s + r.length, 0) };
  }
}

/** Jadvallarni bog'liqlik tartibida: ota jadval bolasidan oldin */
function topoOrder(tables: string[], fks: Fk[]) {
  const set = new Set(tables);
  const deps = new Map(tables.map((t) => [t, new Set(fks.filter((f) => f.child === t && set.has(f.parent) && f.parent !== t).map((f) => f.parent))]));
  const out: string[] = [];
  const visit = (t: string, stack = new Set<string>()) => {
    if (out.includes(t) || stack.has(t)) return;
    stack.add(t);
    deps.get(t)?.forEach((d) => visit(d, stack));
    out.push(t);
  };
  tables.forEach((t) => visit(t));
  return out;
}

/** Diskdagi fayllar: esse rasmlari, to'lov cheklari, ovozli izohlar */
function filesOf(payload: Record<string, Row[]>) {
  const files: string[] = [];
  for (const e of payload.Essay ?? []) files.push(...((e.imageUrls as string[] | null) ?? []));
  for (const p of payload.Payment ?? []) if (p.receiptUrl) files.push(String(p.receiptUrl));
  for (const v of payload.VoiceNote ?? []) for (const k of ["originalPath", "oggPath", "m4aPath"]) if (v[k]) files.push(String(v[k]));
  return files;
}

/** Faqat MEDIA_DIR ichidagi fayllar o'chiriladi; dars videosi — boshqa darsga ulanmagan bo'lsa */
export async function purgeFiles(prisma: Pick<PrismaClient, "video" | "lesson">, mediaRoot: string, item: { files: string[]; videoIds: string[] }) {
  const inside = (rel: string) => {
    const p = resolve(join(mediaRoot, rel));
    return p.startsWith(mediaRoot + "/") ? p : null;
  };
  for (const f of item.files) {
    const p = inside(f);
    if (p) await rm(p, { force: true }).catch(() => {});
  }
  for (const v of item.videoIds) {
    if (await prisma.lesson.count({ where: { videoId: v } })) continue;
    await prisma.video.deleteMany({ where: { id: v } });
    const p = inside(`videos/${v}`);
    if (p) await rm(p, { recursive: true, force: true }).catch(() => {});
  }
}

/** Worker (har soat): 30 kundan oshganlarini fayllari bilan butunlay o'chiradi */
export async function purgeExpiredTrash(prisma: PrismaClient, mediaDir: string) {
  const root = resolve(mediaDir);
  const items = await prisma.trashItem.findMany({ where: { purgeAt: { lt: new Date() } }, select: { id: true, files: true, videoIds: true }, take: 50 });
  for (const it of items) {
    await prisma.trashItem.delete({ where: { id: it.id } });
    await purgeFiles(prisma, root, it);
  }
  return items.length;
}
