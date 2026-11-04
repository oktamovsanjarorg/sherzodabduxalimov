import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@onatili/db";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalize } from "../src/ai/deepseek";
import { ESSAY_AI_QUEUE } from "../src/ai/queue";
import { NO_ESSAY_ERROR, gradeEssayJob, markEssayFailed } from "../src/essays/ai-runner";
import { redisConnection } from "../src/media/queue";
import { NOTIFY_QUEUE, type NotifyJob } from "../src/notify/notify.service";
import { OWNER, createApp, login } from "./helpers";

const prisma = new PrismaClient();
const TG = { owner: 900000901, student: 900000902, other: 900000903 };
const conn = () => redisConnection(process.env.REDIS_URL ?? "redis://localhost:6381");
const notifyQ = new Queue<NotifyJob>(NOTIFY_QUEUE, { prefix: "onatili-e2e", connection: conn() });
const aiQ = new Queue(ESSAY_AI_QUEUE, { prefix: "onatili-e2e", connection: conn() });
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]);
const TEXT = "Kitob insonning eng yaqin do'sti hisoblanadi. ".repeat(10);

async function cleanup() {
  await prisma.user.deleteMany({ where: { telegramId: { in: Object.values(TG).map(BigInt) } } });
}

describe("Esse: AI (bepul) va ustoz (pullik, qo'lyozma) (e2e)", () => {
  let app: NestFastifyApplication;
  let H: Record<string, string>;
  let S: Record<string, string>;
  let saved: { card: unknown; essay: unknown } = { card: null, essay: null };
  const req = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object, headers = H) =>
    app.inject({ method, url: `/api${url}`, headers, payload });
  const img = (url: string, headers = S) => app.inject({ method: "POST", url: `/api${url}`, headers: { ...headers, "content-type": "image/jpeg" }, payload: JPEG });

  beforeAll(async () => {
    const [c, e] = await Promise.all(["billing", "essay"].map((key) => prisma.appSetting.findUnique({ where: { key } })));
    saved = { card: c?.value ?? null, essay: e?.value ?? null };
    await cleanup();
    await notifyQ.obliterate({ force: true });
    await aiQ.obliterate({ force: true });
    // Qo'lyozma oqimi yoqilgan bo'lsin (Gemini chaqirilmaydi: o'qish funksiyasi testda soxta)
    process.env.GEMINI_API_KEY ||= "test-gemini-key";
    app = await createApp();
    H = (await login(app, TG.owner, "Ega", OWNER)).headers;
    S = (await login(app, TG.student, "Madina")).headers;
  });
  afterAll(async () => {
    await cleanup();
    for (const [key, value] of [["billing", saved.card], ["essay", saved.essay]] as const) {
      if (value) await prisma.appSetting.update({ where: { key }, data: { value: value as object } });
      else await prisma.appSetting.deleteMany({ where: { key } });
    }
    await notifyQ.close();
    await aiQ.close();
    await prisma.$disconnect();
    await app?.close();
  });

  it("AI: matn bilan yuboriladi, navbatga tushadi; natija saqlanadi; kuniga 2 ta", async () => {
    const cfg = (await req("GET", "/essays/config", undefined, S)).json();
    expect(cfg).toMatchObject({ aiDailyLimit: 2, aiUsedToday: 0 });
    if (!cfg.aiEnabled) return; // DeepSeek kaliti yo'q muhit (CI): AI qismi o'tkazib yuboriladi

    expect((await req("POST", "/essays", { mode: "AI", prompt: "Kitob", text: "juda qisqa" }, S)).statusCode).toBe(400);
    const e = (await req("POST", "/essays", { mode: "AI", prompt: "Kitob - bilim manbai", text: TEXT }, S)).json();
    expect(e).toMatchObject({ status: "AI_CHECKING", mode: "AI" });
    expect(await aiQ.getJob(e.id)).toBeTruthy();

    // Worker o'rnida: soxta AI javobi (ball maksimumdan oshsa qisqaradi, bir xil "xato"lar tashlanadi)
    const fake = normalize({
      criteria: [{ key: "topic", score: 9, comment: "Mos" }, { key: "spelling", score: 4.3, comment: null }],
      feedback: "Yaxshi",
      mistakes: [{ wrong: "dust", right: "do'st", note: null }, { wrong: "kitob", right: "Kitob", note: null }],
    });
    const sent: string[] = [];
    const total = await gradeEssayJob(prisma, e.id, async () => fake, async (_c, t) => void sent.push(t), undefined);
    expect(total).toBe(4 + 4.5);
    const d = (await req("GET", `/essays/${e.id}`, undefined, S)).json();
    expect(d.status).toBe("AI_CHECKED");
    expect(d.reviews[0]).toMatchObject({ source: "AI", totalScore: 8.5, maxScore: 24, feedback: "Yaxshi" });
    expect(d.reviews[0].mistakes).toEqual([{ wrong: "dust", right: "do'st", note: null }]);
    expect(sent[0]).toContain("8.5 / 24");

    // Muvaffaqiyatsiz bo'lsa limitga hisoblanmaydi va qayta urinish mumkin
    const f = (await req("POST", "/essays", { mode: "AI", prompt: "Ikkinchi", text: TEXT }, S)).json();
    await markEssayFailed(prisma, f.id, "timeout");
    expect((await req("GET", "/essays/config", undefined, S)).json().aiUsedToday).toBe(1);
    expect((await req("POST", `/essays/${f.id}/retry`, undefined, S)).json().status).toBe("AI_CHECKING");

    expect((await req("POST", "/essays", { mode: "AI", prompt: "Uchinchi", text: TEXT }, S)).statusCode).toBe(409); // 2 ta ishlatildi
    expect((await req("GET", "/essays", undefined, S)).json()).toHaveLength(2);
  });

  it("AI qo'lyozma: varoq rasmlari -> o'qiladi (xatolari bilan) -> baholanadi; rasmda esse bo'lmasa xabar", async () => {
    const cfg = (await req("GET", "/essays/config", undefined, S)).json();
    if (!cfg.aiEnabled) return;
    expect(cfg.aiPhotoEnabled).toBe(true);
    // Oldingi testda 2 ta limit ishlatildi: bugungilarni "kecha"ga suramiz
    await prisma.essay.updateMany({ where: { user: { telegramId: BigInt(TG.student) } }, data: { createdAt: new Date(Date.now() - 2 * 86_400_000) } });

    const e = (await req("POST", "/essays", { mode: "AI", prompt: "Ona tilim — faxrim" }, S)).json();
    expect(e).toMatchObject({ status: "DRAFT", mode: "AI", pages: 0 });
    await img(`/essays/${e.id}/pages`);
    await img(`/essays/${e.id}/pages`);
    expect((await req("POST", `/essays/${e.id}/finish`, undefined, S)).json().status).toBe("AI_CHECKING");
    expect((await req("GET", "/essays/config", undefined, S)).json().aiUsedToday).toBe(1);

    const readPaths: string[][] = [];
    const handwrittenFlags: boolean[] = [];
    const read = async (p: string[]) => (readPaths.push(p), "Ona tilim mening faxrim. Men uni sevaman va [?] asrayman. ".repeat(5));
    const grade = async (_t: string, _x: string, hw: boolean) => (handwrittenFlags.push(hw), normalize({ criteria: [{ key: "topic", score: 3, comment: null }], feedback: "", mistakes: [] }));
    expect(await gradeEssayJob(prisma, e.id, grade, async () => {}, undefined, read)).toBe(3);
    expect(readPaths[0]).toHaveLength(2);
    expect(handwrittenFlags).toEqual([true]);
    const d = (await req("GET", `/essays/${e.id}`, undefined, S)).json();
    expect(d).toMatchObject({ status: "AI_CHECKED", pages: 2 });
    expect(d.text).toContain("[?] asrayman"); // o'qilgan matn ko'rinadi

    // Rasmda esse yo'q
    const n = (await req("POST", "/essays", { mode: "AI", prompt: "Bo'sh varoq" }, S)).json();
    await img(`/essays/${n.id}/pages`);
    await req("POST", `/essays/${n.id}/finish`, undefined, S);
    expect(await gradeEssayJob(prisma, n.id, grade, async () => {}, undefined, async () => "NO_ESSAY")).toBeNull();
    const nd = (await req("GET", `/essays/${n.id}`, undefined, S)).json();
    expect(nd).toMatchObject({ status: "AI_FAILED", error: NO_ESSAY_ERROR });
    expect((await req("GET", "/essays/config", undefined, S)).json().aiUsedToday).toBe(1); // hisoblanmadi
  });

  it("ustoz: narx va karta sozlanmaguncha yopiq; rasmlar, to'lov, tasdiq, baholash", async () => {
    await prisma.appSetting.deleteMany({ where: { key: "essay" } });
    expect((await req("POST", "/essays", { mode: "TEACHER", prompt: "Vatan" }, S)).statusCode).toBe(409);
    // Xodim narx kiritilmagan bo'lsa ham sinab ko'ra oladi: to'lovsiz ustoz navbatiga
    expect((await req("GET", "/essays/config")).json().staffPreview).toBe(true);
    const se = (await req("POST", "/essays", { mode: "TEACHER", prompt: "Sinov" })).json();
    await img(`/essays/${se.id}/pages`, H);
    expect((await req("POST", `/essays/${se.id}/finish`)).json().status).toBe("SUBMITTED");
    await prisma.essay.delete({ where: { id: se.id } });
    await req("PUT", "/admin/billing-settings", { number: "8600 1234 5678 9012", holder: "Sherzod Abduxalimov" });
    expect((await req("PUT", "/admin/essay-settings", { priceUzs: 25000 })).statusCode).toBe(200);
    expect((await req("GET", "/essays/config", undefined, S)).json().teacherPriceUzs).toBe(25000);

    const e = (await req("POST", "/essays", { mode: "TEACHER", prompt: "Vatan tuyg'usi" }, S)).json();
    expect(e).toMatchObject({ status: "DRAFT", priceUzs: 25000, pages: 0 });
    expect((await req("POST", `/essays/${e.id}/finish`, undefined, S)).statusCode).toBe(400); // rasm yo'q
    await img(`/essays/${e.id}/pages`);
    expect((await img(`/essays/${e.id}/pages`)).json().pages).toBe(2);
    expect((await req("DELETE", `/essays/${e.id}/pages/1`, undefined, S)).json().pages).toBe(1);

    // Rasmni egasi va xodim ko'radi, begona ko'rmaydi
    expect((await req("GET", `/essays/${e.id}/pages/0`, undefined, S)).rawPayload.equals(JPEG)).toBe(true);
    expect((await req("GET", `/essays/${e.id}/pages/0`)).statusCode).toBe(200);
    const O = (await login(app, TG.other, "Begona")).headers;
    expect((await req("GET", `/essays/${e.id}/pages/0`, undefined, O)).statusCode).toBe(403);
    expect((await req("GET", `/essays/${e.id}`, undefined, O)).statusCode).toBe(404);

    expect((await req("POST", `/essays/${e.id}/finish`, undefined, S)).json().status).toBe("AWAITING_PAYMENT");
    expect((await img(`/essays/${e.id}/pages`)).statusCode).toBe(409); // yuborilgandan keyin qo'shib bo'lmaydi

    // To'lov: chek -> rad -> qayta chek -> tasdiq
    expect((await img(`/billing/payments?essayId=${e.id}`)).statusCode).toBe(201);
    expect((await img(`/billing/payments?essayId=${e.id}`)).statusCode).toBe(409);
    let p = (await req("GET", "/admin/payments?status=PENDING")).json().find((x: { essay: { id: string } | null }) => x.essay?.id === e.id);
    expect(p).toMatchObject({ amountUzs: 25000, plan: null, essay: { prompt: "Vatan tuyg'usi" } });
    await req("POST", `/admin/payments/${p.id}/reject`, { reason: "Summa to'liq emas" });
    expect((await req("GET", `/essays/${e.id}`, undefined, S)).json().payment).toMatchObject({ status: "REJECTED" });
    await img(`/billing/payments?essayId=${e.id}`);
    p = (await req("GET", "/admin/payments?status=PENDING")).json().find((x: { essay: { id: string } | null }) => x.essay?.id === e.id);
    expect((await req("POST", `/admin/payments/${p.id}/approve`)).json()).toEqual({ ok: true, endsAt: null });
    expect((await req("GET", "/me", undefined, S)).json().subscription).toBeNull(); // obuna berilmaydi
    expect((await req("GET", `/essays/${e.id}`, undefined, S)).json().status).toBe("SUBMITTED");

    // Ustoz navbati va baholash
    const q = (await req("GET", "/admin/hw-essays?status=pending")).json();
    expect(q.find((x: { id: string }) => x.id === e.id)).toMatchObject({ pages: 1, student: { name: "Madina" } });
    expect((await req("POST", `/admin/hw-essays/${e.id}/review`, { criteria: [{ key: "topic", score: 4 }] }, S)).statusCode).toBe(403);
    const r = (
      await req("POST", `/admin/hw-essays/${e.id}/review`, {
        criteria: [{ key: "topic", score: 4 }, { key: "content", score: 10, comment: "Dalillar yaxshi" }, { key: "spelling", score: 3.5 }],
        feedback: "Barakalla",
      })
    ).json();
    expect(r).toEqual({ totalScore: 4 + 6 + 3.5 });
    const d = (await req("GET", `/essays/${e.id}`, undefined, S)).json();
    expect(d).toMatchObject({ status: "REVIEWED", score: { total: 13.5, max: 24 } });
    expect(d.reviews.find((x: { source: string }) => x.source === "TEACHER")).toMatchObject({ feedback: "Barakalla", reviewer: "Ega" });
    const texts = (await notifyQ.getJobs(["waiting", "delayed"])).map((j) => j.data.text);
    expect(texts.some((t) => t.includes("ustozga yuborildi"))).toBe(true);
    expect(texts.some((t) => t.includes("Essengiz tekshirildi") && t.includes("13.5 / 24"))).toBe(true);

    // Baholangan esseni o'chirib bo'lmaydi
    expect((await req("DELETE", `/essays/${e.id}`, undefined, S)).statusCode).toBe(409);
  });
});
