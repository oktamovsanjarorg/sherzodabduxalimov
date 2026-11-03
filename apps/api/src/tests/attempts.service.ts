import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@onatili/db";
import {
  ERROR_CODES,
  milliyLevel,
  type AttemptQuestion,
  type AttemptResult,
  type AttemptState,
  type SaveAnswerBody,
  type TestSummary,
} from "@onatili/shared";
import { AccessService } from "../access/access.service";
import type { JwtUser } from "../auth/decorators";
import { ContentService } from "../content/content.service";
import { ParentsService } from "../parents/parents.service";
import { PrismaService } from "../prisma/prisma.service";
import { DEADLINE_GRACE_MS, isAnswerCorrect, isPastDeadline, seededShuffle } from "./grading";

const SUPPORTED = ["SINGLE", "MULTIPLE", "TEXT", "ESSAY"] as const;
/** 1,1 + 1,7 kabi kasr ballar yig'indisidagi suzuvchi nuqta xatosini yo'qotish */
const round1 = (x: number) => Math.round(x * 10) / 10;
type SupportedType = (typeof SUPPORTED)[number];

const testWithQuestions = {
  questions: {
    orderBy: { order: "asc" },
    include: { question: { include: { options: { orderBy: { order: "asc" } }, passage: true } } },
  },
} satisfies Prisma.TestInclude;

type TestFull = Prisma.TestGetPayload<{ include: typeof testWithQuestions }>;
type AttemptFull = Prisma.AttemptGetPayload<{ include: { test: { include: typeof testWithQuestions }; answers: true } }>;

