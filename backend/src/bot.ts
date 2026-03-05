import { Telegraf, Markup } from "telegraf";
import { Booking, updateBookingStatus, saveMessageRef } from "./db";

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("Не задана переменная окружения BOT_TOKEN.");
  process.exit(1);
}

const WEBAPP_URL =
  process.env.WEBAPP_URL || "https://your-frontend-url.example.com";

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

export const bot = new Telegraf(BOT_TOKEN);

const statusLabel: Record<string, string> = {
  pending: "🕐 Новая",
  confirmed: "✅ Подтверждена",
  done: "🏁 Выполнена",
  cancelled: "❌ Отменена",
};

function buildBookingText(b: Booking): string {
  return [
    `📋 <b>Бронь #${b.id}</b>`,
    ``,
    `🔧 <b>Услуга:</b> ${b.serviceName}`,
    `📅 <b>Дата:</b> ${b.date} в ${b.time}`,
    `👤 <b>Клиент:</b> ${b.clientName}`,
    `🚗 <b>Авто:</b> ${b.carModel}`,
    `📞 <b>Телефон:</b> ${b.phone}`,
    b.telegramUserId ? `🆔 <b>TG ID:</b> ${b.telegramUserId}` : "",
    b.comment ? `💬 <b>Комментарий:</b> ${b.comment}` : "",
    ``,
    `<b>Статус:</b> ${statusLabel[b.status] || b.status}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * Отправляет клиенту уведомление об изменении статуса его записи.
 * Использует telegramUserId как chat_id (в личке user_id == chat_id).
 */
async function notifyUser(booking: Booking): Promise<void> {
  if (!booking.telegramUserId) return;

  const texts: Partial<Record<string, string>> = {
    confirmed: [
      `✅ <b>Ваша запись подтверждена!</b>`,
      ``,
      `🔧 <b>Услуга:</b> ${booking.serviceName}`,
      `📅 <b>Дата:</b> ${booking.date} в ${booking.time}`,
      `🚗 <b>Авто:</b> ${booking.carModel}`,
      ``,
      `Ждём вас! Если что-то изменится — напишите нам.`,
    ].join("\n"),

    cancelled: [
      `❌ <b>Ваша запись отменена</b>`,
      ``,
      `🔧 <b>Услуга:</b> ${booking.serviceName}`,
      `📅 <b>Дата:</b> ${booking.date} в ${booking.time}`,
      ``,
      `Если возникли вопросы — свяжитесь с нами.`,
    ].join("\n"),

    done: [
      `🏁 <b>Запись выполнена!</b>`,
      ``,
      `🔧 <b>Услуга:</b> ${booking.serviceName}`,
      ``,
      `Спасибо, что выбрали нас! Будем рады видеть снова.`,
    ].join("\n"),
  };

  const text = texts[booking.status];
  if (!text) return;

  try {
    await bot.telegram.sendMessage(booking.telegramUserId, text, {
      parse_mode: "HTML",
    });
  } catch (e) {
    console.error(`[bot] Не удалось уведомить пользователя ${booking.telegramUserId}:`, e);
  }
}

export async function notifyAdmin(booking: Booking): Promise<void> {
  if (!ADMIN_CHAT_ID) {
    console.warn("ADMIN_CHAT_ID не задан — уведомление не отправлено.");
    return;
  }

  const msg = await bot.telegram.sendMessage(
    ADMIN_CHAT_ID,
    buildBookingText(booking),
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Подтвердить", `confirm:${booking.id}`),
          Markup.button.callback("❌ Отменить", `cancel:${booking.id}`),
        ],
        [Markup.button.callback("🏁 Выполнено", `done:${booking.id}`)],
      ]),
    }
  );

  saveMessageRef(booking.id, String(ADMIN_CHAT_ID), msg.message_id);
}

async function updateAdminMessage(bookingId: number, booking: Booking) {
  if (!booking.msgChatId || !booking.msgId) return;
  try {
    await bot.telegram.editMessageText(
      booking.msgChatId,
      booking.msgId,
      undefined,
      buildBookingText(booking),
      { parse_mode: "HTML" }
    );
  } catch {
    // сообщение могло быть удалено — игнорируем
  }
}

bot.action(/^confirm:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const updated = updateBookingStatus(id, "confirmed");
  if (updated) {
    await updateAdminMessage(id, updated);
    notifyUser(updated).catch((e) => console.error("[bot] notifyUser error:", e));
  }
  await ctx.answerCbQuery("Бронь подтверждена ✅");
});

bot.action(/^cancel:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const updated = updateBookingStatus(id, "cancelled");
  if (updated) {
    await updateAdminMessage(id, updated);
    notifyUser(updated).catch((e) => console.error("[bot] notifyUser error:", e));
  }
  await ctx.answerCbQuery("Бронь отменена ❌");
});

bot.action(/^done:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const updated = updateBookingStatus(id, "done");
  if (updated) {
    await updateAdminMessage(id, updated);
    notifyUser(updated).catch((e) => console.error("[bot] notifyUser error:", e));
  }
  await ctx.answerCbQuery("Отмечено как выполнено 🏁");
});

bot.start((ctx) => {
  return ctx.reply(
    "Привет! Это запись в детейлинг-центр.\nНажми кнопку ниже, чтобы открыть мини-приложение.",
    Markup.inlineKeyboard([
      [Markup.button.webApp("Открыть запись", WEBAPP_URL)],
    ])
  );
});
