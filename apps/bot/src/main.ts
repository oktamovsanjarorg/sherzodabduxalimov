import { Agent } from "node:https";
import { internalKey } from "@onatili/shared/server";
import { Bot, InlineKeyboard, Keyboard } from "grammy";

// Serverda IPv6 ishlamaydi (ENETUNREACH), standart ulanish esa ETIMEDOUT bilan osilib qoladi.
// Shuning uchun Telegram API'ga faqat IPv4 orqali ulanamiz.
const ipv4Agent = new Agent({ keepAlive: true, family: 4 });

const token = process.env.BOT_TOKEN;
const miniAppUrl = process.env.MINIAPP_URL;
if (!token) throw new Error("BOT_TOKEN kerak");
if (!miniAppUrl?.startsWith("https://")) throw new Error("MINIAPP_URL https:// bilan boshlanishi kerak");

const apiUrl = (process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4100/api").replace(/\/$/, "");
const bot = new Bot(token, { client: { baseFetchConfig: { agent: ipv4Agent } } });

const openAppKeyboard = () => new InlineKeyboard().webApp("📚 Ilovani ochish", miniAppUrl);

// ---------------- Ota-onani ulash ----------------

const contactKeyboard = (text: string) => new Keyboard().requestContact(text).resized().oneTime();

async function internal<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${apiUrl}/internal/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-key": internalKey(token!) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as T;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fromOf = (f: { id: number; username?: string; first_name: string; last_name?: string }) => ({
  id: f.id,
  username: f.username,
  first_name: f.first_name,
  last_name: f.last_name,
});

bot.command("start", async (ctx) => {
  const payload = ctx.match?.trim() ?? "";
  if (ctx.chat.type !== "private" || !ctx.from) return;

  // Ota-ona: o'quvchi yuborgan havola orqali keldi
  const m = /^p_([0-9A-Fa-f]{8})$/.exec(payload);
  if (m) {
    // Kod bazada saqlanadi: bot qayta ishga tushsa (har deploy) ham ota-ona keyinroq raqam ulashishi mumkin
    let status: string;
    try {
      ({ status } = await internal<{ status: string }>("parent-pending", { from: fromOf(ctx.from), code: m[1] }));
    } catch (e) {
      console.error("parent-pending:", redact(e));
      await ctx.reply("Hozir ulab bo'lmadi, birozdan keyin havolani qayta oching.");
      return;
    }
    if (status === "self") {
      await ctx.reply("Bu sizning shaxsiy havolangiz. Uni ota-onangizga yuboring: ular bosib, o'z raqamini ulashadi.", { reply_markup: openAppKeyboard() });
      return;
    }
    if (status !== "ok") {
      await ctx.reply("Havola noto'g'ri yoki eskirgan. Farzandingizdan havolani qayta yuborishini so'rang.");
      return;
    }
    await ctx.reply(
      "Assalomu alaykum! 👋\n\nFarzandingiz sizni ota-onasi sifatida ulamoqchi. Ulangandan keyin farzandingizning darsdagi davomati haqidagi xabarlar shu yerga keladi.\n\n" +
        "Tasdiqlash uchun pastdagi tugma orqali <b>o'z telefon raqamingizni</b> ulashing. Ustoz yoki yordamchi raqamingizni tekshirib tasdiqlaydi.",
      { parse_mode: "HTML", reply_markup: contactKeyboard("📱 Raqamni ulashish") },
    );
    return;
  }

  // O'quvchi: ustoz qo'lda kiritgan, shaxsiy havola orqali keldi
  const sm = /^s_([A-Za-z0-9_-]{6,16})$/.exec(payload);
  if (sm) {
    try {
      const r = await internal<{ status: string; name?: string; groupName?: string }>("claim-student", { code: sm[1], from: fromOf(ctx.from) });
      const msg: Record<string, string> = {
        claimed: `✅ Xush kelibsiz, <b>${esc(r.name ?? "")}</b>!${r.groupName ? ` Siz <b>${esc(r.groupName)}</b> guruhidasiz.` : ""}\n\nIlovani oching: darslar, testlar va natijalaringiz shu yerda.`,
        used: "Bu havola boshqa Telegram hisobiga bog'langan. Xato bo'lsa, ustozga yozing.",
        staff: "Siz xodimsiz: bu havola o'quvchi uchun.",
        parent: "Siz ota-ona sifatida ulangansiz: bu havola o'quvchi uchun. Uni farzandingizga yuboring.",
        invalid: "Havola eskirgan. Ustozdan yangisini so'rang.",
      };
      await ctx.reply(msg[r.status] ?? msg.invalid, { parse_mode: "HTML", reply_markup: r.status === "claimed" ? openAppKeyboard() : undefined });
    } catch (e) {
      console.error("claim-student:", redact(e));
      await ctx.reply("Hozir bog'lab bo'lmadi, birozdan keyin havolani qayta bosing.");
    }
    return;
  }

  // O'quvchi: o'z raqamini ulashish (Mini App'dan zaxira yo'l)
  if (payload === "phone") {
    await ctx.reply("Telefon raqamingizni ulashish uchun pastdagi tugmani bosing 👇", {
      reply_markup: contactKeyboard("📱 Raqamimni ulashish"),
    });
    return;
  }

  // Botga kirgan har bir kishi admin panelda ko'rinadi. Xato bo'lsa ham salomlashuv chiqadi
  await internal("visit", fromOf(ctx.from)).catch((e) => console.error("visit:", redact(e)));

  const name = ctx.from?.first_name ?? "";
  await ctx.reply(
    `Assalomu alaykum, ${name}!\n\n` +
      "Ona tili va adabiyot bo'yicha darslar, mavzulashtirilgan testlar va milliy sertifikat " +
      "formatidagi mock imtihonlar shu yerda.\n\nBoshlash uchun pastdagi tugmani bosing 👇",
    { reply_markup: openAppKeyboard() },
  );
});

