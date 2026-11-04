import { Injectable, Logger } from "@nestjs/common";
import { RASCH_MIN_SAMPLE, STAFF_ROLES, calibrate } from "@onatili/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Milliy sertifikat testlari uchun Rasch kalibrlash: savol qiyinliklari (b) va qobiliyatlar taqsimoti (μ, σ)
 * shu testni topshirgan barcha o'quvchilarning javoblaridan hisoblanadi (har o'quvchidan oxirgi urinish).
 * Yangi natija kelganda bir necha soniyadan keyin qayta hisoblanadi.
 */
@Injectable()
export class RaschService {
  private readonly log = new Logger("Rasch");
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly prisma: PrismaService) {}

  /** Bir nechta natija ketma-ket kelsa, bitta hisoblash (5 soniyadan keyin) */
  calibrateSoon(testId: string) {
    if (this.timers.has(testId)) return;
    this.timers.set(
      testId,
      setTimeout(() => {
        this.timers.delete(testId);
        void this.calibrateTest(testId).catch((e) => this.log.error(`${testId}: ${e instanceof Error ? e.message : e}`));
      }, 5000).unref(),
    );
  }

  async calibrateTest(testId: string) {
    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      select: { gradingScale: true, questions: { orderBy: { order: "asc" }, select: { questionId: true, question: { select: { type: true } } } } },
    });
    if (!test || test.gradingScale !== "MILLIY_SERTIFIKAT") return null;
    const items = test.questions.filter((q) => q.question.type !== "ESSAY").map((q) => q.questionId);
    if (!items.length) return null;

    // Har o'quvchidan oxirgi yakunlangan urinish; xodimlarning sinovlari hisobga olinmaydi
    const attempts = await this.prisma.attempt.findMany({
      where: { testId, status: { in: ["SUBMITTED", "EXPIRED"] }, user: { role: { notIn: [...STAFF_ROLES] } } },
      orderBy: { finishedAt: "desc" },
      select: { userId: true, answers: { select: { questionId: true, isCorrect: true } } },
    });
    const seen = new Set<string>();
    const matrix: (0 | 1)[][] = [];
    for (const a of attempts) {
      if (seen.has(a.userId)) continue;
      seen.add(a.userId);
      const ok = new Set(a.answers.filter((x) => x.isCorrect).map((x) => x.questionId));
      matrix.push(items.map((id) => (ok.has(id) ? 1 : 0)));
    }

    const n = matrix.length;
    if (n < RASCH_MIN_SAMPLE) {
      // Yetarli ma'lumot yo'q: barcha savollar teng qiyin (b = 0), μ = 0, σ = 1 — dastlabki baho
      await this.prisma.$transaction([
        this.prisma.testQuestion.updateMany({ where: { testId }, data: { raschB: null } }),
        this.prisma.test.update({ where: { id: testId }, data: { raschMu: null, raschSigma: null, raschN: n, raschAt: new Date() } }),
      ]);
      return { n, calibrated: false };
    }
    const c = calibrate(matrix);
    await this.prisma.$transaction([
      ...items.map((questionId, i) => this.prisma.testQuestion.update({ where: { testId_questionId: { testId, questionId } }, data: { raschB: c.b[i] } })),
      this.prisma.test.update({ where: { id: testId }, data: { raschMu: c.mu, raschSigma: c.sigma, raschN: n, raschAt: new Date() } }),
    ]);
    this.log.log(`${testId}: ${n} ta natijadan kalibrlandi (μ=${c.mu.toFixed(2)}, σ=${c.sigma.toFixed(2)})`);
    return { n, calibrated: true, mu: c.mu, sigma: c.sigma };
  }
}
