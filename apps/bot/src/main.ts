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

/** Ota-ona havolani ochgan, kontakt ulashishini kutyapmiz: telegramId -> kod (30 daqiqa) */
const pendingParent = new Map<number, { code: string; at: number }>();
const PENDING_TTL = 30 * 60 * 1000;

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
    pendingParent.set(ctx.from.id, { code: m[1], at: Date.now() });
    await ctx.reply(
      "Assalomu alaykum! 👋\n\nFarzandingiz sizni ota-onasi sifatida ulamoqchi. Ulangandan keyin farzandingizning darsdagi davomati haqidagi xabarlar shu yerga keladi.\n\n" +
        "Tasdiqlash uchun pastdagi tugma orqali <b>o'z telefon raqamingizni</b> ulashing. Ustoz yoki yordamchi raqamingizni tekshirib tasdiqlaydi.",
      { parse_mode: "HTML", reply_markup: contactKeyboard("📱 Raqamni ulashish") },
    );
    return;
  }

  // O'quvchi: offline guruh havolasi orqali keldi
  const g = /^g_([A-Za-z0-9_-]{6,16})$/.exec(payload);
  if (g) {
    try {
      const r = await internal<{ status: string; groupName?: string; parentLinked?: boolean }>("join-group", { code: g[1], from: fromOf(ctx.from) });
      const group = esc(r.groupName ?? "");
      const parentNote = r.parentLinked ? "" : "\n\nIlovani birinchi ochganingizda <b>ota-onangizni ulash</b> so'raladi: bu majburiy.";
      const msg: Record<string, string> = {
        joined: `✅ Siz <b>${group}</b> guruhiga qo'shildingiz!\n\nEndi barcha videodarslar, testlar va mock imtihonlar siz uchun ochiq.${parentNote}`,
        moved: `✅ Siz <b>${group}</b> guruhiga o'tkazildingiz.\n\nBarcha darslar va testlar ochiq.${parentNote}`,
        already: `Siz allaqachon <b>${group}</b> guruhidasiz 👍`,
        staff: `Siz xodimsiz: bu havola o'quvchilar uchun. Uni guruh chatiga yuboring.`,
        invalid: "Bu havola eskirgan yoki o'chirilgan. Ustozdan yangi havola so'rang.",
      };
      await ctx.reply(msg[r.status] ?? msg.invalid, { parse_mode: "HTML", reply_markup: r.status === "invalid" ? undefined : openAppKeyboard() });
    } catch (e) {
      console.error("join-group:", redact(e));
      await ctx.reply("Hozir guruhga qo'shib bo'lmadi, birozdan keyin havolani qayta bosing.");
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
    const pending = pendingParent.get(from.id);
    if (pending && Date.now() - pending.at < PENDING_TTL) {
      pendingParent.delete(from.id);
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
        self: "Bu havolani farzandingizga emas, ota-onasiga yuborish kerak. O'z havolangiz orqali o'zingizni ulab bo'lmaydi.",
        limit: "Bu o'quvchiga allaqachon 2 ta ota-ona ulangan.",
        rejected_before: "Avvalgi so'rovingiz rad etilgan. Savollar bo'lsa, ustozga murojaat qiling.",
        not_own_contact: "Iltimos, o'z raqamingizni ulashing.",
      };
      await ctx.reply(msg[r.status] ?? "Xatolik yuz berdi", { parse_mode: "HTML", ...done });
      return;
    }
    const r = await internal<{ status: string }>("user-phone", { from: fromOf(from), contact: { phone_number: c.phone_number, user_id: c.user_id } });
    await ctx.reply(r.status === "saved" ? "✅ Raqamingiz saqlandi. Ilovaga qaytishingiz mumkin." : "Iltimos, o'z raqamingizni ulashing.", {
      ...done,
      ...(r.status === "saved" ? { reply_markup: openAppKeyboard() } : {}),
    });
  } catch (e) {
    console.error("contact:", redact(e));
    await ctx.reply("Hozir saqlab bo'lmadi, birozdan keyin qayta urinib ko'ring.", done);
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