// Admin panelga kirish: faqat xodimlar uchun, faqat shaxsiy chatda. Havola 5 daqiqa amal qiladi va bir marta ishlaydi.
bot.command("admin", async (ctx) => {
  if (ctx.chat.type !== "private" || !ctx.from) return;
  try {
    const { url } = await internal<{ url: string | null }>("admin-login-link", fromOf(ctx.from));
    if (!url) {
      await ctx.reply("Admin panel faqat ustoz va yordamchilar uchun.");
      return;
    }
    await ctx.reply("🔐 Admin panelga kirish havolasi.\n\nHavola 5 daqiqa amal qiladi va faqat bir marta ishlaydi. Uni hech kimga yubormang.", {
      reply_markup: new InlineKeyboard().url("Admin panelni ochish", url),
    });
  } catch (e) {
    console.error("admin link:", redact(e));
    await ctx.reply("Hozir havola yaratib bo'lmadi, birozdan keyin urinib ko'ring.");
  }
});

// Kontakt keldi: ota-ona ulanishi yoki foydalanuvchining o'z raqami
bot.on("message:contact", async (ctx) => {
  const c = ctx.message.contact;
  const from = ctx.from;
  const done = { reply_markup: { remove_keyboard: true as const } };
  // Faqat o'z kontakti: boshqaning kontaktini forward qilish qabul qilinmaydi
  if (!c.user_id || c.user_id !== from.id) {
    await ctx.reply("Iltimos, boshqa odamning kontaktini emas, pastdagi tugma orqali o'z raqamingizni ulashing.");
    return;
  }
  try {
    const pending = await internal<{ code: string | null; expired?: boolean }>("parent-pending/take", { telegramId: from.id });
    if (pending.expired) {
      await ctx.reply("Havola muddati o'tgan (24 soat). Farzandingizdan havolani qayta yuborishini so'rang va uni qaytadan oching.", done);
      return;
    }
    if (pending.code) {
      const r = await internal<{ status: string; studentName?: string; linkStatus?: string }>("parent-link", {
        code: pending.code,
        from: fromOf(from),
        contact: { phone_number: c.phone_number, user_id: c.user_id },
      });
      const msg: Record<string, string> = {
        created: `✅ So'rov yuborildi. Siz <b>${esc(r.studentName ?? "")}</b>ning ota-onasi sifatida ulanyapsiz.

Ustoz yoki yordamchi tasdiqlagach, sizga xabar keladi.`,
        exists:
          r.linkStatus === "APPROVED"
            ? "Siz allaqachon ulangansiz va tasdiqlangansiz ✅"
            : "So'rovingiz allaqachon yuborilgan, tasdiqlanishini kuting ⏳",
        invalid_code: "Havola noto'g'ri yoki eskirgan. Farzandingizdan havolani qayta yuborishini so'rang.",
        self: "Bu sizning shaxsiy havolangiz. Uni ota-onangizga yuboring: o'zingizni ulab bo'lmaydi.",
        limit: "Bu o'quvchiga allaqachon 2 ta ota-ona ulangan.",
        rejected_before: "Avvalgi so'rovingiz rad etilgan. Savollar bo'lsa, ustozga murojaat qiling.",
        not_own_contact: "Iltimos, o'z raqamingizni ulashing.",
      };
      await ctx.reply(msg[r.status] ?? "Xatolik yuz berdi", { parse_mode: "HTML", ...done });
      return;
    }
    const r = await internal<{ status: string }>("user-phone", { from: fromOf(from), contact: { phone_number: c.phone_number, user_id: c.user_id } });
    const ok = r.status === "saved" || r.status === "merged";
    const text =
      r.status === "merged"
        ? "✅ Raqamingiz saqlandi. Ustoz sizni ro'yxatga kiritgan ekan: guruhingiz, davomat va to'lovlaringiz hisobingizga bog'landi. Ilovaga qaytishingiz mumkin."
        : ok
          ? "✅ Raqamingiz saqlandi. Ilovaga qaytishingiz mumkin."
          : "Iltimos, o'z raqamingizni ulashing.";
    await ctx.reply(text, { ...done, ...(ok ? { reply_markup: openAppKeyboard() } : {}) });
  } catch (e) {
    console.error("contact:", redact(e));
    await ctx.reply("Hozir saqlab bo'lmadi, birozdan keyin qayta urinib ko'ring.", done);
  }
});

