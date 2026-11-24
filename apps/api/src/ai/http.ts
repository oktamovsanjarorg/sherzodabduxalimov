import { request } from "node:https";

export interface HttpReply {
  status: number;
  json: unknown;
}

/** AI provayderiga JSON so'rov. IPv4 majburiy: serverda IPv6 ishlamaydi. Javob JSON bo'lmasa — json: null. */
export function postJson(host: string, path: string, apiKey: string, body: object, timeoutMs: number): Promise<HttpReply> {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host,
        path,
        method: "POST",
        family: 4,
        timeout: timeoutMs,
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data), authorization: `Bearer ${apiKey}` },
      },
      (res) => {
        // Bo'laklar bayt bo'yicha yig'iladi: satrga alohida o'girilsa, bo'lak chegarasidagi harf (’, o‘) buziladi
        const parts: Buffer[] = [];
        res.on("data", (c: Buffer) => parts.push(c));
        res.on("error", reject);
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          try {
            resolve({ status, json: JSON.parse(Buffer.concat(parts).toString("utf8")) });
          } catch {
            resolve({ status, json: null });
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("AI timeout")));
    req.on("error", reject);
    req.end(data);
  });
}

/** Vaqtincha xato: bir marta qayta urinishga arziydi */
export const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
