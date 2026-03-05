"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bot = void 0;
exports.notifyAdmin = notifyAdmin;
const telegraf_1 = require("telegraf");
const db_1 = require("./db");
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("Не задана переменная окружения BOT_TOKEN.");
    process.exit(1);
}
const WEBAPP_URL = process.env.WEBAPP_URL || "https://your-frontend-url.example.com";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
exports.bot = new telegraf_1.Telegraf(BOT_TOKEN);
const statusLabel = {
    pending: "🕐 Новая",
    confirmed: "✅ Подтверждена",
    done: "🏁 Выполнена",
    cancelled: "❌ Отменена",
};
function buildBookingText(b) {
    return [
        `📋 <b>Новая бронь #${b.id}</b>`,
        ``,
        `🔧 <b>Услуга:</b> ${b.serviceName}`,
        `📅 <b>Дата:</b> ${b.date} в ${b.time}`,
        `🚗 <b>Авто:</b> ${b.carModel}`,
        `📞 <b>Телефон:</b> ${b.phone}`,
        b.comment ? `💬 <b>Комментарий:</b> ${b.comment}` : "",
        ``,
        `<b>Статус:</b> ${statusLabel[b.status] || b.status}`,
    ]
        .filter((l) => l !== null)
        .join("\n");
}
async function notifyAdmin(booking) {
    if (!ADMIN_CHAT_ID) {
        console.warn("ADMIN_CHAT_ID не задан — уведомление не отправлено.");
        return;
    }
    const msg = await exports.bot.telegram.sendMessage(ADMIN_CHAT_ID, buildBookingText(booking), {
        parse_mode: "HTML",
        ...telegraf_1.Markup.inlineKeyboard([
            [
                telegraf_1.Markup.button.callback("✅ Подтвердить", `confirm:${booking.id}`),
                telegraf_1.Markup.button.callback("❌ Отменить", `cancel:${booking.id}`),
            ],
            [telegraf_1.Markup.button.callback("🏁 Выполнено", `done:${booking.id}`)],
        ]),
    });
    (0, db_1.saveMessageRef)(booking.id, String(ADMIN_CHAT_ID), msg.message_id);
}
async function updateAdminMessage(bookingId, booking) {
    if (!booking.msgChatId || !booking.msgId)
        return;
    try {
        await exports.bot.telegram.editMessageText(booking.msgChatId, booking.msgId, undefined, buildBookingText(booking), { parse_mode: "HTML" });
    }
    catch {
        // сообщение могло быть удалено — игнорируем
    }
}
exports.bot.action(/^confirm:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const updated = (0, db_1.updateBookingStatus)(id, "confirmed");
    if (updated)
        await updateAdminMessage(id, updated);
    await ctx.answerCbQuery("Бронь подтверждена ✅");
});
exports.bot.action(/^cancel:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const updated = (0, db_1.updateBookingStatus)(id, "cancelled");
    if (updated)
        await updateAdminMessage(id, updated);
    await ctx.answerCbQuery("Бронь отменена ❌");
});
exports.bot.action(/^done:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const updated = (0, db_1.updateBookingStatus)(id, "done");
    if (updated)
        await updateAdminMessage(id, updated);
    await ctx.answerCbQuery("Отмечено как выполнено 🏁");
});
exports.bot.start((ctx) => {
    return ctx.reply("Привет! Это запись в детейлинг-центр.\nНажми кнопку ниже, чтобы открыть мини-приложение.", telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.webApp("Открыть запись", WEBAPP_URL)],
    ]));
});
