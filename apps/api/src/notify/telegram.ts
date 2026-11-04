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
): Promise<{ ok: boolean; status: number; description?: string; retryAfter?: number }> {
  const body = JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, web_app: { url: button.webAppUrl } }]] } } : {}),
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
