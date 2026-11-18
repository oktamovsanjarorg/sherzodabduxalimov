import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ESSAY_MAX_SCORE, milliyTotal } from "@onatili/shared";
import { PrismaService } from "../prisma/prisma.service";

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
}
