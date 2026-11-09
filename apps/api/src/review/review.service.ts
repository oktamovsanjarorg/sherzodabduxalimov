import { HttpException, Injectable } from "@nestjs/common";
import type { Keyboard } from "../notify/notify.service";
import { ParentsService } from "../parents/parents.service";
import { PrismaService } from "../prisma/prisma.service";
import { StudentsService } from "../students/students.service";

export interface ReviewReply {
  toast: string;
  alert?: boolean;
  /** Xabar sarlavha + shu natijaga qisqaradi, tugmalar olib tashlanadi */
  result?: string;
  /** Tugmalarni almashtiradi; null: olib tashlaydi */
  keyboard?: Keyboard | null;
}

const DONE: ReviewReply = { toast: "Allaqachon ko'rib chiqilgan", result: "☑️ Allaqachon ko'rib chiqilgan" };
const CONFIRM_PROMPT: Record<string, string> = { "st:l": "✅ Ha, birlashtirish", "st:b": "✅ Ha, bloklash", "pl:r": "✅ Ha, rad etish" };

/** Ustozga kelgan xabardagi tugmalar. data: "st:g:<student>:<group>"; "c|" bilan boshlansa, avval tasdiq so'raladi */
@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly students: StudentsService,
    private readonly parents: ParentsService,
  ) {}

  async handle(telegramId: number, data: string): Promise<ReviewReply> {
    const actor = await this.prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) }, select: { id: true, role: true, isBlocked: true } });
    if (actor?.role !== "TEACHER" || actor.isBlocked) return { toast: "Bu amal faqat ustoz uchun", alert: true };
    const m = /^(c\|)?(st|pl):([a-z]):([^:]+)(?::([^:]+))?$/.exec(data);
    if (!m) return { toast: "Tugma eskirgan", keyboard: null };
    const [, ask, kind, op, id, arg] = m as unknown as [string, string | undefined, "st" | "pl", string, string, string | undefined];
    const action = data.replace(/^c\|/, "");
    try {
      const open = kind === "st" ? await this.students.isAwaitingReview(id) : await this.parents.isAwaitingReview(id);
      if (!open) return DONE;
      if (ask) return { toast: "Qaytarib bo'lmaydi: tekshirib tasdiqlang", keyboard: [[{ text: CONFIRM_PROMPT[`${kind}:${op}`] ?? "✅ Ha", data: action }, { text: "⬅️ Orqaga", data: `${kind}:v:${id}` }]] };
      if (op === "v") return { toast: "", keyboard: kind === "st" ? ((await this.students.reviewCard(id))?.keyboard ?? null) : this.parents.reviewKeyboard(id) };
      const result = kind === "st" ? await this.student(actor.id, op, id, arg) : await this.parent(actor.id, op, id);
      return result ? { toast: "Bajarildi", result } : { toast: "Tugma eskirgan", keyboard: null };
    } catch (e) {
      if (e instanceof HttpException) return { toast: e.message, alert: true };
      throw e;
    }
  }

  private async student(actorId: string, op: string, id: string, arg?: string) {
    if (op === "g" && arg) {
      const group = await this.prisma.group.findUnique({ where: { id: arg }, select: { name: true } });
      await this.students.accept(actorId, id, arg);
      return `✅ ${group?.name ?? ""} guruhiga qo'shildi`;
    }
    if (op === "o") {
      await this.students.accept(actorId, id, null);
      return "✅ Online o'quvchi sifatida qoldi";
    }
    if (op === "l" && arg) {
      const { name } = await this.students.linkToPlaceholder(actorId, id, arg);
      return `🔗 ${name} bilan birlashtirildi`;
    }
    if (op === "b") {
      await this.students.setBlocked(actorId, id, true, "Begona: ustoz o'quvchisi emas");
      return "🚫 Bloklandi";
    }
    return null;
  }

  private async parent(actorId: string, op: string, id: string) {
    if (op === "a") {
      await this.parents.approve(actorId, id);
      return "✅ Tasdiqlandi";
    }
    if (op === "r") {
      await this.parents.reject(actorId, id, "Ustoz tasdiqlamadi");
      return "❌ Rad etildi";
    }
    return null;
  }
}
