import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ESSAY_MAX_SCORE, NAME_MATCH_THRESHOLD, milliyTotal, nameMatchScore, parseEssayTable } from "@onatili/shared";
import { PrismaService } from "../prisma/prisma.service";
import { readXlsx } from "./xlsx-read";

/**
 * Offline Milliy sertifikat testining yozma ishi (esse): ustoz 24 ballik mezon bo'yicha kiritadi,
 * umumiy ball va daraja sertifikatdagidek qayta hisoblanadi: (test + esse75) / 2.
 * Skaner faylida esse yo'q, shuning uchun alohida saqlanadi va qayta importda o'chmaydi.
 */
@Injectable()
export class ExternalEssayService {
  constructor(private readonly prisma: PrismaService) {}

  /** items: natija id → 24 ballik baho (null: o'chirish). Bir yo'la (ro'yxatdan joylash) ham shu */
  async set(actorId: string, testId: string, items: { resultId: string; score: number | null }[]) {
    if (!items.length) return { updated: 0 };
    for (const it of items)
      if (it.score != null && (it.score < 0 || it.score > ESSAY_MAX_SCORE || Math.round(it.score * 2) !== it.score * 2))
        throw new BadRequestException(`Esse bali 0 dan ${ESSAY_MAX_SCORE} gacha, 0,5 qadam bilan`);
    const rows = await this.prisma.externalResult.findMany({ where: { testId, id: { in: items.map((i) => i.resultId) } }, select: { id: true, testScore: true } });
    if (rows.length !== new Set(items.map((i) => i.resultId)).size) throw new NotFoundException("Natija topilmadi");
    if (rows.some((r) => r.testScore == null)) throw new BadRequestException("Bu test Milliy sertifikat shkalasida emas: esse qo'shib bo'lmaydi");
    const test = new Map(rows.map((r) => [r.id, r.testScore!]));
    await this.prisma.$transaction(
      items.map((it) => {
        const f = milliyTotal(test.get(it.resultId)!, it.score);
        return this.prisma.externalResult.update({ where: { id: it.resultId }, data: { essayScore: it.score, scaledScore: f.scaledScore, grade: f.grade } });
      }),
    );
    await this.prisma.auditLog.create({ data: { actorId, action: "external.essay", entity: "ExternalTest", entityId: testId, meta: { count: items.length } } });
    return { updated: items.length };
  }

  /**
   * Esse fayli (Excel yoki CSV) → kimga qancha: saqlamaydi, faqat moslab qaytaradi. Ustoz oynada ko'rib,
   * kerak bo'lsa tuzatib saqlaydi. Moslash ism bo'yicha (tartib va tutuq belgisi farqi hisobga olinmaydi),
   * har fayl qatori bitta natijaga; platformadagi o'quvchi ismi ham tekshiriladi.
   */
  async fromFile(testId: string, d: { fileName: string; base64: string }) {
    const buf = Buffer.from(d.base64, "base64");
    let table: string[][];
    try {
      table = /\.xlsx$/i.test(d.fileName) ? readXlsx(buf) : csvRows(buf.toString("utf8"));
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : "Faylni o'qib bo'lmadi");
    }
    const parsed = parseEssayTable(table);
    if (!parsed.rows.length) throw new BadRequestException("Faylda ism va ball topilmadi: bir ustunda ism, bitta ustunda ball bo'lsin");
    const results = await this.prisma.externalResult.findMany({
      where: { testId },
      select: { id: true, name: true, student: { select: { user: { select: { firstName: true, lastName: true } } } } },
    });
    if (!results.length) throw new NotFoundException("Test topilmadi");
    // Eng ishonchli juftlar birinchi: har fayl qatori va har natija bir martadan
    const pairs: { r: number; f: number; s: number }[] = [];
    results.forEach((r, ri) => {
      const names = [r.name, r.student ? [r.student.user.firstName, r.student.user.lastName].filter(Boolean).join(" ") : ""].filter(Boolean);
      parsed.rows.forEach((f, fi) => {
        const s = Math.max(...names.map((n) => nameMatchScore(n, f.name)));
        if (s >= NAME_MATCH_THRESHOLD) pairs.push({ r: ri, f: fi, s });
      });
    });
    pairs.sort((a, b) => b.s - a.s);
    const usedR = new Set<number>();
    const usedF = new Set<number>();
    const items: { resultId: string; name: string; fileName: string; score24: number }[] = [];
    for (const p of pairs) {
      if (usedR.has(p.r) || usedF.has(p.f)) continue;
      usedR.add(p.r);
      usedF.add(p.f);
      items.push({ resultId: results[p.r].id, name: results[p.r].name, fileName: parsed.rows[p.f].name, score24: parsed.rows[p.f].score24 });
    }
    return {
      items,
      /** Fayldagi, lekin bu testda topilmagan ismlar (boshqa guruh yoki yozilishi farqli) */
      unmatched: parsed.rows.filter((_, i) => !usedF.has(i)).map((r) => r.name),
      /** Testdagi, lekin faylda bahosi topilmagan o'quvchilar soni */
      missing: results.length - items.length,
      bad: parsed.bad,
    };
  }
}

/** Oddiy CSV/TSV: ajratgich birinchi qatordan */
function csvRows(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const sep = (lines[0] ?? "").includes(";") ? ";" : (lines[0] ?? "").includes("\t") ? "\t" : ",";
  return lines.map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim()));
}
