import { Agent } from "node:https";
import { internalKey } from "@onatili/shared/server";
import { Bot, InlineKeyboard } from "grammy";

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

bot.command("start", async (ctx) => {
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
    const res = await fetch(`${apiUrl}/internal/admin-login-link`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": internalKey(token) },
      body: JSON.stringify({
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const { url } = (await res.json()) as { url: string | null };
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
