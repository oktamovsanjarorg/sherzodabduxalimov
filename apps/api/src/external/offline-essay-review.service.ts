import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  GOLD_MIN,
  essayAgreement,
  type RubricSnapshot,
  rubricScore,
  wordChanges,
  type OfflineEssayAgreement,
  type OfflineEssayConfirmInput,
} from "@onatili/shared";
import type { Prisma } from "@onatili/db";
import { PrismaService } from "../prisma/prisma.service";
import { ExternalEssayService } from "./external-essay.service";
import { aiSnapshot, offlineAiView, type StoredReview } from "./offline-essay-runner";
import { OfflineEssayService } from "./offline-essay.service";

/**
 * Ustozning offline esse bahosi (12 band) va AI bilan solishtiruv. Ustoz bahosi — yakuniy ball;
 * bandlari, o'sha paytdagi AI bahosi va tuzatilgan matn AI'ni o'lchash uchun saqlanadi.
 */
@Injectable()
export class OfflineEssayReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scores: ExternalEssayService,
    private readonly offline: OfflineEssayService,
  ) {}

  async confirm(actorId: string, resultId: string, d: OfflineEssayConfirmInput) {
    const r = await this.prisma.externalResult.findUnique({
      where: { id: resultId },
      select: { id: true, testId: true, testScore: true, essay: { select: { id: true, status: true, ai: true, text: true } } },
    });
    if (!r) throw new NotFoundException("Natija topilmadi");
    if (r.testScore == null) throw new BadRequestException("Bu test Milliy sertifikat shkalasida emas: esse qo'shib bo'lmaydi");
    // Ball serverda bandlardan hisoblanadi (brauzer yuborgan jamiga ishonilmaydi)
    const rubric = rubricScore(
      d.special,
      Object.entries(d.scores).map(([key, score]) => ({ key, score })),
    );
    const ai = r.essay?.status === "CHECKED" ? aiSnapshot(offlineAiView(r.essay.ai)) : null;
    await this.scores.set(actorId, r.testId, [{ resultId, score: rubric.total }]);
    if (r.essay) {
      const review: StoredReview = {
        special: d.special,
        scores: d.special ? {} : Object.fromEntries(rubric.criteria.map((c) => [c.key, c.score])),
        total: rubric.total,
        ai,
      };
      // Tuzatilgan matn faqat AI o'qigan matn bo'lsa ma'noli (u bilan solishtiriladi)
      const transcript = r.essay.text && d.transcript?.trim() ? d.transcript : null;
      await this.prisma.externalEssay.update({
        where: { id: r.essay.id },
        data: { review: review as unknown as Prisma.InputJsonValue, reviewedById: actorId, reviewedAt: new Date(), transcript },
      });
    }
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: "external.essay.confirm",
        entity: "ExternalTest",
        entityId: r.testId,
        meta: { resultId, score: rubric.total, ai: ai?.total ?? null },
      },
    });
    return this.offline.detail(resultId);
  }

  /**
   * Ustoz baholagan barcha esselar (offline va botdagi): AI umumiy ball va bandlarda qanchalik adashadi,
   * qo'lyozmani qanchalik to'g'ri o'qiydi (faqat offline: ustoz matnni tuzatgan bo'lsa)
   */
  async agreement(): Promise<OfflineEssayAgreement> {
    const rows = await this.prisma.externalEssay.findMany({
      where: { reviewedAt: { not: null } },
      select: { review: true, text: true, transcript: true },
    });
    const pairs: { ai: RubricSnapshot; teacher: RubricSnapshot }[] = rows.flatMap((e) => {
      const r = e.review as StoredReview | null;
      return r?.ai ? [{ ai: r.ai, teacher: r }] : [];
    });
    pairs.push(...(await this.botPairs()));
    const transcripts = { count: 0, words: 0, errors: 0 };
    for (const e of rows) {
      if (!e.text || !e.transcript) continue;
      const w = wordChanges(e.text, e.transcript);
      transcripts.count++;
      transcripts.words += w.words;
      transcripts.errors += w.errors;
    }
    return { ...essayAgreement(pairs), min: GOLD_MIN, transcripts };
  }

  /** Botdagi esselar: AI bahosi ham, ustoz bahosi ham bor */
  private async botPairs(): Promise<{ ai: RubricSnapshot; teacher: RubricSnapshot }[]> {
    const essays = await this.prisma.essay.findMany({
      where: { AND: [{ reviews: { some: { source: "AI" } } }, { reviews: { some: { source: "TEACHER" } } }] },
      select: { reviews: { select: { source: true, special: true, criteria: true, totalScore: true } } },
    });
    const snap = (r: { special: string | null; criteria: unknown; totalScore: number }): RubricSnapshot => ({
      special: r.special,
      scores: Object.fromEntries(((r.criteria ?? []) as { key: string; score: number }[]).map((c) => [c.key, c.score])),
      total: r.totalScore,
    });
    return essays.flatMap((e) => {
      const ai = e.reviews.find((r) => r.source === "AI");
      const teacher = e.reviews.find((r) => r.source === "TEACHER");
      return ai && teacher ? [{ ai: snap(ai), teacher: snap(teacher) }] : [];
    });
  }
}
