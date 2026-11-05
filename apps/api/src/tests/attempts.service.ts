import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@onatili/db";
import {
  ERROR_CODES,
  ESSAY_SPECIAL,
  countWords,
  isMostlyCyrillic,
  type EssaySpecialKey,
  type AttemptQuestion,
  type AttemptResult,
  type ResultQuestion,
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
import { milliyOf } from "./milliy";
import { RaschService } from "./rasch.service";
import { toVoiceView } from "../voice/voice.service";

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
    private readonly rasch: RaschService,
  ) {}

  async listMocks(user: JwtUser): Promise<TestSummary[]> {
    await this.parents.assertStudentLinked(user.sub, user.role);
    const tests = await this.prisma.test.findMany({
      // Xodimlar qoralamalarni ham ko'radi: nashrdan oldin o'quvchi ko'zi bilan sinab ko'rish uchun
      where: { type: "MOCK", ...(this.access.isStaff(user.role) ? {} : { isPublished: true }) },
      orderBy: [{ isPublished: "asc" }, { createdAt: "desc" }],
      select: { id: true, title: true, type: true, isFree: true, isPublished: true, timeLimitSec: true, _count: { select: { questions: true } } },
    });
    const summaries = await this.content.buildTestSummaries(user.sub, tests, await this.access.canAccessPaid(user));
    return summaries.map((t, i) => ({ ...t, isDraft: !tests[i].isPublished }));
  }

  /** Testni boshlaydi. Tugallanmagan urinish bo'lsa, o'shani davom ettiradi. */
  async start(user: JwtUser, testId: string): Promise<AttemptState> {
    await this.parents.assertStudentLinked(user.sub, user.role);
    const test = await this.prisma.test.findFirst({
      where: { id: testId, ...(this.access.isStaff(user.role) ? {} : { isPublished: true }) },
    });
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
    return a.status === "IN_PROGRESS" ? this.toState(a) : this.toResult(a, await this.voices(a.id));
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
    const done = await this.load(user, attemptId);
    return this.toResult(done, await this.voices(done.id));
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
        const text = given?.textAnswer?.trim() ?? "";
        // Mezon: yozilmagan -> 0; to'liq kirillcha -> 0; 100 so'zdan kam -> 2 (tekshirilmaydi). Qolgani ustozga
        const special: EssaySpecialKey | null =
          a.test.gradingScale !== "MILLIY_SERTIFIKAT" || !text ? null : isMostlyCyrillic(text) ? "CYRILLIC" : countWords(text) < 100 ? "TOO_SHORT" : null;
        if (special) return { q, given, ok: null, points: ESSAY_SPECIAL[special].score, special };
        return { q, given, ok: null, points: text ? null : 0 };
      }
      const ok = isAnswerCorrect(q, given);
      return { q, given, ok, points: ok ? q.points : 0 };
    });
    const score = round1(graded.reduce((s, g) => s + (g.points ?? 0), 0));
    const maxScore = round1(graded.reduce((s, g) => s + g.q.points, 0));

    let finalized = false;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.attempt.updateMany({
        where: { id: a.id, status: "IN_PROGRESS" },
        data: { status, score, maxScore, finishedAt: new Date() },
      });
      if (count === 0) return; // boshqa so'rov allaqachon yakunlagan
      finalized = true;
      for (const g of graded) {
        if (!g.given) continue;
        await tx.attemptAnswer.update({
          where: { attemptId_questionId: { attemptId: a.id, questionId: g.q.id } },
          data: { isCorrect: g.ok, points: g.points, ...("special" in g && g.special ? { special: g.special, reviewComment: `${ESSAY_SPECIAL[g.special].label}: esse tekshirilmaydi (mezon bo'yicha ${ESSAY_SPECIAL[g.special].score} ball)` } : {}) },
        });
      }
    });
    // Rasch: yangi natija bilan savol qiyinliklari va μ, σ qayta hisoblanadi
    if (finalized && a.test.gradingScale === "MILLIY_SERTIFIKAT") this.rasch.calibrateSoon(a.testId);
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
      gradingScale: a.test.gradingScale,
      status: "IN_PROGRESS",
      startedAt: a.startedAt.toISOString(),
      deadlineAt: a.deadlineAt?.toISOString() ?? null,
      serverNow: new Date().toISOString(),
      questions,
      answers: a.answers.map((x) => ({ questionId: x.questionId, optionIds: x.optionIds, textAnswer: x.textAnswer })),
    };
  }

  /** Mock esselariga ustozning ovozli izohlari */
  private async voices(attemptId: string) {
    const rows = await this.prisma.voiceNote.findMany({ where: { attemptId }, select: { id: true, questionId: true, status: true, durationSec: true } });
    return new Map(rows.map((v) => [v.questionId!, toVoiceView(v)]));
  }

  private toResult(a: AttemptFull, voices: Map<string, ReturnType<typeof toVoiceView>> = new Map()): AttemptResult {
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
        rubric: q.type === "ESSAY" ? ((given?.rubric as ResultQuestion["rubric"]) ?? null) : null,
        voice: q.type === "ESSAY" ? (voices.get(q.id) ?? null) : null,
        textMarks: q.type === "ESSAY" ? ((given?.annotations as ResultQuestion["textMarks"]) ?? null) : null,
        special: given?.special && given.special in ESSAY_SPECIAL ? { key: given.special, label: ESSAY_SPECIAL[given.special as EssaySpecialKey].label } : null,
      };
    });
    const score = round1(a.score ?? 0);
    const maxScore = round1(a.maxScore ?? 0);
    const pendingPoints = round1(questions.filter((q) => q.pending).reduce((s, q) => s + q.maxPoints, 0));
    // Milliy sertifikat: test qismi Rasch modeli bilan, yozma ish mezon jadvali bilan; umumiy ball o'rtachasi
    const milliy = milliyOf(a);
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
      level: milliy?.level ?? null,
      milliy,
      correctCount: questions.filter((q) => q.isCorrect).length,
      totalCount: questions.length,
      startedAt: a.startedAt.toISOString(),
      finishedAt: (a.finishedAt ?? new Date()).toISOString(),
      questions,
    };
  }
}
