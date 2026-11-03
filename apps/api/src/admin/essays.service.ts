import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { milliyLevel, type AdminEssay } from "@onatili/shared";
import { NotifyService } from "../notify/notify.service";
import { esc } from "../notify/telegram";
import { PrismaService } from "../prisma/prisma.service";

const round1 = (x: number) => Math.round(x * 10) / 10;
const words = (t: string) => (t.trim().match(/\S+/g) ?? []).length;
const fullName = (u: { firstName: string; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ");

/** Esse tekshirish: ustoz ball va izoh qo'yadi, urinishning umumiy bali qayta hisoblanadi */
@Injectable()
export class EssaysService {
  constructor(private readonly prisma: PrismaService, private readonly notify: NotifyService) {}

  async list(status: "pending" | "reviewed"): Promise<AdminEssay[]> {
    const rows = await this.prisma.attemptAnswer.findMany({
      where: {
        question: { type: "ESSAY" },
        attempt: { status: { in: ["SUBMITTED", "EXPIRED"] } },
        textAnswer: { not: null },
        ...(status === "pending" ? { points: null } : { points: { not: null }, reviewedAt: { not: null } }),
      },
      include: {
        question: { select: { text: true, tests: { select: { testId: true, points: true } } } },
        attempt: { select: { testId: true, finishedAt: true, test: { select: { title: true } }, user: { select: { firstName: true, lastName: true, username: true } } } },
      },
      orderBy: status === "pending" ? { answeredAt: "asc" } : { reviewedAt: "desc" },
      take: 200,
    });
    return rows
      .filter((r) => r.textAnswer?.trim())
      .map((r) => ({
        attemptId: r.attemptId,
        questionId: r.questionId,
        student: { name: fullName(r.attempt.user), username: r.attempt.user.username },
        testTitle: r.attempt.test.title,
        prompt: r.question.text,
        text: r.textAnswer!,
        words: words(r.textAnswer!),
        maxPoints: r.question.tests.find((t) => t.testId === r.attempt.testId)?.points ?? 0,
        points: r.points,
        reviewComment: r.reviewComment,
        submittedAt: (r.attempt.finishedAt ?? r.answeredAt).toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
      }));
  }

  async review(actorId: string, attemptId: string, questionId: string, points: number, comment: string | null) {
    const ans = await this.prisma.attemptAnswer.findUnique({
      where: { attemptId_questionId: { attemptId, questionId } },
      include: {
        question: { select: { type: true } },
        attempt: { include: { test: { select: { title: true, gradingScale: true } }, user: { select: { telegramId: true } } } },
      },
    });
    if (!ans || ans.question.type !== "ESSAY") throw new NotFoundException("Esse topilmadi");
    if (ans.attempt.status === "IN_PROGRESS") throw new ConflictException("Test hali yakunlanmagan");
    const tq = await this.prisma.testQuestion.findUnique({ where: { testId_questionId: { testId: ans.attempt.testId, questionId } } });
    const max = tq?.points ?? 0;
    const p = round1(Math.min(max, Math.max(0, points)));

    const score = await this.prisma.$transaction(async (tx) => {
      await tx.attemptAnswer.update({
        where: { attemptId_questionId: { attemptId, questionId } },
        data: { points: p, isCorrect: p > 0, reviewComment: comment?.trim() || null, reviewedById: actorId, reviewedAt: new Date() },
      });
      const all = await tx.attemptAnswer.findMany({ where: { attemptId }, select: { points: true } });
      const total = round1(all.reduce((s, a) => s + (a.points ?? 0), 0));
      await tx.attempt.update({ where: { id: attemptId }, data: { score: total } });
      return total;
    });
    await this.prisma.auditLog.create({ data: { actorId, action: "essay.review", entity: "AttemptAnswer", entityId: `${attemptId}:${questionId}`, meta: { points: p } } });

    const level = ans.attempt.test.gradingScale === "MILLIY_SERTIFIKAT" ? ` · ${milliyLevel(score).label}` : "";
    await this.notify.send(
      ans.attempt.user.telegramId,
      `📝 <b>${esc(ans.attempt.test.title)}</b>: esse tekshirildi.\nEsse: ${p} / ${max} ball\nUmumiy natija: <b>${score}</b> / ${round1(ans.attempt.maxScore ?? 0)} ball${level}${
        comment?.trim() ? `\n\nUstoz izohi: ${esc(comment.trim())}` : ""
      }`,
    );
    return { points: p, score };
  }
}
