import { request } from "node:https";

export type TgResult = { ok: boolean; status: number; description?: string; retryAfter?: number; messageId?: number; fileId?: string; filePath?: string };
export type TgExtra = {
  /** Telegram file_id: rasm osti matni bilan yuboriladi */
  photo?: string;
  /** Oddiy havola tugmasi (https) */
  link?: { text: string; url: string };
  /** Bildirishnoma tovushisiz */
  silent?: boolean;
};

/** Bot API javobini o'qish: xabar id'si va (rasm bo'lsa) eng katta o'lchamdagi file_id */
function readResult(status: number, data: string): TgResult {
  try {
    const j = JSON.parse(data) as {
      ok: boolean;
      description?: string;
      parameters?: { retry_after?: number };
      result?: { message_id?: number; photo?: { file_id: string }[]; file_path?: string } | true;
    };
    const r = typeof j.result === "object" ? j.result : undefined;
    return { ok: j.ok, status, description: j.description, retryAfter: j.parameters?.retry_after, messageId: r?.message_id, fileId: r?.photo?.at(-1)?.file_id, filePath: r?.file_path };
  } catch {
    return { ok: false, status, description: "bad response" };
  }
}

/** Bot API metodini chaqirish. IPv4 majburiy: serverda IPv6 ishlamaydi, Node'ning standart fetch'i esa avval IPv6 bilan urinib, osilib qoladi. */
function tgCall(botToken: string, method: string, body: Buffer | string, contentType = "application/json", timeout = 15_000): Promise<TgResult> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "api.telegram.org",
        path: `/bot${botToken}/${method}`,
        method: "POST",
        family: 4,
        timeout,
        headers: { "content-type": contentType, "content-length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(readResult(res.statusCode ?? 0, data)));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Telegram timeout")));
    req.on("error", reject);
    req.end(body);
  });
}

/** Xabar yuborish (extra.photo bo'lsa: rasm + matn). Javobda Telegram xabar id'si */
export function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  button?: { text: string; webAppUrl: string },
  keyboard?: { text: string; data: string }[][],
  extra: TgExtra = {},
): Promise<TgResult> {
  const markup = button
    ? { inline_keyboard: [[{ text: button.text, web_app: { url: button.webAppUrl } }]] }
    : keyboard
      ? { inline_keyboard: keyboard.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) }
      : extra.link
        ? { inline_keyboard: [[{ text: extra.link.text, url: extra.link.url }]] }
        : undefined;
  const common = { chat_id: chatId, parse_mode: "HTML", ...(extra.silent ? { disable_notification: true } : {}), ...(markup ? { reply_markup: markup } : {}) };
  if (extra.photo) return tgCall(botToken, "sendPhoto", JSON.stringify({ ...common, photo: extra.photo, caption: text }));
  return tgCall(botToken, "sendMessage", JSON.stringify({ ...common, text, disable_web_page_preview: true }));
}

/** Bot yuborgan xabarni o'chirish (Telegram: 48 soat ichida) */
export function deleteTelegramMessage(botToken: string, chatId: string, messageId: number) {
  return tgCall(botToken, "deleteMessage", JSON.stringify({ chat_id: chatId, message_id: messageId }));
}

function multipart(fields: Record<string, string>, file: { field: string; name: string; mime: string; data: Buffer }) {
  const boundary = `----onatili${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const parts = [
    ...Object.entries(fields).map(([k, v]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: ${file.mime}\r\n\r\n`),
    file.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** Rasmni yuklab yuborish (masalan, ustozning o'ziga namuna). Javobda file_id: keyin shu bilan hammaga yuboriladi */
export function uploadTelegramPhoto(botToken: string, chatId: string, photo: Buffer, mime: string, caption?: string) {
  const m = multipart({ chat_id: chatId, ...(caption ? { caption, parse_mode: "HTML" } : {}) }, { field: "photo", name: "elon.jpg", mime, data: photo });
  return tgCall(botToken, "sendPhoto", m.body, m.contentType, 60_000);
}

/** HTML parse_mode uchun matnni xavfsiz qilish */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Ovozli xabar (OGG/Opus) yuborish: multipart/form-data, IPv4 */
export function sendTelegramVoice(botToken: string, chatId: string, voice: Buffer, opts: { caption?: string; durationSec?: number } = {}): Promise<TgResult> {
  const fields: Record<string, string> = { chat_id: chatId };
  if (opts.caption) Object.assign(fields, { caption: opts.caption, parse_mode: "HTML" });
  if (opts.durationSec) fields.duration = String(opts.durationSec);
  const m = multipart(fields, { field: "voice", name: "izoh.ogg", mime: "audio/ogg", data: voice });
  return tgCall(botToken, "sendVoice", m.body, m.contentType, 60_000);
}

/** Telegram'dagi faylni (file_id bo'yicha) yuklab olish: admin panelda rasmni ko'rsatish uchun. 20 MB gacha */
export async function downloadTelegramFile(botToken: string, fileId: string): Promise<Buffer | null> {
  const f = await tgCall(botToken, "getFile", JSON.stringify({ file_id: fileId }));
  if (!f.ok || !f.filePath) return null;
  return new Promise((resolve, reject) => {
    const req = request({ host: "api.telegram.org", path: `/file/bot${botToken}/${f.filePath}`, method: "GET", family: 4, timeout: 30_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(res.statusCode === 200 ? Buffer.concat(chunks) : null));
    });
    req.on("timeout", () => req.destroy(new Error("Telegram timeout")));
    req.on("error", reject);
    req.end();
  });
}