@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly content: ContentService,
    private readonly parents: ParentsService,
  ) {}

  async listMocks(user: JwtUser): Promise<TestSummary[]> {
    await this.parents.assertStudentLinked(user.sub, user.role);
    const tests = await this.prisma.test.findMany({
      where: { isPublished: true, type: "MOCK" },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, type: true, isFree: true, timeLimitSec: true, _count: { select: { questions: true } } },
    });
    return this.content.buildTestSummaries(user.sub, tests, await this.access.canAccessPaid(user));
  }

  /** Testni boshlaydi. Tugallanmagan urinish bo'lsa, o'shani davom ettiradi. */
  async start(user: JwtUser, testId: string): Promise<AttemptState> {
    await this.parents.assertStudentLinked(user.sub, user.role);
    const test = await this.prisma.test.findFirst({ where: { id: testId, isPublished: true } });
    if (!test) throw new NotFoundException("Test topilmadi");
    this.access.assertAccess(test.isFree, await this.access.canAccessPaid(user));

    const open = await this.prisma.attempt.findFirst({
      where: { userId: user.sub, testId, status: "IN_PROGRESS" },
      select: { id: true },
    });
    if (open) {
      const a = await this.load(user, open.id);
      if (!(await this.expireIfNeeded(a))) return this.toState(a);
    }

    const now = new Date();
    const created = await this.prisma.attempt.create({
      data: {
        userId: user.sub,
        testId,
        startedAt: now,
        deadlineAt: test.timeLimitSec ? new Date(now.getTime() + test.timeLimitSec * 1000) : null,
      },
    });
    return this.toState(await this.load(user, created.id));
  }

  async get(user: JwtUser, attemptId: string): Promise<AttemptState | AttemptResult> {
    let a = await this.load(user, attemptId);
    if (a.status === "IN_PROGRESS" && (await this.expireIfNeeded(a))) a = await this.load(user, attemptId);
    return a.status === "IN_PROGRESS" ? this.toState(a) : this.toResult(a);
  }

  async saveAnswer(user: JwtUser, attemptId: string, questionId: string, body: SaveAnswerBody) {
    const a = await this.load(user, attemptId);
    if (a.status !== "IN_PROGRESS") throw this.closed();
    if (isPastDeadline(a.deadlineAt, new Date(), DEADLINE_GRACE_MS)) {
      await this.finalize(a, "EXPIRED");
      throw this.closed();
    }

    const q = this.questions(a.test).find((x) => x.id === questionId);
    if (!q) throw new BadRequestException("Savol bu testga tegishli emas");
    const validIds = new Set(q.options.map((o) => o.id));
    const optionIds = [...new Set(body.optionIds)];
    if (optionIds.some((id) => !validIds.has(id))) throw new BadRequestException("Noto'g'ri variant");
    if (q.type === "SINGLE" && optionIds.length > 1) throw new BadRequestException("Faqat bitta variant tanlanadi");

    const isText = q.type === "TEXT" || q.type === "ESSAY";
    const text = isText ? body.textAnswer?.trim() || null : null;
    if (q.type === "TEXT" && text && text.length > 500) throw new BadRequestException("Javob juda uzun");
    const data = {
      optionIds: isText ? [] : optionIds,
      textAnswer: text,
      answeredAt: new Date(),
    };
    await this.prisma.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      update: data,
      create: { attemptId, questionId, ...data },
    });
    return { ok: true };
  }

  async submit(user: JwtUser, attemptId: string): Promise<AttemptResult> {
    const a = await this.load(user, attemptId);
    if (a.status === "IN_PROGRESS") {
      const late = isPastDeadline(a.deadlineAt, new Date(), DEADLINE_GRACE_MS);
      await this.finalize(a, late ? "EXPIRED" : "SUBMITTED");
    }
    return this.toResult(await this.load(user, attemptId));
  }

  // ------------------------------------------------------------------

  private closed() {
    return new ConflictException({ code: ERROR_CODES.ATTEMPT_CLOSED, message: "Test yakunlangan" });
  }

  private async load(user: JwtUser, attemptId: string): Promise<AttemptFull> {
    const a = await this.prisma.attempt.findFirst({
      where: { id: attemptId, userId: user.sub }, // boshqaning urinishi: 404
      include: { test: { include: testWithQuestions }, answers: true },
    });
    if (!a) throw new NotFoundException("Urinish topilmadi");
    return a;
  }

  /** Testdagi savollar, urinishga xos (deterministik) tartibda. MATCHING hozircha chiqarilmaydi. */
  private questions(test: TestFull, attemptId?: string) {
    const list = test.questions
      .filter((tq) => (SUPPORTED as readonly string[]).includes(tq.question.type))
      .map((tq) => ({ ...tq.question, type: tq.question.type as SupportedType, points: tq.points }));
    if (!attemptId || !test.shuffle) return list;
    return seededShuffle(list, attemptId).map((q) => ({
      ...q,
      options: seededShuffle(q.options, attemptId + q.id),
    }));
  }

  private async expireIfNeeded(a: AttemptFull): Promise<boolean> {
    if (a.status !== "IN_PROGRESS" || !isPastDeadline(a.deadlineAt, new Date(), DEADLINE_GRACE_MS)) return false;
    await this.finalize(a, "EXPIRED");
    return true;
  }

  /** Baholaydi va yakunlaydi. Faqat IN_PROGRESS holatdagi urinish yangilanadi, shuning uchun parallel submit xavfsiz. */
  private async finalize(a: AttemptFull, status: "SUBMITTED" | "EXPIRED") {
    const answers = new Map(a.answers.map((x) => [x.questionId, x]));
    const graded = this.questions(a.test).map((q) => {
      const given = answers.get(q.id);
      // Yozilgan esse ustoz baholaguncha "kutilmoqda" (null); bo'sh esse darhol 0
      if (q.type === "ESSAY") {
        const pending = Boolean(given?.textAnswer?.trim());
        return { q, given, ok: null, points: pending ? null : 0 };
      }
      const ok = isAnswerCorrect(q, given);
      return { q, given, ok, points: ok ? q.points : 0 };
    });
    const score = round1(graded.reduce((s, g) => s + (g.points ?? 0), 0));
    const maxScore = round1(graded.reduce((s, g) => s + g.q.points, 0));

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.attempt.updateMany({
        where: { id: a.id, status: "IN_PROGRESS" },
        data: { status, score, maxScore, finishedAt: new Date() },
      });
      if (count === 0) return; // boshqa so'rov allaqachon yakunlagan
      for (const g of graded) {
        if (!g.given) continue;
        await tx.attemptAnswer.update({
          where: { attemptId_questionId: { attemptId: a.id, questionId: g.q.id } },
          data: { isCorrect: g.ok, points: g.points },
        });
      }
    });
  }

  private toState(a: AttemptFull): AttemptState {
    const questions: AttemptQuestion[] = this.questions(a.test, a.id).map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      imageUrl: q.imageUrl,
      passage: q.passage ? { id: q.passage.id, title: q.passage.title, body: q.passage.body } : null,
      points: q.points,
      options: q.options.map((o) => ({ id: o.id, text: o.text })), // isCorrect yo'q
    }));
    return {
      id: a.id,
      testId: a.testId,
      testTitle: a.test.title,
      testType: a.test.type,
      status: "IN_PROGRESS",
      startedAt: a.startedAt.toISOString(),
      deadlineAt: a.deadlineAt?.toISOString() ?? null,
      serverNow: new Date().toISOString(),
      questions,
      answers: a.answers.map((x) => ({ questionId: x.questionId, optionIds: x.optionIds, textAnswer: x.textAnswer })),
    };
  }

  private toResult(a: AttemptFull): AttemptResult {
    const answers = new Map(a.answers.map((x) => [x.questionId, x]));
    const questions = this.questions(a.test, a.id).map((q) => {
      const given = answers.get(q.id);
      const pending = q.type === "ESSAY" && Boolean(given?.textAnswer?.trim()) && given?.points == null;
      return {
        id: q.id,
        type: q.type,
        text: q.text,
        imageUrl: q.imageUrl,
        passage: q.passage ? { id: q.passage.id, title: q.passage.title, body: q.passage.body } : null,
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
        correctOptionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id),
        correctText: q.type === "TEXT" ? q.correctText?.split("|")[0] ?? null : null,
        explanation: q.explanation,
        yourOptionIds: given?.optionIds ?? [],
        yourText: given?.textAnswer ?? null,
        isCorrect: q.type === "ESSAY" ? (given?.points ?? 0) > 0 : given?.isCorrect ?? false,
        points: pending ? null : given?.points ?? 0,
        maxPoints: q.points,
        pending,
        reviewComment: given?.reviewComment ?? null,
      };
    });
    const score = round1(a.score ?? 0);
    const maxScore = round1(a.maxScore ?? 0);
    const pendingPoints = round1(questions.filter((q) => q.pending).reduce((s, q) => s + q.maxPoints, 0));
    return {
      id: a.id,
      testId: a.testId,
      testTitle: a.test.title,
      status: a.status as "SUBMITTED" | "EXPIRED",
      score,
      maxScore,
      percent: maxScore ? Math.round((score / maxScore) * 100) : 0,
      pendingPoints,
      gradingScale: a.test.gradingScale,
      level: a.test.gradingScale === "MILLIY_SERTIFIKAT" ? milliyLevel(score) : null,
      correctCount: questions.filter((q) => q.isCorrect).length,
      totalCount: questions.length,
      startedAt: a.startedAt.toISOString(),
      finishedAt: (a.finishedAt ?? new Date()).toISOString(),
      questions,
    };
  }
}
