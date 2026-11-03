import { Agent } from "node:https";
import { Bot, InlineKeyboard } from "grammy";

// Serverda IPv6 ishlamaydi (ENETUNREACH), standart ulanish esa ETIMEDOUT bilan osilib qoladi.
// Shuning uchun Telegram API'ga faqat IPv4 orqali ulanamiz.
const ipv4Agent = new Agent({ keepAlive: true, family: 4 });

const token = process.env.BOT_TOKEN;
const miniAppUrl = process.env.MINIAPP_URL;
if (!token) throw new Error("BOT_TOKEN kerak");
if (!miniAppUrl?.startsWith("https://")) throw new Error("MINIAPP_URL https:// bilan boshlanishi kerak");

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
