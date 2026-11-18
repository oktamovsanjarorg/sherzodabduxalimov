import { Controller, Get, HttpCode, Inject, Param, Post, ServiceUnavailableException } from "@nestjs/common";
import type { Advice, AdvisorAiNote, PlatformAdvice, StudentAdvice } from "@onatili/shared";
import { deepseekText } from "../ai/deepseek";
import { CurrentUser, Roles, type JwtUser } from "../auth/decorators";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { platformAdvice } from "./platform-advice";
import { studentAdvice } from "./student-advice";

const STYLE = `Faqat berilgan faktlarga tayaning: raqam, mavzu yoki sabab o'ylab topmang. Fakt yetmasa, buni ochiq ayting.
Javob o'zbek tilida (lotin), oddiy so'zlar bilan, ustozga «siz» deb. Umumiy gap («ko'proq o'qish kerak») yozmang: har tavsiya aniq nima, kim va qachon.
Markdown: faqat **qalin** sarlavha va «- » ro'yxat. 1300 belgidan oshmasin.`;

const PLATFORM_PROMPT = `Siz Ona tili o'quv markazi ustozining yordamchisisiz. Sizga platforma holati (ko'rsatkichlar va qoidalar topgan muammolar) beriladi.
Tuzilishi:
**Holat** — 2–3 gap: eng muhim raqamlar va umumiy baho.
**Bu hafta qiling** — 3–5 qadam, muhimligi bo'yicha; har biri bitta aniq ish.
**O'quvchilarda asosiy kamchilik** — 1–3 band, faktlardan.
**Platformani yaxshilash** — 1–2 g'oya, faqat faktlardan kelib chiqib.
${STYLE}`;

const STUDENT_PROMPT = `Siz Ona tili ustozining yordamchisisiz. Bitta o'quvchi (S1) haqida faktlar beriladi: offline milliy test bo'limlari, ilovadagi testlar, esse mezonlari, davomat, faollik.
Tuzilishi:
**Holat** — 2 gap.
**Kuchli tomoni** — 1–2 band.
**Kamchilik va ehtimoliy sabab** — 2–3 band.
**2 haftalik reja** — 1-hafta va 2-hafta uchun 2–3 tadan aniq vazifa (qaysi bo'lim/mavzu, nechta test yoki esse).
**Ota-onaga aytish uchun** — 1–2 gap, sodda tilda.
${STYLE}`;

const strip = (a: Advice[]) => a.map(({ aiWhy: _, ...x }) => x);

/** Ustoz yordamchisi: qoidalar topgan tavsiyalar (har doim) va AI xulosa (so'ralganda, saqlanadi) */
@Roles("TEACHER", "ASSISTANT")
@Controller("admin")
export class AdvisorController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("advisor") async platform(@CurrentUser() u: JwtUser): Promise<PlatformAdvice> {
    const d = await platformAdvice(this.prisma);
    return { ...d, advice: strip(this.forRole(u, d.advice)), ai: await this.last("platform") };
  }

  @Post("advisor/ai") @HttpCode(200) async platformAi(@CurrentUser() u: JwtUser): Promise<AdvisorAiNote> {
    const d = await platformAdvice(this.prisma);
    const facts = { korsatkichlar: d.pulse, muammolar: this.forRole(u, d.advice).map((a) => ({ daraja: a.level, soha: a.area, nima: a.title, nega: a.aiWhy ?? a.why })) };
    return this.generate("platform", u.sub, PLATFORM_PROMPT, facts);
  }

  @Get("students/:id/advisor") async student(@Param("id") id: string): Promise<StudentAdvice> {
    const { facts: _, ...d } = await studentAdvice(this.prisma, id);
    return { ...d, advice: strip(d.advice), ai: await this.last(`student:${id}`) };
  }

  @Post("students/:id/advisor/ai") @HttpCode(200) async studentAi(@CurrentUser() u: JwtUser, @Param("id") id: string): Promise<AdvisorAiNote> {
    const d = await studentAdvice(this.prisma, id);
    const { _name: name, ...facts } = d.facts as Record<string, unknown> & { _name: string };
    const note = await this.generate(`student:${id}`, u.sub, STUDENT_PROMPT, { ...facts, tavsiyalar: d.advice.map((a) => a.title) });
    // AI ga ism yuborilmaydi (S1): javobda ism qo'yiladi
    return { ...note, text: note.text.replace(/\bS1\b/g, name.split(" ")[0] ?? name) };
  }

  /** Yordamchi (ASSISTANT) pulga oid ma'lumot ko'rmaydi */
  private forRole(u: JwtUser, a: Advice[]) {
    return u.role === "TEACHER" ? a : a.filter((x) => x.area !== "payments");
  }

  private async last(scope: string): Promise<AdvisorAiNote | null> {
    const n = await this.prisma.advisorNote.findFirst({ where: { scope }, orderBy: { createdAt: "desc" }, select: { text: true, createdAt: true } });
    return n ? { text: n.text, createdAt: n.createdAt.toISOString() } : null;
  }

  private async generate(scope: string, actorId: string, system: string, facts: object): Promise<AdvisorAiNote> {
    if (!this.env.DEEPSEEK_API_KEY) throw new ServiceUnavailableException("AI sozlanmagan");
    // Bir daqiqa ichida qayta bosilsa: yangi so'rov yuborilmaydi (pullik)
    const recent = await this.prisma.advisorNote.findFirst({ where: { scope, createdAt: { gt: new Date(Date.now() - 60_000) } }, orderBy: { createdAt: "desc" } });
    if (recent) return { text: recent.text, createdAt: recent.createdAt.toISOString() };
    const text = await deepseekText({ apiKey: this.env.DEEPSEEK_API_KEY, model: this.env.DEEPSEEK_MODEL, system, user: JSON.stringify(facts) });
    const n = await this.prisma.advisorNote.create({ data: { scope, text, createdById: actorId } });
    return { text: n.text, createdAt: n.createdAt.toISOString() };
  }
}
