import { Bot, InlineKeyboard } from "grammy";

const token = process.env.BOT_TOKEN;
const miniAppUrl = process.env.MINIAPP_URL;
if (!token) throw new Error("BOT_TOKEN kerak");
if (!miniAppUrl?.startsWith("https://")) throw new Error("MINIAPP_URL https:// bilan boshlanishi kerak");

const bot = new Bot(token);

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

bot.catch((err) => console.error("Bot xatosi:", err.error));

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

main();
