import { Injectable, NotFoundException } from "@nestjs/common";
import type { CourseView, LessonDetail, StudentStats, TestSummary } from "@onatili/shared";
import { AccessService } from "../access/access.service";
import type { JwtUser } from "../auth/decorators";
import { PrismaService } from "../prisma/prisma.service";

type TestRow = {
  id: string;
  title: string;
  type: "TOPIC" | "MOCK";
  isFree: boolean;
  timeLimitSec: number | null;
  _count: { questions: number };
};

const testSelect = {
  id: true,
  title: true,
  type: true,
  isFree: true,
  timeLimitSec: true,
  _count: { select: { questions: true } },
} as const;

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessService) {}

  /** Testlar ro'yxatiga foydalanuvchining eng yaxshi natijasi va tugallanmagan urinishini qo'shadi */
  async buildTestSummaries(userId: string, tests: TestRow[], paidOpen: boolean): Promise<TestSummary[]> {
    if (tests.length === 0) return [];
    const attempts = await this.prisma.attempt.findMany({
      where: { userId, testId: { in: tests.map((t) => t.id) } },
      select: { id: true, testId: true, status: true, score: true, maxScore: true },
    });
    return tests.map((t) => {
      const mine = attempts.filter((a) => a.testId === t.id);
      const finished = mine.filter((a) => a.status !== "IN_PROGRESS" && a.maxScore);
      const best = finished.length
        ? Math.max(...finished.map((a) => Math.round(((a.score ?? 0) / a.maxScore!) * 100)))
        : null;
      return {
        id: t.id,
        title: t.title,
        type: t.type,
        isFree: t.isFree,
        locked: !t.isFree && !paidOpen,
        questionCount: t._count.questions,
        timeLimitSec: t.timeLimitSec,
        bestPercent: best,
        inProgressAttemptId: mine.find((a) => a.status === "IN_PROGRESS")?.id ?? null,
      };
    });
  }

  async listCourses(user: JwtUser): Promise<CourseView[]> {
    const paidOpen = await this.access.canAccessPaid(user);
    const courses = await this.prisma.course.findMany({
      where: { isPublished: true },
      orderBy: { order: "asc" },
      include: {
        topics: {
          orderBy: { order: "asc" },
          include: {
            lessons: {
              where: { isPublished: true },
              orderBy: { order: "asc" },
              select: { id: true, title: true, durationSec: true, isFree: true },
            },
            tests: { where: { isPublished: true, type: "TOPIC" }, select: testSelect },
          },
        },
      },
    });

    const lessonIds = courses.flatMap((c) => c.topics.flatMap((t) => t.lessons.map((l) => l.id)));
    const done = new Set(
      (
        await this.prisma.lessonProgress.findMany({
          where: { userId: user.sub, lessonId: { in: lessonIds }, completedAt: { not: null } },
          select: { lessonId: true },
        })
      ).map((p) => p.lessonId),
    );

    const result: CourseView[] = [];
    for (const c of courses) {
      const topics = [];
      for (const t of c.topics) {
        topics.push({
          id: t.id,
          title: t.title,
          lessons: t.lessons.map((l) => ({
            ...l,
            locked: !l.isFree && !paidOpen,
            completed: done.has(l.id),
          })),
          tests: await this.buildTestSummaries(user.sub, t.tests, paidOpen),
        });
      }
      const all = c.topics.flatMap((t) => t.lessons);
      result.push({
        id: c.id,
        title: c.title,
        description: c.description,
        coverUrl: c.coverUrl,
        topics,
        progress: { completed: all.filter((l) => done.has(l.id)).length, total: all.length },
      });
    }
    return result;
  }

  async getLesson(user: JwtUser, id: string): Promise<LessonDetail> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, isPublished: true, topic: { course: { isPublished: true } } },
      include: {
        topic: {
          include: {
            lessons: { where: { isPublished: true }, orderBy: { order: "asc" }, select: { id: true } },
            tests: { where: { isPublished: true, type: "TOPIC" }, select: testSelect },
          },
        },
      },
    });
    if (!lesson) throw new NotFoundException("Dars topilmadi");

    const paidOpen = await this.access.canAccessPaid(user);
    this.access.assertAccess(lesson.isFree, paidOpen);

    const progress = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: user.sub, lessonId: id } },
    });
    // "Oxirgi ochilgan dars" uchun belgi (completedAt o'zgarmaydi)
    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: user.sub, lessonId: id } },
      update: {},
      create: { userId: user.sub, lessonId: id },
    });

    const siblings = lesson.topic.lessons;
    const idx = siblings.findIndex((l) => l.id === id);
    return {
      id: lesson.id,
      title: lesson.title,
      topicId: lesson.topicId,
      topicTitle: lesson.topic.title,
      videoUrl: lesson.videoUrl,
      content: lesson.content,
      attachments: (lesson.attachments as { name: string; url: string }[]) ?? [],
      completed: Boolean(progress?.completedAt),
      topicTests: await this.buildTestSummaries(user.sub, lesson.topic.tests, paidOpen),
      nextLessonId: siblings[idx + 1]?.id ?? null,
    };
  }

  async completeLesson(user: JwtUser, id: string) {
    const lesson = await this.prisma.lesson.findFirst({ where: { id, isPublished: true }, select: { isFree: true } });
    if (!lesson) throw new NotFoundException("Dars topilmadi");
    this.access.assertAccess(lesson.isFree, await this.access.canAccessPaid(user));
    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: user.sub, lessonId: id } },
      update: { completedAt: new Date() },
      create: { userId: user.sub, lessonId: id, completedAt: new Date() },
    });
    return { ok: true };
  }

  async stats(user: JwtUser): Promise<StudentStats> {
    const [lessonsCompleted, attempts, last] = await Promise.all([
      this.prisma.lessonProgress.count({ where: { userId: user.sub, completedAt: { not: null } } }),
      this.prisma.attempt.findMany({
        where: { userId: user.sub, status: { not: "IN_PROGRESS" }, maxScore: { gt: 0 } },
        select: { score: true, maxScore: true },
      }),
      this.prisma.lessonProgress.findFirst({
        where: { userId: user.sub, lesson: { isPublished: true } },
        orderBy: { updatedAt: "desc" },
        include: { lesson: { include: { topic: true } } },
      }),
    ]);
    const avg = attempts.length
      ? Math.round((attempts.reduce((s, a) => s + (a.score ?? 0) / a.maxScore!, 0) / attempts.length) * 100)
      : null;
    return {
      lessonsCompleted,
      testsTaken: attempts.length,
      averagePercent: avg,
      lastLesson: last
        ? { id: last.lesson.id, title: last.lesson.title, topicTitle: last.lesson.topic.title }
        : null,
    };
  }
}