// Ustozga kelgan xabardagi tugmalar. Kim bosganini API tekshiradi
interface ReviewReply {
  toast: string;
  alert?: boolean;
  result?: string;
  keyboard?: { text: string; data: string }[][] | null;
}

bot.on("callback_query:data", async (ctx) => {
  try {
    const r = await internal<ReviewReply>("review", { telegramId: ctx.from.id, data: ctx.callbackQuery.data });
    await ctx.answerCallbackQuery({ text: r.toast || undefined, show_alert: r.alert });
    const message = ctx.callbackQuery.message;
    if (r.result && message?.text) {
      await ctx.editMessageText(`${message.text}\n\n${r.result}`, { entities: message.entities });
    } else if (r.keyboard !== undefined) {
      const rows = r.keyboard?.map((row) => row.map((b) => InlineKeyboard.text(b.text, b.data)));
      await ctx.editMessageReplyMarkup({ reply_markup: rows ? InlineKeyboard.from(rows) : undefined });
    }
  } catch (e) {
    console.error("review:", redact(e));
    await ctx.answerCallbackQuery({ text: "Hozir bajarib bo'lmadi, admin paneldan urinib ko'ring.", show_alert: true }).catch(() => {});
  }
});

bot.command("help", (ctx) =>
  ctx.reply("Savollar bo'lsa, ustozning yordamchisiga yozing. Ilovani ochish uchun /start bosing."),
);

// Xato xabarlarida URL bilan birga bot tokeni chiqmasligi uchun uni yashiramiz
const redact = (e: unknown) => String(e instanceof Error ? e.message : e).replace(/bot\d+:[\w-]+/g, "bot***");

bot.catch((err) => console.error("Bot xatosi:", redact(err.error)));

async function main() {
  // Chat pastidagi "menu" tugmasini ham Mini App'ga bog'laymiz
  await bot.api.setChatMenuButton({
    menu_button: { type: "web_app", text: "Ilova", web_app: { url: miniAppUrl! } },
  });
  await bot.api.setMyCommands([
    { command: "start", description: "Boshlash" },
    { command: "help", description: "Yordam" },
  ]);
  await bot.start({ onStart: (me) => console.log(`Bot ishga tushdi: @${me.username}`) });
}

main().catch((e) => {
  console.error("Bot ishga tushmadi:", redact(e));
  process.exit(1);
});
