import { request } from "node:https";

/**
 * Telegram Bot API'ga xabar yuborish. IPv4 majburiy: serverda IPv6 ishlamaydi,
 * Node'ning standart fetch'i esa avval IPv6 bilan urinib, osilib qoladi.
 */
export function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  button?: { text: string; webAppUrl: string },
  keyboard?: { text: string; data: string }[][],
): Promise<{ ok: boolean; status: number; description?: string; retryAfter?: number }> {
  const body = JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, web_app: { url: button.webAppUrl } }]] } } : {}),
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) } } : {}),
  });
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "api.telegram.org",
        path: `/bot${botToken}/sendMessage`,
        method: "POST",
        family: 4,
        timeout: 15_000,
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(data) as { ok: boolean; description?: string; parameters?: { retry_after?: number } };
            resolve({ ok: j.ok, status: res.statusCode ?? 0, description: j.description, retryAfter: j.parameters?.retry_after });
          } catch {
            resolve({ ok: false, status: res.statusCode ?? 0, description: "bad response" });
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Telegram timeout")));
    req.on("error", reject);
    req.end(body);
  });
}

/** HTML parse_mode uchun matnni xavfsiz qilish */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Ovozli xabar (OGG/Opus) yuborish: multipart/form-data, IPv4 */
export function sendTelegramVoice(
  botToken: string,
  chatId: string,
  voice: Buffer,
  opts: { caption?: string; durationSec?: number } = {},
): Promise<{ ok: boolean; status: number; description?: string; retryAfter?: number }> {
  const boundary = `----onatili${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const field = (name: string, value: string) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  const parts = [
    field("chat_id", chatId),
    ...(opts.caption ? [field("caption", opts.caption), field("parse_mode", "HTML")] : []),
    ...(opts.durationSec ? [field("duration", String(opts.durationSec))] : []),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="voice"; filename="izoh.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`),
    voice,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  const body = Buffer.concat(parts);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "api.telegram.org",
        path: `/bot${botToken}/sendVoice`,
        method: "POST",
        family: 4,
        timeout: 60_000,
        headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": body.length },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(data) as { ok: boolean; description?: string; parameters?: { retry_after?: number } };
            resolve({ ok: j.ok, status: res.statusCode ?? 0, description: j.description, retryAfter: j.parameters?.retry_after });
          } catch {
            resolve({ ok: false, status: res.statusCode ?? 0, description: "bad response" });
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Telegram timeout")));
    req.on("error", reject);
    req.end(body);
  });
}
