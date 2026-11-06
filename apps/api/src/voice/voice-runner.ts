import type { PrismaClient } from "@onatili/db";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { esc } from "../notify/telegram";

export type SendVoiceFn = (chatId: bigint, ogg: Buffer, caption: string, durationSec: number | null) => Promise<{ ok: boolean; status: number; description?: string }>;

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", fail);
    p.on("close", (code) => (code === 0 ? ok(out) : fail(new Error(`${cmd} ${code}: ${err.slice(-400)}`))));
  });
}

/**
 * Ovozli izohni o'giradi va o'quvchiga yuboradi:
 * - OGG/Opus (mono, 32 kbit/s) — Telegram "voice" xabari faqat shu formatni ovozli xabar sifatida ko'rsatadi;
 * - M4A/AAC (mono, 64 kbit/s) — ilovada iPhone va Android'da bir xil ijro etiladi.
 */
export async function processVoice(prisma: PrismaClient, mediaDir: string, voiceId: string, send: SendVoiceFn) {
  const v = await prisma.voiceNote.findUnique({ where: { id: voiceId } });
  // Tayyor va yuborilgan bo'lsa — ish tugagan. Tayyor, lekin yuborilmagan (Telegram vaqtincha xato bergan) bo'lsa,
  // qayta urinishda o'girish o'tkazib yuboriladi, faqat yuborish takrorlanadi
  if (!v || (v.status === "READY" && v.sentAt)) return null;
  const root = resolve(mediaDir);
  const abs = (rel: string) => {
    const p = resolve(join(root, rel));
    if (!p.startsWith(join(root, "voice") + "/")) throw new Error("bad voice path");
    return p;
  };
  const ogg = `voice/${v.id}.ogg`;
  const m4a = `voice/${v.id}.m4a`;
  let durationSec = v.durationSec;
  if (v.status !== "READY") {
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", abs(v.originalPath), "-vn", "-ac", "1", "-c:a", "libopus", "-b:a", "32k", "-application", "voip", abs(ogg)]);
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", abs(v.originalPath), "-vn", "-ac", "1", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", abs(m4a)]);
    const dur = Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", abs(m4a)])).trim());
    durationSec = Number.isFinite(dur) ? Math.max(1, Math.round(dur)) : null;
    await prisma.voiceNote.update({ where: { id: v.id }, data: { oggPath: ogg, m4aPath: m4a, durationSec, status: "READY", error: null } });
  }

  // Kimga va nima haqida
  let chatId: bigint | null = null;
  let about = "";
  if (v.essayId) {
    const e = await prisma.essay.findUnique({ where: { id: v.essayId }, select: { prompt: true, user: { select: { telegramId: true } } } });
    chatId = e?.user.telegramId ?? null;
    about = e ? `«${esc(e.prompt.slice(0, 80))}» essesi` : "esse";
  } else if (v.attemptId) {
    const a = await prisma.attempt.findUnique({ where: { id: v.attemptId }, select: { test: { select: { title: true } }, user: { select: { telegramId: true } } } });
    chatId = a?.user.telegramId ?? null;
    about = a ? `«${esc(a.test.title)}» essesi` : "esse";
  }
  if (chatId !== null) {
    const r = await send(chatId, await readFile(abs(ogg)), `🎙 <b>Ustozning ovozli izohi</b>\n${about} bo'yicha`, durationSec);
    if (r.ok) await prisma.voiceNote.update({ where: { id: v.id }, data: { sentAt: new Date() } });
    // 403/400: o'quvchi botni bloklagan — izoh baribir ilovada turadi
    else if (r.status !== 403 && r.status !== 400) throw new Error(`Telegram ${r.status}: ${r.description ?? ""}`);
  }
  return { durationSec };
}

export async function markVoiceFailed(prisma: PrismaClient, voiceId: string, message: string) {
  console.error(`[voice] ${voiceId}: ${message}`);
  await prisma.voiceNote.updateMany({ where: { id: voiceId, status: "PROCESSING" }, data: { status: "FAILED", error: message.slice(0, 500) } });
}
