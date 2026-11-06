import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@onatili/db";
import type {
  AdminPassage,
  PassageInput,
  AdminCourse,
  AdminLesson,
  AdminQuestion,
  AdminTestDetail,
  AdminTestRow,
  AdminVideo,
  CourseInput,
  LessonInput,
  Paged,
} from "@onatili/shared";
import { questionInput, testInput } from "@onatili/shared";
import type { z } from "zod";
import { toAdminVideo } from "../media/video-dto";
import { VideosService } from "../media/videos.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrashService } from "../trash/trash.service";

type Q = z.output<typeof questionInput>;
type T = z.output<typeof testInput>;

const questionInclude = {
  options: { orderBy: { order: "asc" } },
  topic: { select: { title: true } },
  passage: { select: { title: true, body: true } },
  _count: { select: { tests: true } },
} satisfies Prisma.QuestionInclude;

const testRowInclude = {
  topic: { select: { title: true } },
  _count: { select: { questions: true, attempts: true } },
} satisfies Prisma.TestInclude;


@Injectable()
export class AdminContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly videos: VideosService,
    private readonly trash: TrashService,
  ) {}

  private audit(actorId: string, action: string, entity: string, entityId: string, meta?: object) {
    return this.prisma.auditLog.create({ data: { actorId, action, entity, entityId, meta } });
  }

  // ---------------- Kurslar ----------------

  async listCourses(): Promise<AdminCourse[]> {
    const courses = await this.prisma.course.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: {
        topics: {
          orderBy: [{ order: "asc" }],
          include: {
            lessons: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], include: { video: true } },
            tests: { include: testRowInclude, orderBy: { createdAt: "asc" } },
          },
        },
      },
    });
    return courses.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      isPublished: c.isPublished,
      order: c.order,
      topics: c.topics.map((t) => ({
        id: t.id,
        title: t.title,
        order: t.order,
        lessons: t.lessons.map((l) => this.toLesson(l)),
        tests: t.tests.map((x) => this.toTestRow(x)),
      })),
    }));
  }

  async createCourse(actorId: string, d: CourseInput) {
    const max = await this.prisma.course.aggregate({ _max: { order: true } });
    const c = await this.prisma.course.create({ data: { ...d, order: (max._max.order ?? 0) + 1 } });
    await this.audit(actorId, "create", "Course", c.id);
    return c;
  }

  async updateCourse(actorId: string, id: string, d: Partial<CourseInput>) {
    await this.mustExist(this.prisma.course.findUnique({ where: { id } }), "Kurs");
    const c = await this.prisma.course.update({ where: { id }, data: d });
    await this.audit(actorId, "update", "Course", id, d);
    return c;
  }

  async deleteCourse(actorId: string, id: string) {
    const c = await this.mustExist(
      this.prisma.course.findUnique({ where: { id }, include: { _count: { select: { topics: true } } } }),
      "Kurs",
    );
    if (c._count.topics > 0) throw new ConflictException("Avval kursdagi mavzularni o'chiring");
    await this.trash.remove({ kind: "COURSE", id, title: c.title, actorId });
    await this.audit(actorId, "delete", "Course", id, { title: c.title });
    return { ok: true };
  }

  // ---------------- Mavzular ----------------

  async createTopic(actorId: string, courseId: string, title: string) {
    await this.mustExist(this.prisma.course.findUnique({ where: { id: courseId } }), "Kurs");
    const max = await this.prisma.topic.aggregate({ where: { courseId }, _max: { order: true } });
    const t = await this.prisma.topic.create({ data: { courseId, title, order: (max._max.order ?? 0) + 1 } });
    await this.audit(actorId, "create", "Topic", t.id);
    return t;
  }

  async updateTopic(actorId: string, id: string, title: string) {
    await this.mustExist(this.prisma.topic.findUnique({ where: { id } }), "Mavzu");
    const t = await this.prisma.topic.update({ where: { id }, data: { title } });
    await this.audit(actorId, "update", "Topic", id, { title });
    return t;
  }

  async deleteTopic(actorId: string, id: string) {
    const t = await this.mustExist(
      this.prisma.topic.findUnique({ where: { id }, include: { _count: { select: { lessons: true, tests: true } } } }),
      "Mavzu",
    );
    if (t._count.lessons > 0 || t._count.tests > 0) throw new ConflictException("Avval mavzudagi darslar va testlarni o'chiring");
    await this.trash.remove({ kind: "TOPIC", id, title: t.title, actorId });
    await this.audit(actorId, "delete", "Topic", id, { title: t.title });
    return { ok: true };
  }

  // ---------------- Darslar ----------------

  async getLesson(id: string): Promise<AdminLesson> {
    const l = await this.mustExist(this.prisma.lesson.findUnique({ where: { id }, include: { video: true } }), "Dars");
    return this.toLesson(l);
  }

  async createLesson(actorId: string, topicId: string, d: LessonInput) {
    await this.mustExist(this.prisma.topic.findUnique({ where: { id: topicId } }), "Mavzu");
    await this.checkVideo(d.videoId, null);
    const max = await this.prisma.lesson.aggregate({ where: { topicId }, _max: { order: true } });
    const l = await this.prisma.lesson.create({
      data: { ...this.lessonData(d), topicId, order: (max._max.order ?? 0) + 1 },
      include: { video: true },
    });
    await this.audit(actorId, "create", "Lesson", l.id);
    return this.toLesson(l);
  }

  async updateLesson(actorId: string, id: string, d: Partial<LessonInput>) {
    const cur = await this.mustExist(this.prisma.lesson.findUnique({ where: { id }, include: { video: true } }), "Dars");
    if (d.videoId !== undefined) await this.checkVideo(d.videoId, id);
    const next = { ...cur, ...d };
    if (next.isPublished && !next.videoUrl && !next.videoId && !next.content?.trim()) {
      throw new BadRequestException("Nashr qilish uchun video yoki konspekt kerak");
    }
    const l = await this.prisma.lesson.update({ where: { id }, data: this.lessonData(d), include: { video: true } });
    await this.audit(actorId, "update", "Lesson", id, { fields: Object.keys(d) });
    return this.toLesson(l);
  }

  async deleteLesson(actorId: string, id: string) {
    const l = await this.mustExist(this.prisma.lesson.findUnique({ where: { id } }), "Dars");
    // Korzinkaga: video diskda qoladi, dars 30 kun ichida tiklanmasa o'shanda o'chiriladi
    await this.trash.remove({ kind: "LESSON", id, title: l.title, actorId, videoIds: l.videoId ? [l.videoId] : [] });
    await this.audit(actorId, "delete", "Lesson", id, { title: l.title, videoId: l.videoId });
    return { ok: true };
  }

  async reorder(actorId: string, kind: "course" | "topic" | "lesson", ids: string[]) {
    const model = { course: this.prisma.course, topic: this.prisma.topic, lesson: this.prisma.lesson }[kind] as unknown as {
      update(args: { where: { id: string }; data: { order: number } }): Prisma.PrismaPromise<unknown>;
    };
    await this.prisma.$transaction(ids.map((id, i) => model.update({ where: { id }, data: { order: i + 1 } })));
    await this.audit(actorId, "reorder", kind, ids[0], { ids });
    return { ok: true };
  }

  // ---------------- Savollar banki ----------------

  async listQuestions(f: { topicId?: string; search?: string; page?: number; pageSize?: number; passageId?: string }): Promise<Paged<AdminQuestion>> {
    const where: Prisma.QuestionWhereInput = {
      ...(f.passageId ? { passageId: f.passageId } : {}),
      ...(f.topicId === "none" ? { topicId: null } : f.topicId ? { topicId: f.topicId } : {}),
      ...(f.search ? { text: { contains: f.search, mode: "insensitive" } } : {}),
    };
    const take = Math.min(100, Math.max(1, f.pageSize ?? 30));
    const skip = Math.max(0, (f.page ?? 1) - 1) * take;
    const [items, total] = await Promise.all([
      this.prisma.question.findMany({ where, include: questionInclude, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take, skip }),
      this.prisma.question.count({ where }),
    ]);
    return { items: items.map((q) => this.toQuestion(q)), total };
  }

  async getQuestion(id: string) {
    return this.toQuestion(await this.mustExist(this.prisma.question.findUnique({ where: { id }, include: questionInclude }), "Savol"));
  }

  async createQuestion(actorId: string, d: Q) {
    const q = await this.prisma.question.create({
      data: {
        ...this.questionData(d),
        options: { create: d.type === "TEXT" ? [] : d.options.map((o, i) => ({ text: o.text, isCorrect: o.isCorrect, order: i + 1 })) },
      },
      include: questionInclude,
    });
    await this.audit(actorId, "create", "Question", q.id);
    return this.toQuestion(q);
  }

  /** Variantlar id bo'yicha yangilanadi: eski urinishlardagi javoblar (optionIds) buzilmaydi */
  async updateQuestion(actorId: string, id: string, d: Q) {
    const cur = await this.mustExist(this.prisma.question.findUnique({ where: { id }, include: { options: true } }), "Savol");
    const keep = d.type === "TEXT" ? [] : d.options;
    const keepIds = new Set(keep.filter((o) => o.id).map((o) => o.id!));
    const foreign = [...keepIds].filter((oid) => !cur.options.some((o) => o.id === oid));
    if (foreign.length) throw new BadRequestException("Variant bu savolga tegishli emas");

    await this.prisma.$transaction([
      this.prisma.option.deleteMany({ where: { questionId: id, id: { notIn: [...keepIds] } } }),
      ...keep.map((o, i) =>
        o.id
          ? this.prisma.option.update({ where: { id: o.id }, data: { text: o.text, isCorrect: o.isCorrect, order: i + 1 } })
          : this.prisma.option.create({ data: { questionId: id, text: o.text, isCorrect: o.isCorrect, order: i + 1 } }),
      ),
      // Ustoz savolni saqlasa, import qilingan kalit "tasdiqlangan" hisoblanadi
      this.prisma.question.update({ where: { id }, data: { ...this.questionData(d), aiReview: Prisma.DbNull } }),
    ]);
    await this.audit(actorId, "update", "Question", id);
    return this.getQuestion(id);
  }

  async deleteQuestion(actorId: string, id: string) {
    const qn = await this.mustExist(this.prisma.question.findUnique({ where: { id } }), "Savol");
    const answered = await this.prisma.attemptAnswer.count({ where: { questionId: id } });
    if (answered > 0) throw new ConflictException("Bu savolga o'quvchilar javob bergan. O'chirish o'rniga testdan olib tashlang.");
    await this.trash.remove({ kind: "QUESTION", id, title: qn.text.replace(/[#*_`]/g, "").slice(0, 120), actorId });
    await this.audit(actorId, "delete", "Question", id);
    return { ok: true };
  }

  // ---------------- Matnlar (umumiy o'qish matnlari) ----------------

  async listPassages(): Promise<AdminPassage[]> {
    const ps = await this.prisma.passage.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { questions: true } } } });
    return ps.map((p) => ({ id: p.id, title: p.title, body: p.body, questionCount: p._count.questions }));
  }

  async createPassage(actorId: string, d: PassageInput) {
    const p = await this.prisma.passage.create({ data: { title: d.title ?? null, body: d.body } });
    await this.audit(actorId, "create", "Passage", p.id);
    return { id: p.id, title: p.title, body: p.body, questionCount: 0 };
  }

  async updatePassage(actorId: string, id: string, d: Partial<PassageInput>) {
    await this.mustExist(this.prisma.passage.findUnique({ where: { id } }), "Matn");
    await this.prisma.passage.update({ where: { id }, data: d });
    await this.audit(actorId, "update", "Passage", id);
    return { ok: true };
  }

  async deletePassage(actorId: string, id: string) {
    const p = await this.mustExist(this.prisma.passage.findUnique({ where: { id }, include: { _count: { select: { questions: true } } } }), "Matn");
    if (p._count.questions > 0) throw new ConflictException("Matnga savollar biriktirilgan. Avval ularni boshqa matnga o'tkazing yoki o'chiring.");
    await this.trash.remove({ kind: "PASSAGE", id, title: p.title ?? p.body.slice(0, 80), actorId });
    await this.audit(actorId, "delete", "Passage", id);
    return { ok: true };
  }

  // ---------------- Testlar ----------------

  async listTests(type?: "TOPIC" | "MOCK"): Promise<AdminTestRow[]> {
    const tests = await this.prisma.test.findMany({
      where: type ? { type } : {},
      include: testRowInclude,
      orderBy: { createdAt: "desc" },
    });
    return tests.map((t) => this.toTestRow(t));
  }

  async getTest(id: string): Promise<AdminTestDetail> {
    const t = await this.mustExist(
      this.prisma.test.findUnique({
        where: { id },
        include: { ...testRowInclude, questions: { orderBy: { order: "asc" }, include: { question: { include: questionInclude } } } },
      }),
      "Test",
    );
    return {
      ...this.toTestRow(t),
      description: t.description,
      shuffle: t.shuffle,
      gradingScale: t.gradingScale,
      questions: t.questions.map((tq) => ({ questionId: tq.questionId, points: tq.points, question: this.toQuestion(tq.question) })),
    };
  }

  async createTest(actorId: string, d: T) {
    await this.checkTest(d, null);
    const t = await this.prisma.test.create({
      data: {
        ...this.testData(d),
        questions: { create: (d.questions ?? []).map((q, i) => ({ questionId: q.questionId, points: q.points, order: i + 1 })) },
      },
    });
    await this.audit(actorId, "create", "Test", t.id);
    return this.getTest(t.id);
  }

  async updateTest(actorId: string, id: string, d: T) {
    await this.mustExist(this.prisma.test.findUnique({ where: { id } }), "Test");
    await this.checkTest(d, id);
    await this.prisma.$transaction([
      ...(d.questions
        ? [
            this.prisma.testQuestion.deleteMany({ where: { testId: id } }),
            ...d.questions.map((q, i) =>
              this.prisma.testQuestion.create({ data: { testId: id, questionId: q.questionId, points: q.points, order: i + 1 } }),
            ),
          ]
        : []),
      this.prisma.test.update({ where: { id }, data: this.testData(d) }),
    ]);
    await this.audit(actorId, "update", "Test", id);
    return this.getTest(id);
  }

  async deleteTest(actorId: string, id: string) {
    const t = await this.mustExist(
      this.prisma.test.findUnique({ where: { id }, include: { _count: { select: { attempts: true } } } }),
      "Test",
    );
    if (t._count.attempts > 0) throw new ConflictException("Bu testni o'quvchilar topshirgan. O'chirish o'rniga nashrdan oling.");
    await this.trash.remove({ kind: "TEST", id, title: t.title, actorId });
    await this.audit(actorId, "delete", "Test", id, { title: t.title });
    return { ok: true };
  }

  // ---------------- Yordamchilar ----------------

  private async mustExist<X>(p: Promise<X | null>, what: string): Promise<X> {
    const x = await p;
    if (!x) throw new NotFoundException(`${what} topilmadi`);
    return x;
  }

  private async checkVideo(videoId: string | null | undefined, lessonId: string | null) {
    if (!videoId) return;
    const v = await this.mustExist(this.prisma.video.findUnique({ where: { id: videoId }, include: { lesson: true } }), "Video");
    if (v.lesson && v.lesson.id !== lessonId) throw new ConflictException("Bu video boshqa darsga biriktirilgan");
  }

  private async checkTest(d: T, testId: string | null) {
    if (d.topicId) await this.mustExist(this.prisma.topic.findUnique({ where: { id: d.topicId } }), "Mavzu");
    if (d.type === "TOPIC" && !d.topicId) throw new BadRequestException("Mavzu testi uchun mavzuni tanlang");
    if (d.questions) {
      const ids = d.questions.map((q) => q.questionId);
      if (new Set(ids).size !== ids.length) throw new BadRequestException("Bitta savol testda ikki marta bo'lishi mumkin emas");
      const found = await this.prisma.question.count({ where: { id: { in: ids } } });
      if (found !== ids.length) throw new BadRequestException("Ba'zi savollar topilmadi");
    }
    if (d.isPublished) {
      const count = d.questions ? d.questions.length : testId ? await this.prisma.testQuestion.count({ where: { testId } }) : 0;
      if (count === 0) throw new BadRequestException("Bo'sh testni nashr qilib bo'lmaydi");
    }
  }

  private lessonData(d: Partial<LessonInput>): Prisma.LessonUncheckedUpdateInput & Prisma.LessonUncheckedCreateInput {
    const { attachments, ...rest } = d;
    return { ...(rest as object), ...(attachments ? { attachments } : {}) } as never;
  }

  private questionData(d: Q) {
    return {
      topicId: d.topicId ?? null,
      passageId: d.passageId ?? null,
      type: d.type,
      text: d.text,
      explanation: d.explanation ?? null,
      imageUrl: d.imageUrl ?? null,
      difficulty: d.difficulty,
      correctText: d.type === "TEXT" ? d.correctText ?? null : null,
    };
  }

  private testData(d: T) {
    return {
      type: d.type,
      title: d.title,
      description: d.description ?? null,
      topicId: d.type === "TOPIC" ? d.topicId ?? null : d.topicId ?? null,
      timeLimitSec: d.timeLimitSec ?? null,
      shuffle: d.shuffle ?? true,
      gradingScale: d.gradingScale ?? "NONE",
      isFree: d.isFree ?? false,
      isPublished: d.isPublished ?? false,
    };
  }

  private toLesson(l: Prisma.LessonGetPayload<{ include: { video: true } }>): AdminLesson {
    return {
      id: l.id,
      topicId: l.topicId,
      title: l.title,
      content: l.content,
      videoUrl: l.videoUrl,
      video: toAdminVideo(l.video),
      durationSec: l.durationSec ?? l.video?.durationSec ?? null,
      isFree: l.isFree,
      isPublished: l.isPublished,
      order: l.order,
      attachments: (l.attachments as AdminLesson["attachments"]) ?? [],
    };
  }

  private toQuestion(q: Prisma.QuestionGetPayload<{ include: typeof questionInclude }>): AdminQuestion {
    return {
      id: q.id,
      topicId: q.topicId,
      topicTitle: q.topic?.title ?? null,
      passageId: q.passageId,
      passageTitle: q.passage ? q.passage.title ?? q.passage.body.slice(0, 60) : null,
      keyStatus: ((q.aiReview as { keyStatus?: "proposed" | "uncertain" } | null)?.keyStatus ?? null),
      type: q.type,
      text: q.text,
      explanation: q.explanation,
      imageUrl: q.imageUrl,
      difficulty: q.difficulty,
      correctText: q.correctText,
      options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
      usedInTests: q._count.tests,
    };
  }

  private toTestRow(t: Prisma.TestGetPayload<{ include: typeof testRowInclude }>): AdminTestRow {
    return {
      id: t.id,
      type: t.type,
      title: t.title,
      topicId: t.topicId,
      topicTitle: t.topic?.title ?? null,
      isFree: t.isFree,
      isPublished: t.isPublished,
      timeLimitSec: t.timeLimitSec,
      questionCount: t._count.questions,
      attemptCount: t._count.attempts,
    };
  }
}
