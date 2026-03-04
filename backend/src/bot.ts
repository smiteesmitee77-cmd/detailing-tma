import { Telegraf, Markup } from "telegraf";

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("Не задана переменная окружения BOT_TOKEN.");
  process.exit(1);
}

const WEBAPP_URL =
  process.env.WEBAPP_URL || "https://your-frontend-url.example.com";

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
  return ctx.reply(
    "Привет! Это запись в детейлинг-центр.\nНажми кнопку ниже, чтобы открыть мини-приложение.",
    Markup.inlineKeyboard([
      [Markup.button.webApp("Открыть запись", WEBAPP_URL)],
    ])
  );
});

bot.launch().then(() => {
  console.log("Bot started. Waiting for /start ...");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

