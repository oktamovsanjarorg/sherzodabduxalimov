import { BadRequestException, BadGatewayException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@onatili/db";
import {
  NAME_MATCH_THRESHOLD,
  nameMatchScore,
  parseUtestMatrix,
  type ExternalPreview,
  type ExternalRankingRow,
  type ExternalRowInput,
  type ExternalSection,
  type ExternalSectionScore,
  type ExternalTestDetail,
  type ExternalTestInput,
  type ExternalTestSummary,
  type MyExternalResult,
  type MyExternalResultDetail,
} from "@onatili/shared";
import { ENV, type Env } from "../config/env";
import { NotifyService } from "../notify/notify.service";
import { esc } from "../notify/telegram";
import { PrismaService } from "../prisma/prisma.service";

const fullName = (u: { firstName: string; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ");
const round1 = (x: number) => Math.round(x * 10) / 10;
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

/** utest partner API javobi (utest `ADR-099`, versiya 1) */
interface UtestResults {
  version: number;
  test: { code: string; title: string; questionCount: number; subject: string | null; resultsVisible: boolean; sections: ExternalSection[] };
  attempts: {
    telegramId: number;
    name: string;
    username: string | null;
    submittedAt: string | null;
    durationSec: number | null;
    correct: number;
    wrong: number;
    blank: number;
    rawScore: number;
    maxScore: number;
    percent: number;
    scaledScore: number | null;
    grade: string | null;
    sections: ExternalSectionScore[];
    answers: string;
  }[];
}

type Match = { studentId: string; name: string; how: "telegram" | "username" | "name" };

/**
 * Tashqi testlar: utest'da o'tkazilgan test natijalari shu yerga import qilinadi.
 * O'quvchi Telegram ID bo'yicha aniq topiladi (CSV da: username, keyin ism).
 */
@Injectable()
export class ExternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get utestEnabled() {
    return Boolean(this.env.UTEST_API_KEY);
  }

  // ---------------- Manbalar ----------------

  async fetchUtest(code: string): Promise<ExternalTestInput> {
    if (!this.env.UTEST_API_KEY) throw new ServiceUnavailableException("utest bilan bog'lanish sozlanmagan (UTEST_API_KEY)");
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(c)) throw new BadRequestException("Test kodi noto'g'ri");
    const res = await fetch(`${this.env.UTEST_API_URL.replace(/\/$/, "")}/partner/v1/tests/${c}/results`, {
      headers: { Authorization: `Bearer ${this.env.UTEST_API_KEY}` },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!res) throw new BadGatewayException("utest javob bermadi. Birozdan keyin qayta urinib ko'ring");
    if (res.status === 404) throw new NotFoundException("Bunday test topilmadi yoki u sizning utest hisobingizniki emas");
    if (!res.ok) throw new BadGatewayException(`utest xatosi (${res.status})`);
    const d = (await res.json()) as UtestResults;
    if (d.version !== 1) throw new BadGatewayException("utest javobi formati o'zgargan: platformani yangilash kerak");
    return {
      source: "UTEST",
      code: d.test.code,
      title: d.test.title,
      subject: d.test.subject,
      questionCount: d.test.questionCount,
      sections: d.test.sections,
      resultsVisible: d.test.resultsVisible,
      rows: d.attempts.map((a) => ({
        key: `tg:${a.telegramId}`,
        telegramId: String(a.telegramId),
        name: a.name,
        username: a.username,
        correct: a.correct,
        wrong: a.wrong,
        blank: a.blank,
        score: a.rawScore,
        maxScore: a.maxScore,
        percent: a.percent,
        scaledScore: a.scaledScore,
        grade: a.grade,
        sections: a.sections,
        answers: a.answers,
        submittedAt: a.submittedAt,
        durationSec: a.durationSec,
      })),
    };
  }

  fromCsv(d: { fileName: string; title: string | null; content: string }): ExternalTestInput {
    let parsed;
    try {
      parsed = parseUtestMatrix(d.content);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : "Faylni o'qib bo'lmadi");
    }
    // "utest-K7P2QX-matritsa.csv" -> K7P2QX; bo'lmasa fayl nomi
    const code = /utest-([A-Z0-9]{4,12})/i.exec(d.fileName)?.[1]?.toUpperCase() ?? d.fileName.replace(/\.[^.]+$/, "").slice(0, 60);
    return { source: "CSV", code, title: d.title?.trim() || `utest ${code}`, subject: null, questionCount: parsed.questionCount, sections: [], resultsVisible: true, rows: parsed.rows };
  }

  // ---------------- O'quvchini topish ----------------

  private async matcher() {
    const students = await this.prisma.studentProfile.findMany({
      where: { user: { role: "STUDENT" } },
      select: { id: true, user: { select: { firstName: true, lastName: true, username: true, telegramId: true } } },
    });
    const byTg = new Map(students.filter((s) => s.user.telegramId !== null).map((s) => [String(s.user.telegramId), s]));
    const byUser = new Map(students.filter((s) => s.user.username).map((s) => [s.user.username!.toLowerCase(), s]));
    return (r: Pick<ExternalRowInput, "telegramId" | "username" | "name">): Match | null => {
      const tg = r.telegramId ? byTg.get(r.telegramId) : undefined;
      if (tg) return { studentId: tg.id, name: fullName(tg.user), how: "telegram" };
      if (r.telegramId) return null; // Telegram ID bor, lekin bu platformada yo'q: ism bo'yicha taxmin qilinmaydi
      const u = r.username ? byUser.get(r.username.toLowerCase()) : undefined;
      if (u) return { studentId: u.id, name: fullName(u.user), how: "username" };
      let best: { s: (typeof students)[number]; score: number } | null = null;
      for (const s of students) {
        const score = nameMatchScore(r.name, fullName(s.user));
        if (score >= NAME_MATCH_THRESHOLD && (!best || score > best.score)) best = { s, score };
      }
      return best ? { studentId: best.s.id, name: fullName(best.s.user), how: "name" } : null;
    };
  }

  async preview(input: ExternalTestInput): Promise<ExternalPreview> {
    const match = await this.matcher();
    const existing = await this.prisma.externalTest.findUnique({ where: { source_code: { source: input.source, code: input.code } }, select: { id: true } });
    const { rows, ...test } = input;
    return {
      test: { ...test, participants: rows.length, alreadyImported: Boolean(existing) },
      rows: rows.map((r) => ({ key: r.key, name: r.name, username: r.username, percent: r.percent, match: match(r) })),
    };
  }

  /** Qayta import: natijalar yangilanadi, qo'lda bog'langan o'quvchi saqlanadi */
  async save(actorId: string, input: ExternalTestInput): Promise<{ id: string; created: number; updated: number; matched: number }> {
    if (!input.rows.length) throw new BadRequestException("Testda hali natija yo'q");
    const match = await this.matcher();
    const takenAt = input.rows.map((r) => r.submittedAt).filter((x): x is string => !!x).sort()[0];
    const test = await this.prisma.externalTest.upsert({
      where: { source_code: { source: input.source, code: input.code } },
      update: { title: input.title, subject: input.subject, questionCount: input.questionCount, sections: input.sections as unknown as Prisma.InputJsonValue, resultsVisible: input.resultsVisible },
      create: {
        source: input.source,
        code: input.code,
        title: input.title,
        subject: input.subject,
        questionCount: input.questionCount,
        sections: input.sections as unknown as Prisma.InputJsonValue,
        resultsVisible: input.resultsVisible,
        takenAt: takenAt ? new Date(takenAt) : new Date(),
        importedById: actorId,
      },
    });
    const old = new Map((await this.prisma.externalResult.findMany({ where: { testId: test.id }, select: { key: true, manualMatch: true, studentId: true } })).map((r) => [r.key, r]));
    let created = 0;
    let matched = 0;
    await this.prisma.$transaction(
      input.rows.map((r) => {
        const prev = old.get(r.key);
        const studentId = prev?.manualMatch ? prev.studentId : (match(r)?.studentId ?? null);
        if (studentId) matched++;
        if (!prev) created++;
        const data = {
          telegramId: r.telegramId ? BigInt(r.telegramId) : null,
          name: r.name,
          username: r.username,
          studentId,
          correct: r.correct,
          wrong: r.wrong,
          blank: r.blank,
          score: r.score,
          maxScore: r.maxScore,
          percent: r.percent,
          scaledScore: r.scaledScore,
          grade: r.grade,
          sections: r.sections as unknown as Prisma.InputJsonValue,
          answers: r.answers,
          submittedAt: r.submittedAt ? new Date(r.submittedAt) : null,
          durationSec: r.durationSec,
        };
        return this.prisma.externalResult.upsert({ where: { testId_key: { testId: test.id, key: r.key } }, update: data, create: { ...data, testId: test.id, key: r.key } });
      }),
    );
    await this.prisma.auditLog.create({ data: { actorId, action: "external.import", entity: "ExternalTest", entityId: test.id, meta: { source: input.source, code: input.code, rows: input.rows.length, matched } } });
    return { id: test.id, created, updated: input.rows.length - created, matched };
  }

  // ---------------- Admin ko'rinishi ----------------

  async list(): Promise<ExternalTestSummary[]> {
    const tests = await this.prisma.externalTest.findMany({ orderBy: [{ takenAt: "desc" }, { createdAt: "desc" }], include: { results: { select: { percent: true, studentId: true } } } });
    return tests.map((t) => this.summary(t));
  }

  private summary(t: Prisma.ExternalTestGetPayload<object> & { results: { percent: number; studentId: string | null }[] }): ExternalTestSummary {
    return {
      id: t.id,
      source: t.source,
      code: t.code,
      title: t.title,
      subject: t.subject,
      questionCount: t.questionCount,
      participants: t.results.length,
      matched: t.results.filter((r) => r.studentId).length,
      avgPercent: avg(t.results.map((r) => r.percent)),
      resultsVisible: t.resultsVisible,
      takenAt: t.takenAt?.toISOString() ?? null,
      importedAt: t.createdAt.toISOString(),
      notifiedAt: t.notifiedAt?.toISOString() ?? null,
    };
  }

  async detail(id: string): Promise<ExternalTestDetail> {
    const t = await this.prisma.externalTest.findUnique({
      where: { id },
      include: { results: { orderBy: [{ percent: "desc" }, { durationSec: "asc" }], include: { student: { select: { id: true, user: { select: { firstName: true, lastName: true } } } } } } },
    });
    if (!t) throw new NotFoundException("Test topilmadi");
    const rs = t.results;
    const sorted = rs.map((r) => r.percent).sort((a, b) => a - b);
    const median = sorted.length ? round1(sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
    const buckets = Array.from({ length: 10 }, (_, i) => ({ label: i === 9 ? "90–100" : `${i * 10}–${i * 10 + 9}`, count: 0 }));
    for (const r of rs) buckets[Math.min(9, Math.floor(r.percent / 10))].count++;
    const questions = Array.from({ length: t.questionCount }, (_, i) => {
      const states = rs.map((r) => r.answers[i]).filter((x) => x && x !== "-");
      const n = states.length || 1;
      return { q: i + 1, correctPct: round1((states.filter((x) => x === "c").length / n) * 100), blankPct: round1((states.filter((x) => x === "b").length / n) * 100) };
    });
    const secMeta = (t.sections as unknown as ExternalSection[]) ?? [];
    const sections = secMeta.map((s, i) => ({
      ...s,
      avgPercent: avg(rs.map((r) => (r.sections as unknown as ExternalSectionScore[])[i]?.percent).filter((x): x is number => typeof x === "number")) ?? 0,
    }));
    let rank = 0;
    let prev = -1;
    return {
      ...this.summary(t),
      sections: secMeta,
      stats: { median, buckets, questions, sections },
      rows: rs.map((r, i) => {
        if (r.percent !== prev) (rank = i + 1), (prev = r.percent);
        return {
          id: r.id,
          rank,
          name: r.name,
          username: r.username,
          student: r.student ? { id: r.student.id, name: fullName(r.student.user) } : null,
          manualMatch: r.manualMatch,
          correct: r.correct,
          wrong: r.wrong,
          blank: r.blank,
          score: r.score,
          maxScore: r.maxScore,
          percent: r.percent,
          scaledScore: r.scaledScore,
          grade: r.grade,
          answers: r.answers,
          submittedAt: r.submittedAt?.toISOString() ?? null,
          notifiedAt: r.notifiedAt?.toISOString() ?? null,
        };
      }),
    };
  }

  async link(actorId: string, testId: string, resultId: string, studentId: string | null) {
    const r = await this.prisma.externalResult.findFirst({ where: { id: resultId, testId } });
    if (!r) throw new NotFoundException("Natija topilmadi");
    if (studentId && !(await this.prisma.studentProfile.findUnique({ where: { id: studentId }, select: { id: true } }))) throw new NotFoundException("O'quvchi topilmadi");
    await this.prisma.externalResult.update({ where: { id: resultId }, data: { studentId, manualMatch: true } });
    await this.prisma.auditLog.create({ data: { actorId, action: "external.link", entity: "ExternalResult", entityId: resultId, meta: { studentId } } });
    return { ok: true };
  }

  async remove(actorId: string, id: string) {
    const t = await this.prisma.externalTest.findUnique({ where: { id }, select: { title: true, code: true } });
    if (!t) throw new NotFoundException("Test topilmadi");
    await this.prisma.externalTest.delete({ where: { id } });
    await this.prisma.auditLog.create({ data: { actorId, action: "external.delete", entity: "ExternalTest", entityId: id, meta: t } });
    return { ok: true };
  }

  /**
   * "Natija tayyor" xabari: o'quvchi va tasdiqlangan ota-onalarga. Natija matnda YO'Q (ataylab):
   * ko'rish uchun ilovani ochishga undaydi. Avval xabar olganlarga qayta yuborilmaydi.
   */
  async sendNotices(actorId: string, id: string) {
    const t = await this.prisma.externalTest.findUnique({ where: { id }, select: { title: true, resultsVisible: true } });
    if (!t) throw new NotFoundException("Test topilmadi");
    if (!t.resultsVisible) throw new BadRequestException("utest'da natija hali o'quvchilarga yopiq. Test yopilgach qayta import qiling");
    const rows = await this.prisma.externalResult.findMany({
      where: { testId: id, studentId: { not: null }, notifiedAt: null },
      select: {
        id: true,
        student: {
          select: { user: { select: { firstName: true, lastName: true, telegramId: true, isBlocked: true } }, parents: { where: { status: "APPROVED" }, select: { parent: { select: { telegramId: true } } } } },
        },
      },
    });
    let students = 0;
    let parents = 0;
    const title = esc(t.title);
    for (const r of rows) {
      const s = r.student!;
      if (s.user.isBlocked) continue;
      if (s.user.telegramId !== null) {
        await this.notify.sendApp(s.user.telegramId, `📊 <b>${title}</b> testi natijangiz tayyor.\nNatijani, xatolaringizni va guruhdagi o'rningizni ilovada ko'ring.`, `/external/${r.id}`, "Natijani ko'rish");
        students++;
      }
      for (const p of s.parents) {
        await this.notify.sendApp(p.parent.telegramId, `📊 <b>${esc(fullName(s.user))}</b> «${title}» testini topshirdi, natijasi tayyor.\nNatijani ilovada ko'ring.`, "/", "Ilovani ochish");
        parents++;
      }
    }
    const now = new Date();
    await this.prisma.externalResult.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { notifiedAt: now } });
    await this.prisma.externalTest.update({ where: { id }, data: { notifiedAt: now } });
    await this.prisma.auditLog.create({ data: { actorId, action: "external.notify", entity: "ExternalTest", entityId: id, meta: { students, parents } } });
    return { students, parents };
  }

  async ranking(days: number): Promise<ExternalRankingRow[]> {
    const since = days ? new Date(Date.now() - days * 86_400_000) : undefined;
    const rs = await this.prisma.externalResult.findMany({
      where: { studentId: { not: null }, ...(since ? { test: { takenAt: { gte: since } } } : {}) },
      orderBy: { test: { takenAt: "asc" } },
      select: { percent: true, student: { select: { id: true, group: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } } } },
    });
    const by = new Map<string, { name: string; groupName: string | null; ps: number[] }>();
    for (const r of rs) {
      const s = r.student!;
      const e = by.get(s.id) ?? { name: fullName(s.user), groupName: s.group?.name ?? null, ps: [] };
      e.ps.push(r.percent);
      by.set(s.id, e);
    }
    return [...by]
      .map(([studentId, e]) => ({ studentId, name: e.name, groupName: e.groupName, tests: e.ps.length, avgPercent: avg(e.ps)!, best: Math.max(...e.ps), last: e.ps.at(-1)! }))
      .sort((a, b) => b.avgPercent - a.avgPercent || b.tests - a.tests);
  }

  // ---------------- O'quvchi va ota-ona ilovasi ----------------

  /** Testdagi o'rni: ochiq natijali testlarning hamma qatnashchilari ichida */
  private async ranks(testIds: string[]) {
    const all = await this.prisma.externalResult.findMany({ where: { testId: { in: testIds } }, select: { testId: true, percent: true } });
    const by = new Map<string, number[]>();
    for (const r of all) by.set(r.testId, [...(by.get(r.testId) ?? []), r.percent]);
    return (testId: string, percent: number) => {
      const ps = by.get(testId) ?? [];
      return { rank: ps.filter((p) => p > percent).length + 1, participants: ps.length, avg: avg(ps) ?? 0 };
    };
  }

  async forStudent(studentId: string, take = 30): Promise<MyExternalResult[]> {
    const rs = await this.prisma.externalResult.findMany({
      where: { studentId, test: { resultsVisible: true } },
      orderBy: { test: { takenAt: "desc" } },
      take,
      include: { test: { select: { title: true, subject: true, takenAt: true, questionCount: true } } },
    });
    const rank = await this.ranks([...new Set(rs.map((r) => r.testId))]);
    return rs.map((r) => {
      const k = rank(r.testId, r.percent);
      return {
        id: r.id,
        title: r.test.title,
        subject: r.test.subject,
        takenAt: (r.submittedAt ?? r.test.takenAt)?.toISOString() ?? null,
        correct: r.correct,
        questionCount: r.test.questionCount,
        score: r.score,
        maxScore: r.maxScore,
        percent: r.percent,
        scaledScore: r.scaledScore,
        grade: r.grade,
        rank: k.rank,
        participants: k.participants,
      };
    });
  }

  async myDetail(userId: string, resultId: string): Promise<MyExternalResultDetail> {
    const r = await this.prisma.externalResult.findFirst({
      where: { id: resultId, test: { resultsVisible: true }, student: { userId } },
      include: { test: { select: { title: true, subject: true, takenAt: true, questionCount: true } } },
    });
    if (!r) throw new NotFoundException("Natija topilmadi");
    const k = (await this.ranks([r.testId]))(r.testId, r.percent);
    return {
      id: r.id,
      title: r.test.title,
      subject: r.test.subject,
      takenAt: (r.submittedAt ?? r.test.takenAt)?.toISOString() ?? null,
      correct: r.correct,
      questionCount: r.test.questionCount,
      score: r.score,
      maxScore: r.maxScore,
      percent: r.percent,
      scaledScore: r.scaledScore,
      grade: r.grade,
      rank: k.rank,
      participants: k.participants,
      wrong: r.wrong,
      blank: r.blank,
      sections: (r.sections as unknown as ExternalSectionScore[]) ?? [],
      answers: r.answers,
      avgPercent: k.avg,
    };
  }

  async mine(userId: string) {
    const sp = await this.prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
    return sp ? this.forStudent(sp.id) : [];
  }
}
