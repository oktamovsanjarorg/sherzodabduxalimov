import { request } from "node:https";

/**
 * Google Gemini: qo'lyozma varoq rasmlarini matnga aylantiradi (OCR).
 * Kalit aistudio.google.com dan bepul olinadi. IPv4 majburiy: serverda IPv6 ishlamaydi.
 */
function call(method: "GET" | "POST", path: string, apiKey: string, body?: object, timeoutMs = 120_000): Promise<{ status: number; json: any }> {
  const data = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "generativelanguage.googleapis.com",
        path,
        method,
        family: 4,
        timeout: timeoutMs,
        headers: { "x-goog-api-key": apiKey, ...(data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) } : {}) },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, json: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode ?? 0, json: null });
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Gemini timeout")));
    req.on("error", reject);
    req.end(data);
  });
}

export const OCR_PROMPT = `Bu rasmlarda o'quvchining qo'lda (ruchka bilan) yozgan o'zbek tilidagi essesi bor. Varoqlar tartib bilan berilgan.
Vazifang: matnni AYNAN yozilganidek, so'zma-so'z ko'chirib ber.
- Imlo, tinish belgisi va grammatik xatolarni TUZATMA: ular baholanadi, o'quvchi qanday yozgan bo'lsa shunday qoldir.
- Lotin yozuvida yoz (o', g', sh, ch belgilarini o'quvchi yozgandek).
- Xatboshilarni saqla. O'chirilgan (ustidan chizilgan) so'zlarni yozma.
- O'qib bo'lmaydigan so'z o'rniga [?] qo'y.
- Rasmda esse bo'lmasa, faqat NO_ESSAY deb yoz.
Javobda faqat esse matni bo'lsin, boshqa hech qanday izoh yozma.`;

/** Sozlangan model topilmasa (nomi o'zgargan), mavjud "flash" modellardan birini tanlaydi */
async function pickModel(apiKey: string, preferred: string): Promise<string> {
  const r = await call("GET", "/v1beta/models?pageSize=200", apiKey, undefined, 20_000);
  const models: { name: string; supportedGenerationMethods?: string[] }[] = r.json?.models ?? [];
  const ok = models.filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
  const pick =
    ok.find((m) => m === preferred) ??
    ok.filter((m) => /flash/.test(m) && !/lite|image|tts|live|preview|exp/.test(m)).sort().reverse()[0] ??
    ok.find((m) => /flash/.test(m));
  if (!pick) throw new Error(`Gemini: mos model topilmadi (${r.status})`);
  return pick;
}

/** Asosiy model band (503/429) yoki yo'q (404) bo'lsa, navbatdagi modelga o'tiladi */
const FALLBACK_MODELS = ["gemini-3.7-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash"];
const RETRYABLE = new Set([404, 429, 500, 502, 503, 504]);

const textOf = (j: any): string => (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();

/** Gemini'ga so'rov: band bo'lsa (503/429) yoki model yo'q bo'lsa (404) navbatdagi modelga o'tiladi */
async function generate(apiKey: string, preferred: string, body: object): Promise<string> {
  const tried = new Set<string>();
  let last = "";
  const attempt = async (model: string) => {
    tried.add(model);
    const r = await call("POST", `/v1beta/models/${encodeURIComponent(model)}:generateContent`, apiKey, body, 75_000).catch((e: Error) => ({ status: 504, json: { error: { message: e.message } } }));
    if (r.status === 200) {
      const text = textOf(r.json);
      if (!text) throw new Error(`Gemini bo'sh javob (${r.json?.candidates?.[0]?.finishReason ?? r.json?.promptFeedback?.blockReason ?? "?"})`);
      return text;
    }
    last = `Gemini ${model} ${r.status}: ${r.json?.error?.message ?? "javob yo'q"}`;
    if (!RETRYABLE.has(r.status)) throw new Error(last);
    return null;
  };
  for (const model of [preferred, ...FALLBACK_MODELS]) {
    if (tried.has(model)) continue;
    const text = await attempt(model);
    if (text) return text;
  }
  const picked = await pickModel(apiKey, preferred).catch(() => null);
  if (picked && !tried.has(picked)) {
    const text = await attempt(picked);
    if (text) return text;
  }
  throw new Error(last);
}

const imageParts = (images: { mime: string; data: Buffer }[]) => images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.data.toString("base64") } }));

export async function transcribeHandwriting(opts: { apiKey: string; model: string; images: { mime: string; data: Buffer }[] }): Promise<string> {
  return generate(opts.apiKey, opts.model, {
    contents: [{ parts: [...imageParts(opts.images), { text: OCR_PROMPT }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 8192 },
  });
}

export interface LocatedPhrase {
  /** So'rovdagi tartib raqami */
  i: number;
  /** Varoq (0 dan) */
  page: number;
  /** [ymin, xmin, ymax, xmax], 0..1000 (Gemini formati) */
  box: [number, number, number, number];
}

/**
 * Xato so'z/iboralarning qo'lyozma varoqdagi joyini topadi (AI belgilari uchun).
 * Topilmaganlari javobda bo'lmaydi.
 */
export async function locatePhrases(opts: { apiKey: string; model: string; images: { mime: string; data: Buffer }[]; phrases: string[] }): Promise<LocatedPhrase[]> {
  if (!opts.phrases.length) return [];
  const list = opts.phrases.map((p, i) => `${i}: "${p}"`).join("\n");
  const prompt = `Rasmlarda o'quvchining qo'lda yozgan o'zbekcha essesi bor (${opts.images.length} ta varoq, tartib bilan, 0 dan boshlab).
Quyidagi so'z yoki iboralarning har birini qo'lyozmadan top (xatolari bilan yozilgan bo'lishi mumkin, aynan shunday qidir):
${list}
Har biri uchun bitta joy: matndagi BIRINCHI uchragan o'rni. Ramka faqat shu so'z(lar)ni qamrab olsin, butun qatorni emas.
Javob faqat JSON massiv: [{"i": 0, "page": 0, "box_2d": [ymin, xmin, ymax, xmax]}] — koordinatalar 0..1000 (shu varoq o'lchamiga nisbatan).
Topa olmaganingni javobga kiritma.`;
  const raw = await generate(opts.apiKey, opts.model, {
    contents: [{ parts: [...imageParts(opts.images), { text: prompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: "application/json" },
  });
  let arr: unknown;
  try {
    arr = JSON.parse(raw.replace(/^```(json)?|```$/g, "").trim());
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: LocatedPhrase[] = [];
  for (const x of arr as { i?: unknown; page?: unknown; box_2d?: unknown }[]) {
    const b = x.box_2d;
    if (typeof x.i !== "number" || !Array.isArray(b) || b.length !== 4 || !b.every((v) => typeof v === "number" && v >= 0 && v <= 1000)) continue;
    const page = typeof x.page === "number" ? x.page : 0;
    if (x.i < 0 || x.i >= opts.phrases.length || page < 0 || page >= opts.images.length) continue;
    const [ymin, xmin, ymax, xmax] = b as number[];
    if (ymax <= ymin || xmax <= xmin) continue;
    out.push({ i: x.i, page, box: [ymin, xmin, ymax, xmax] });
  }
  return out;
}
