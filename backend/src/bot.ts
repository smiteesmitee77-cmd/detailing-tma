import { Telegraf, Markup } from "telegraf";
import { Booking, updateBookingStatus, saveMessageRef, getBookingsForReminder, markReminderSent } from "./db";

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || "https://your-frontend-url.example.com";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!BOT_TOKEN) {
  console.warn("[bot] BOT_TOKEN не задан — бот отключён. Уведомления работать не будут.");
}

// bot может быть null, если токен не задан — сервер при этом продолжает работать
export const bot: Telegraf | null = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

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
 */
async function notifyUser(booking: Booking): Promise<void> {
  if (!bot || !booking.telegramUserId) return;

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
    await bot.telegram.sendMessage(booking.telegramUserId, text, { parse_mode: "HTML" });
  } catch (e) {
    console.error(`[bot] Не удалось уведомить пользователя ${booking.telegramUserId}:`, e);
  }
}

export async function notifyAdmin(booking: Booking): Promise<void> {
  if (!bot) return;
  if (!ADMIN_CHAT_ID) {
    console.warn("[bot] ADMIN_CHAT_ID не задан — уведомление не отправлено.");
    return;
  }

  try {
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
  } catch (e) {
    console.error("[bot] Не удалось отправить уведомление администратору:", e);
  }
}

async function updateAdminMessage(bookingId: number, booking: Booking) {
  if (!bot || !booking.msgChatId || !booking.msgId) return;
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

if (bot) {
  bot.action(/^confirm:(\d+)$/, async (ctx) => {
    try {
      const id = Number(ctx.match[1]);
      const updated = updateBookingStatus(id, "confirmed");
      if (updated) {
        await updateAdminMessage(id, updated);
        notifyUser(updated).catch((e) => console.error("[bot] notifyUser error:", e));
      }
      await ctx.answerCbQuery("Бронь подтверждена ✅");
    } catch (e) {
      console.error("[bot] confirm error:", e);
      await ctx.answerCbQuery("Ошибка при подтверждении").catch(() => {});
    }
  });

  bot.action(/^cancel:(\d+)$/, async (ctx) => {
    try {
      const id = Number(ctx.match[1]);
      const updated = updateBookingStatus(id, "cancelled");
      if (updated) {
        await updateAdminMessage(id, updated);
        notifyUser(updated).catch((e) => console.error("[bot] notifyUser error:", e));
      }
      await ctx.answerCbQuery("Бронь отменена ❌");
    } catch (e) {
      console.error("[bot] cancel error:", e);
      await ctx.answerCbQuery("Ошибка при отмене").catch(() => {});
    }
  });

  bot.action(/^done:(\d+)$/, async (ctx) => {
    try {
      const id = Number(ctx.match[1]);
      const updated = updateBookingStatus(id, "done");
      if (updated) {
        await updateAdminMessage(id, updated);
        notifyUser(updated).catch((e) => console.error("[bot] notifyUser error:", e));
      }
      await ctx.answerCbQuery("Отмечено как выполнено 🏁");
    } catch (e) {
      console.error("[bot] done error:", e);
      await ctx.answerCbQuery("Ошибка").catch(() => {});
    }
  });

  bot.start((ctx) => {
    return ctx.reply(
      "Привет! Это запись в детейлинг-центр.\nНажми кнопку ниже, чтобы открыть мини-приложение.",
      Markup.inlineKeyboard([
        [Markup.button.webApp("Открыть запись", WEBAPP_URL)],
      ])
    );
  });
}

/**
 * Отправляет напоминания клиентам, у которых запись завтра.
 * Вызывается каждый час из index.ts.
 */
export async function sendReminders(): Promise<void> {
  if (!bot) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const bookings = getBookingsForReminder(tomorrowStr);
  if (bookings.length === 0) return;

  console.log(`[reminders] Отправляем напоминания для ${bookings.length} записей на ${tomorrowStr}`);

  for (const booking of bookings) {
    if (!booking.telegramUserId) {
      markReminderSent(booking.id);
      continue;
    }

    const text = [
      `🔔 <b>Напоминание о записи</b>`,
      ``,
      `Завтра у вас запись в детейлинг-центр CARBASE!`,
      ``,
      `🔧 <b>Услуга:</b> ${booking.serviceName}`,
      `📅 <b>Дата:</b> ${booking.date} в ${booking.time}`,
      `🚗 <b>Авто:</b> ${booking.carModel}`,
      ``,
      `Если планы изменились — откройте приложение и отмените запись.`,
    ].join("\n");

    try {
      await bot.telegram.sendMessage(booking.telegramUserId, text, { parse_mode: "HTML" });
      markReminderSent(booking.id);
    } catch (e) {
      console.error(`[reminders] Не удалось отправить напоминание для #${booking.id}:`, e);
    }
  }
}
