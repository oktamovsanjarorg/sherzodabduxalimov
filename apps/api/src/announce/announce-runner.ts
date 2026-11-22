import type { Announcement, PrismaClient } from "@onatili/db";
import { renderAnnounce } from "@onatili/shared";
import type { Job, Queue } from "bullmq";
import type { NotifyJob } from "../notify/notify.service";
import type { TgResult } from "../notify/telegram";
import { readAudience, resolveAudience } from "./audience";

export const ANNOUNCE_QUEUE = "announce";
export interface AnnounceJob {
  announcementId: string;
}

type Content = Pick<Announcement, "text" | "photoFileId" | "buttonText" | "buttonUrl" | "silent">;

/** Bitta oluvchi uchun Telegram ishi: {ism} qo'yiladi, "app:/..." tugmasi ilovani ochadi */
export function buildJob(a: Content, chatId: bigint, name: string, appUrl: string | undefined, prefix = ""): NotifyJob {
  const text = prefix + renderAnnounce(a.text, { name });
  const job: NotifyJob = { chatId: String(chatId), text, extra: { photo: a.photoFileId ?? undefined, silent: a.silent } };
  if (a.buttonText && a.buttonUrl) {
    if (a.buttonUrl.startsWith("app:")) {
      if (appUrl) job.button = { text: a.buttonText, webAppUrl: `${appUrl}${a.buttonUrl.slice(4)}` };
    } else job.extra!.link = { text: a.buttonText, url: a.buttonUrl };
  }
  return job;
}

/**
 * Rejalashtirilgan (yoki «hozir») e'lonni tarqatadi: auditoriyani shu paytdagi holatda aniqlaydi,
 * har bir oluvchi uchun yozuv ochadi va Telegram navbatiga qo'yadi. Ikki marta ishlasa ham bir marta yuboradi.
 */
export async function runAnnouncement(prisma: PrismaClient, notify: Pick<Queue<NotifyJob>, "addBulk">, appUrl: string | undefined, id: string) {
  const claimed = await prisma.announcement.updateMany({ where: { id, status: "SCHEDULED" }, data: { status: "SENT", sentAt: new Date() } });
  if (!claimed.count) return 0;
  const a = await prisma.announcement.findUniqueOrThrow({ where: { id } });
  const targets = (await resolveAudience(prisma, readAudience(a.audience))).filter((t) => t.chatId !== null);
  await prisma.announcementRecipient.createMany({
    data: targets.map((t) => ({ announcementId: id, userId: t.userId, chatId: t.chatId!, role: t.role })),
    skipDuplicates: true,
  });
  return enqueuePending(prisma, notify, appUrl, a);
}

/** PENDING holatdagi oluvchilarni navbatga qo'yish (birinchi tarqatish va «qayta yuborish») */
export async function enqueuePending(prisma: PrismaClient, notify: Pick<Queue<NotifyJob>, "addBulk">, appUrl: string | undefined, a: Announcement) {
  const rows = await prisma.announcementRecipient.findMany({
    where: { announcementId: a.id, status: "PENDING" },
    select: { id: true, chatId: true, user: { select: { firstName: true } } },
  });
  for (let i = 0; i < rows.length; i += 500) {
    await notify.addBulk(rows.slice(i, i + 500).map((r) => ({ name: "send", data: { ...buildJob(a, r.chatId, r.user.firstName, appUrl), recipientId: r.id } })));
  }
  return rows.length;
}

/** Telegram javobini e'lon oluvchisi yozuviga yozish (worker chaqiradi) */
export async function recordDelivery(prisma: PrismaClient, job: Pick<Job<NotifyJob>, "data">, r: TgResult) {
  const id = job.data.recipientId;
  if (!id) return;
  if (job.data.deleteMessageId) {
    // 400: xabar allaqachon o'chirilgan yoki 48 soat o'tgan — qayta urinish befoyda
    if (r.ok || r.status === 400) await prisma.announcementRecipient.update({ where: { id }, data: { deletedAt: new Date() } }).catch(() => {});
    return;
  }
  const data = r.ok
    ? { status: "SENT" as const, messageId: r.messageId ?? null, sentAt: new Date(), error: null }
    : { status: r.status === 403 ? ("BLOCKED" as const) : ("FAILED" as const), error: (r.description ?? `HTTP ${r.status}`).slice(0, 300) };
  await prisma.announcementRecipient.update({ where: { id }, data }).catch(() => {});
}

/** Barcha urinishlar tugab, baribir yuborilmadi */
export async function recordFinalFailure(prisma: PrismaClient, job: Job<NotifyJob> | undefined, err: Error) {
  if (!job?.data.recipientId || job.data.deleteMessageId) return;
  if (job.attemptsMade < (job.opts.attempts ?? 1)) return;
  await prisma.announcementRecipient
    .update({ where: { id: job.data.recipientId }, data: { status: "FAILED", error: err.message.replace(/bot\d+:[\w-]+/g, "bot***").slice(0, 300) } })
    .catch(() => {});
}
