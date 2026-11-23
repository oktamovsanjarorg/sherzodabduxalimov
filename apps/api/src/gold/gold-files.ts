import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { sniffImage } from "../billing/billing.service";

export const GOLD_MAX_PAGES = 6;
const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

/** Sinov to'plami rasmlari: MEDIA_DIR/gold/<id>/. Asl esse o'chirilsa ham nusxa saqlanadi */
export class GoldFiles {
  readonly root: string;
  constructor(mediaDir: string) {
    this.root = resolve(mediaDir);
  }

  /** Faqat media papka ichidagi yo'l (../ bilan chiqib bo'lmaydi) */
  abs(rel: string, prefix: "gold" | "essays" = "gold") {
    const p = resolve(join(this.root, rel));
    if (!p.startsWith(join(this.root, prefix) + "/")) throw new Error("bad gold path");
    return p;
  }

  async save(id: string, body: Buffer): Promise<string | null> {
    const ext = sniffImage(body);
    if (!ext) return null;
    const rel = `gold/${id}/${Date.now()}.${ext}`;
    await mkdir(dirname(this.abs(rel)), { recursive: true });
    await writeFile(this.abs(rel), body);
    return rel;
  }

  /** Botdagi esse varoqlarini nusxalaydi */
  async copyFromEssay(id: string, essayRels: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const [i, src] of essayRels.entries()) {
      const rel = `gold/${id}/${Date.now()}-${i}${extname(src) || ".jpg"}`;
      await mkdir(dirname(this.abs(rel)), { recursive: true });
      await copyFile(this.abs(src, "essays"), this.abs(rel));
      out.push(rel);
    }
    return out;
  }

  async read(rel: string): Promise<{ mime: string; data: Buffer } | null> {
    const data = await readFile(this.abs(rel)).catch(() => null);
    return data ? { mime: MIME[sniffImage(data) ?? "jpg"], data } : null;
  }

  remove(rel: string) {
    return rm(this.abs(rel), { force: true });
  }

  removeAll(id: string) {
    return rm(join(this.root, "gold", id), { recursive: true, force: true });
  }
}
