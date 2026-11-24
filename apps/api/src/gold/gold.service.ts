import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@onatili/db";
import {
  GOLD_MIN,
  GOLD_TARGET,
  rubricScore,
  type EssaySpecialKey,
  type GoldCreateInput,
  type GoldDetail,
  type GoldList,
  type GoldRatingInput,
  type GoldRatingView,
  type GoldTranscriptInput,
  type TextMark,
} from "@onatili/shared";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { buildGoldZip } from "./gold-export";
import { GOLD_MAX_PAGES, GoldFiles } from "./gold-files";

const fullName = (u: { firstName: string; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ");
const ratingInclude = { rater: { select: { firstName: true, lastName: true } } } as const;
type Rating = Prisma.GoldRatingGetPayload<{ include: typeof ratingInclude }>;

/** Ko'chirilgan va kamida ikki ustoz baholagan — o'lchovga tayyor */
const isReady = (e: { transcript: string | null; _count: { ratings: number } }) => !!e.transcript?.trim() && e._count.ratings >= 2;

function ratingView(r: Rating, me: string): GoldRatingView {
  const scores = (r.scores ?? {}) as Record<string, number>;
  const special = (r.special ?? null) as EssaySpecialKey | null;
  const total = rubricScore(
    special,
    Object.entries(scores).map(([key, score]) => ({ key, score })),
  ).total;
  return { rater: fullName(r.rater), mine: r.raterId === me, special, scores, total };
}

@Injectable()
export class GoldService {
  private readonly files: GoldFiles;
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    this.files = new GoldFiles(env.MEDIA_DIR);
  }

  async list(me: string): Promise<GoldList> {
    const rows = await this.prisma.goldEssay.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { ratings: true } }, ratings: { where: { raterId: me }, select: { id: true } } },
    });
    return {
      summary: {
        total: rows.length,
        transcribed: rows.filter((e) => e.transcript?.trim()).length,
        doubleRated: rows.filter((e) => e._count.ratings >= 2).length,
        ready: rows.filter(isReady).length,
        target: GOLD_TARGET,
        min: GOLD_MIN,
      },
      rows: rows.map((e) => ({
        id: e.id,
        topic: e.topic,
        pages: e.imageUrls.length,
        fromBot: !!e.essayId,
        transcribed: !!e.transcript?.trim(),
        marks: Array.isArray(e.marks) ? e.marks.length : 0,
        ratings: e._count.ratings,
        ratedByMe: e.ratings.length > 0,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  async detail(me: string, id: string): Promise<GoldDetail> {
    const e = await this.prisma.goldEssay.findUnique({
      where: { id },
      include: { ratings: { include: ratingInclude, orderBy: { createdAt: "asc" } }, transcribedBy: { select: { firstName: true, lastName: true } } },
    });
    if (!e) throw new NotFoundException("Sinov essesi topilmadi");
    const mine = e.ratings.find((r) => r.raterId === me);
    const others = e.ratings.filter((r) => r.raterId !== me);
    return {
      id: e.id,
      topic: e.topic,
      pages: e.imageUrls.length,
      fromBot: !!e.essayId,
      transcript: e.transcript,
      marks: (e.marks as TextMark[]) ?? [],
      transcribedBy: e.transcribedBy ? fullName(e.transcribedBy) : null,
      myRating: mine ? ratingView(mine, me) : null,
      // Mustaqil baho: o'zi baholamaguncha boshqalarniki ko'rinmaydi
      others: mine ? others.map((r) => ratingView(r, me)) : null,
      otherCount: others.length,
      createdAt: e.createdAt.toISOString(),
    };
  }

  async create(me: string, d: GoldCreateInput): Promise<GoldDetail> {
    const e = await this.prisma.goldEssay.create({ data: { topic: d.topic, consent: true, createdById: me } });
    return this.detail(me, e.id);
  }

  /** Botdagi esseni to'plamga qo'shish. Yozib yuborilgan essening matni aynan o'quvchiniki, shuning uchun ko'chiriladi */
  async fromEssay(me: string, essayId: string): Promise<GoldDetail> {
    const essay = await this.prisma.essay.findUnique({ where: { id: essayId }, select: { prompt: true, text: true, imageUrls: true } });
    if (!essay) throw new NotFoundException("Esse topilmadi");
    const exists = await this.prisma.goldEssay.findUnique({ where: { essayId }, select: { id: true } });
    if (exists) throw new ConflictException("Bu esse sinov to'plamida bor");
    const handwritten = essay.imageUrls.length > 0;
    if (!handwritten && !essay.text?.trim()) throw new BadRequestException("Essening matni ham, rasmi ham yo'q");
    const e = await this.prisma.goldEssay.create({
      // Qo'lyozmada AI o'qigan matn olinmaydi: ustoz rasmdan o'zi ko'chiradi (AI xatosi o'lchovga o'tmasin)
      data: { essayId, topic: essay.prompt, consent: true, createdById: me, transcript: handwritten ? null : essay.text },
    });
    if (handwritten) {
      const imageUrls = await this.files.copyFromEssay(e.id, essay.imageUrls);
      await this.prisma.goldEssay.update({ where: { id: e.id }, data: { imageUrls } });
    }
    return this.detail(me, e.id);
  }

  async addPage(me: string, id: string, body: unknown): Promise<GoldDetail> {
    if (!Buffer.isBuffer(body) || !body.length) throw new BadRequestException("Rasm yuboring");
    const e = await this.get(id);
    if (e.imageUrls.length >= GOLD_MAX_PAGES) throw new ConflictException(`Ko'pi bilan ${GOLD_MAX_PAGES} ta varoq`);
    const rel = await this.files.save(id, body);
    if (!rel) throw new BadRequestException("Faqat rasm (JPG, PNG, WEBP) qabul qilinadi");
    await this.prisma.goldEssay.update({ where: { id }, data: { imageUrls: { push: rel } } });
    return this.detail(me, id);
  }

  async removePage(me: string, id: string, n: number): Promise<GoldDetail> {
    const e = await this.get(id);
    const rel = e.imageUrls[n];
    if (!rel) throw new NotFoundException("Varoq topilmadi");
    await this.prisma.goldEssay.update({ where: { id }, data: { imageUrls: e.imageUrls.filter((_, i) => i !== n) } });
    await this.files.remove(rel);
    return this.detail(me, id);
  }

  async page(id: string, n: number) {
    const e = await this.get(id);
    const img = e.imageUrls[n] ? await this.files.read(e.imageUrls[n]) : null;
    if (!img) throw new NotFoundException("Varoq topilmadi");
    return img;
  }

  async saveTranscript(me: string, id: string, d: GoldTranscriptInput): Promise<GoldDetail> {
    await this.get(id);
    const marks = d.marks.filter((m) => m.end <= d.transcript.length && m.start < m.end);
    await this.prisma.goldEssay.update({ where: { id }, data: { transcript: d.transcript.trim() ? d.transcript : null, marks, transcribedById: me } });
    return this.detail(me, id);
  }

  async rate(me: string, id: string, d: GoldRatingInput): Promise<GoldDetail> {
    await this.get(id);
    const scores = d.special ? {} : d.scores;
    await this.prisma.goldRating.upsert({
      where: { goldEssayId_raterId: { goldEssayId: id, raterId: me } },
      create: { goldEssayId: id, raterId: me, scores, special: d.special },
      update: { scores, special: d.special },
    });
    return this.detail(me, id);
  }

  async remove(user: { sub: string; role: string }, id: string) {
    const e = await this.get(id);
    if (user.role !== "TEACHER" && e.createdById !== user.sub) throw new ForbiddenException("Faqat ustoz yoki qo'shgan xodim o'chira oladi");
    await this.prisma.goldEssay.delete({ where: { id } });
    await this.files.removeAll(id);
    return { ok: true };
  }

  /** O'lchovga tayyor esselar zip'da (ism yo'q) */
  async exportZip() {
    const rows = await this.prisma.goldEssay.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { ratings: true } }, ratings: { orderBy: { createdAt: "asc" }, select: { raterId: true, scores: true, special: true } } },
    });
    const ready = rows.filter(isReady);
    if (!ready.length) throw new BadRequestException("Hali o'lchovga tayyor esse yo'q: ko'chirilgan va ikki ustoz baholagan esse kerak");
    return buildGoldZip(this.files, ready);
  }

  private async get(id: string) {
    const e = await this.prisma.goldEssay.findUnique({ where: { id } });
    if (!e) throw new NotFoundException("Sinov essesi topilmadi");
    return e;
  }
}
