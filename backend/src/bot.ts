import { Telegraf, Markup } from "telegraf";
import {
  Booking,
  updateBookingStatus,
  saveMessageRef,
  getBookingsForReminder,
  markReminderSent,
  getAllBookings,
  getBookingById,
  getAllServices,
  getServiceById,
  updateBookingDetails,
  isAdminUsername,
  getAdmins,
  addAdmin,
  removeAdmin,
} from "./db";

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || "https://your-frontend-url.example.com";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!BOT_TOKEN) {
  console.warn("[bot] BOT_TOKEN не задан — бот отключён. Уведомления работать не будут.");
}

export const bot: Telegraf | null = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

// ─── Status helpers ──────────────────────────────────────────────────────────

const statusEmoji: Record<string, string> = {
  pending: "🕐",
  confirmed: "✅",
  done: "🏁",
  cancelled: "❌",
};

const statusLabel: Record<string, string> = {
  pending: "🕐 Новая",
  confirmed: "✅ Подтверждена",
  done: "🏁 Выполнена",
  cancelled: "❌ Отменена",
};

// ─── Booking text builder ────────────────────────────────────────────────────

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

// ─── User notifications ──────────────────────────────────────────────────────

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

async function notifyUserEdited(booking: Booking, changes: string): Promise<void> {
  if (!bot || !booking.telegramUserId) return;
  const text = [
    `✏️ <b>Ваша запись была изменена администратором</b>`,
    ``,
    changes,
    ``,
    `🔧 <b>Услуга:</b> ${booking.serviceName}`,
    `📅 <b>Дата:</b> ${booking.date} в ${booking.time}`,
    `🚗 <b>Авто:</b> ${booking.carModel}`,
  ].join("\n");

  try {
    await bot.telegram.sendMessage(booking.telegramUserId, text, { parse_mode: "HTML" });
  } catch (e) {
    console.error(`[bot] Не удалось уведомить пользователя об изменении:`, e);
  }
}

// ─── Admin notification (on new booking) ────────────────────────────────────

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

// ─── Admin panel: access control ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAdminCtx(ctx: any): boolean {
  if (!ctx.from) return false;
  if (ADMIN_CHAT_ID && String(ctx.from.id) === String(ADMIN_CHAT_ID)) return true;
  if (ctx.from.username) return isAdminUsername(ctx.from.username);
  return false;
}

// ─── Admin panel: conversation state machine ──────────────────────────────────

type AdminState =
  | { action: "edit_date"; bookingId: number }
  | { action: "edit_time"; bookingId: number }
  | { action: "new_admin" };

const adminStates = new Map<number, AdminState>();

// Remembers the last bookings-list page the admin was browsing
const browseState = new Map<number, { filter: string; page: number }>();

// ─── Panel page size ──────────────────────────────────────────────────────────

const PAGE_SIZE = 5;

// ─── Panel UI helpers ─────────────────────────────────────────────────────────

function buildSummaryText(): string {
  const all = getAllBookings();
  const cnt = (s: string) => all.filter((b) => b.status === s).length;
  return [
    "🔧 <b>Панель управления CARBASE</b>",
    "",
    "📊 <b>Статистика записей:</b>",
    `🕐 Ожидают подтверждения: <b>${cnt("pending")}</b>`,
    `✅ Подтверждены: <b>${cnt("confirmed")}</b>`,
    `🏁 Выполнены: <b>${cnt("done")}</b>`,
    `❌ Отменены: <b>${cnt("cancelled")}</b>`,
    `📋 Всего: <b>${all.length}</b>`,
  ].join("\n");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function showPanelMain(ctx: any, edit = false) {
  const text = buildSummaryText();
  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback("🕐 Ожидающие", "pbk:0:pending"),
      Markup.button.callback("✅ Подтверждённые", "pbk:0:confirmed"),
    ],
    [
      Markup.button.callback("📋 Все брони", "pbk:0:all"),
      Markup.button.callback("👥 Управление админами", "padm"),
    ],
  ]);

  if (edit && ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

function getFilteredBookings(filter: string): Booking[] {
  const all = getAllBookings();
  const result = filter === "all" ? [...all] : all.filter((b) => b.status === filter);
  // Active bookings first by date ASC, then finished/cancelled by date DESC
  return result.sort((a, b) => {
    const active = ["pending", "confirmed"];
    const aA = active.includes(a.status);
    const bA = active.includes(b.status);
    if (aA !== bA) return aA ? -1 : 1;
    return aA ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function showBookingsList(ctx: any, page: number, filter: string) {
  const userId: number | undefined = ctx.from?.id;
  if (userId !== undefined) browseState.set(userId, { filter, page });

  const bookings = getFilteredBookings(filter);
  const total = bookings.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const slice = bookings.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const filterNames: Record<string, string> = {
    all: "Все брони",
    pending: "Ожидающие",
    confirmed: "Подтверждённые",
    done: "Выполненные",
    cancelled: "Отменённые",
  };

  const headerText =
    total === 0
      ? `📋 <b>${filterNames[filter] || "Брони"}</b>\n\nЗаписей в этой категории нет.`
      : `📋 <b>${filterNames[filter] || "Брони"}</b> — ${total} шт.\nСтр. ${safePage + 1} / ${totalPages}`;

  const rows = slice.map((b) => [
    Markup.button.callback(
      `${statusEmoji[b.status] ?? "?"} #${b.id} ${b.serviceName} · ${b.date} ${b.time}`,
      `pview:${b.id}`
    ),
  ]);

  const navRow = [];
  if (safePage > 0) navRow.push(Markup.button.callback("◀️", `pbk:${safePage - 1}:${filter}`));
  navRow.push(Markup.button.callback("🏠 Меню", "pmain"));
  if (safePage < totalPages - 1) navRow.push(Markup.button.callback("▶️", `pbk:${safePage + 1}:${filter}`));
  rows.push(navRow);

  const kb = Markup.inlineKeyboard(rows);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(headerText, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(headerText, { parse_mode: "HTML", ...kb });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function showBookingDetail(ctx: any, bookingId: number) {
  const b = getBookingById(bookingId);
  if (!b) {
    if (ctx.callbackQuery) await ctx.answerCbQuery("Бронь не найдена").catch(() => {});
    else await ctx.reply("Бронь не найдена.").catch(() => {});
    return;
  }

  const userId: number | undefined = ctx.from?.id;
  const bs = userId !== undefined ? (browseState.get(userId) ?? { filter: "all", page: 0 }) : { filter: "all", page: 0 };

  const text = buildBookingText(b);
  const rows = [];

  const actionRow = [];
  if (b.status === "pending") {
    actionRow.push(Markup.button.callback("✅ Подтвердить", `pcf:${b.id}`));
  }
  if (b.status !== "cancelled" && b.status !== "done") {
    actionRow.push(Markup.button.callback("❌ Отменить", `pcn:${b.id}`));
    actionRow.push(Markup.button.callback("🏁 Выполнено", `pdn:${b.id}`));
  }
  if (actionRow.length > 0) rows.push(actionRow);

  if (b.status !== "cancelled" && b.status !== "done") {
    rows.push([Markup.button.callback("✏️ Изменить бронь", `pedit:${b.id}`)]);
  }

  rows.push([Markup.button.callback("◀️ Назад к списку", `pbk:${bs.page}:${bs.filter}`)]);

  const kb = Markup.inlineKeyboard(rows);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function showEditOptions(ctx: any, bookingId: number) {
  const b = getBookingById(bookingId);
  if (!b) {
    if (ctx.callbackQuery) await ctx.answerCbQuery("Бронь не найдена").catch(() => {});
    return;
  }

  const text = [
    `✏️ <b>Изменение брони #${bookingId}</b>`,
    ``,
    `<b>Текущие данные:</b>`,
    `🔧 ${b.serviceName}`,
    `📅 ${b.date} в ${b.time}`,
    ``,
    `Выберите, что изменить:`,
  ].join("\n");

  const services = getAllServices();
  const svcRows = [];
  for (let i = 0; i < services.length; i += 2) {
    const row = [Markup.button.callback(`🔧 ${services[i].name}`, `psv:${bookingId}:${services[i].id}`)];
    if (services[i + 1]) {
      row.push(Markup.button.callback(`🔧 ${services[i + 1].name}`, `psv:${bookingId}:${services[i + 1].id}`));
    }
    svcRows.push(row);
  }

  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback("📅 Изменить дату", `pef:${bookingId}:date`),
      Markup.button.callback("⏰ Изменить время", `pef:${bookingId}:time`),
    ],
    ...svcRows,
    [Markup.button.callback("◀️ Назад к брони", `pview:${bookingId}`)],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function showAdminsPanel(ctx: any) {
  const dbAdmins = getAdmins();
  const envAdmins = (process.env.ADMIN_USERNAMES || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  let text = "👥 <b>Управление администраторами</b>\n\n";

  if (envAdmins.length > 0) {
    text += `<b>Из переменной ADMIN_USERNAMES:</b>\n`;
    text += envAdmins.map((u) => `• @${u}`).join("\n") + "\n\n";
  }

  if (dbAdmins.length > 0) {
    text += `<b>Добавлены через бот:</b>\n`;
    text += dbAdmins.map((u) => `• @${u}`).join("\n");
  } else {
    text += `Дополнительных администраторов нет.`;
  }

  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  rows.push([Markup.button.callback("➕ Добавить администратора", "pnewadm")]);
  for (const username of dbAdmins) {
    rows.push([Markup.button.callback(`➖ Удалить @${username}`, `prmadm:${username}`)]);
  }
  rows.push([Markup.button.callback("◀️ Назад в меню", "pmain")]);

  const kb = Markup.inlineKeyboard(rows);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

// ─── Input parsers ────────────────────────────────────────────────────────────

function parseDate(input: string): string | null {
  const m = input.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, day, month, year] = m;
  const d = new Date(`${year}-${month}-${day}`);
  if (isNaN(d.getTime())) return null;
  return `${year}-${month}-${day}`;
}

function parseTime(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1]);
  const min = parseInt(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// ─── Bot handlers ─────────────────────────────────────────────────────────────

if (bot) {
  // ── Existing notification button handlers (keep working for admin chat messages) ──

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

  // ── /start ──────────────────────────────────────────────────────────────────

  bot.start((ctx) => {
    return ctx.reply(
      "Привет! Это запись в детейлинг-центр.\nНажми кнопку ниже, чтобы открыть мини-приложение.",
      Markup.inlineKeyboard([
        [Markup.button.webApp("Открыть запись", WEBAPP_URL)],
      ])
    );
  });

  // ── /panel — hidden admin panel command ─────────────────────────────────────

  bot.command("panel", async (ctx) => {
    if (!isAdminCtx(ctx)) return; // silently ignore for non-admins
    adminStates.delete(ctx.from.id); // clear any pending state
    await showPanelMain(ctx);
  });

  // ── Panel navigation ─────────────────────────────────────────────────────────

  bot.action("pmain", async (ctx) => {
    if (!isAdminCtx(ctx)) return await ctx.answerCbQuery().catch(() => {});
    await ctx.answerCbQuery();
    adminStates.delete(ctx.from.id);
    await showPanelMain(ctx, true);
  });

  // Bookings list: pbk:PAGE:FILTER
  bot.action(/^pbk:(\d+):(\w+)$/, async (ctx) => {
    if (!isAdminCtx(ctx)) return await ctx.answerCbQuery().catch(() => {});
    await ctx.answerCbQuery();
    const page = Number(ctx.match[1]);
    const filter = ctx.match[2];
    await showBookingsList(ctx, page, filter);
  });

  // View booking detail: pview:ID
  bot.action(/^pview:(\d+)$/, async (ctx) => {
    if (!isAdminCtx(ctx)) return await ctx.answerCbQuery().catch(() => {});
    await ctx.answerCbQuery();
    await showBookingDetail(ctx, Number(ctx.match[1]));
  });

  // ── Panel booking actions ─────────────────────────────────────────────────────

  // Confirm: pcf:ID
  bot.action(/^pcf:(\d+)$/, async (ctx) => {
    if (!isAdminCtx(ctx)) return await ctx.answerCbQuery().catch(() => {});
    try {
      const id = Number(ctx.match[1]);
      const updated = updateBookingStatus(id, "confirmed");
      if (updated) {
        notifyUser(updated).catch((e) => console.error("[bot] notifyUser error:", e));
        await updateAdminMessage(id, updated);
        await ctx.answerCbQuery("Бронь подтверждена ✅");
        await showBookingDetail(ctx, id);
      } else {
        await ctx.answerCbQuery("Бронь не найдена").catch(() => {});
      }
    } catch (e) {
      console.error("[panel] pcf error:", e);
      await ctx.answerCbQuery("Ошибка").catch(() => {});
    }
  });

  // Cancel: pcn:ID
  bot.action(/^pcn:(\d+)$/, async (ctx) => {
    if (!isAdminCtx(ctx)) return await ctx.answerCbQuery().catch(() => {});
    try {
      const id = Number(ctx.match[1]);
      const updated = updateBookingStatus(id, "cancelled");
      if (updated) {
        notifyUser(updated).catch((e) => console.error("[bot] notifyUser error:", e));
        await updateAdminMessage(id, updated);
        await ctx.answerCbQuery("Бронь отменена ❌");
        await showBookingDetail(ctx, id);
      } else {
        await ctx.answerCbQuery("Бронь не найдена").catch(() => {});
      }
    } catch (e) {
      console.error("[panel] pcn error:", e);
      await ctx.answerCbQuery("Ошибка").catch(() => {});
    }
  });

  // Mark done: pdn:ID
  bot.action(/^pdn:(\d+)$/, async (ctx) => {
    if (!isAdminCtx(ctx)) return await ctx.answerCbQuery().catch(() => {});
    try {
      const id = Number(ctx.match[1]);
      const updated = updateBookingStatus(id, "done");
      if (updated) {
        notifyUser(updated).catch((e) => console.error("[bot] notifyUser error:", e));
        await updateAdminMessage(id, updated);
        await ctx.answerCbQuery("Отмечено как выполнено 🏁");
        await showBookingDetail(ctx, id);
      } else {
        await ctx.answerCbQuery("Бронь не найдена").catch(() => {});
      }
    } catch (e) {
      console.error("[panel] pdn error:", e);
      await ctx.answerCbQuery("Ошибка").catch(() => {});
    }
  });

  // ── Edit flow ─────────────────────────────────────────────────────────────────

  // Open edit menu: pedit:ID
  bot.action(/^pedit:(\d+)$/, async (ctx) => {
    if (!isAdminCtx(ctx)) return await ctx.answerCbQuery().catch(() => {});
    await ctx.answerCbQuery();
    adminStates.delete(ctx.from.id);
    await showEditOptions(ctx, Number(ctx.match[1]));
  });

  // Select edit field: pef:ID:date|time
  bot.action(/^pef:(\d+):(date|time)$/, async (ctx) => {
    if (!isAdminCtx(ctx)) return await ctx.answerCbQuery().catch(() => {});
    await ctx.answerCbQuery();
    const bookingId = Number(ctx.match[1]);
    const field = ctx.match[2] as "date" | "time";
    const b = getBookingById(bookingId);
    if (!b) {
      await ctx.answerCbQuery("Бронь не найдена").catch(() => {});
      return;
    }

    if (field === "date") {
      adminStates.set(ctx.from.id, { action: "edit_date", bookingId });
      const text = [
        `📅 <b>Изменение даты — Бронь #${bookingId}</b>`,
        ``,
        `<b>Текущая дата:</b> ${b.date}`,
        ``,
        `Введите новую дату в формате <code>ДД.ММ.ГГГГ</code>`,
        `<i>Пример: 15.03.2026</i>`,
      ].join("\n");
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([[Markup.button.callback("❌ Отмена", `pedit:${bookingId}`)]]),
      });
    } else {
      adminStates.set(ctx.from.id, { action: "edit_time", bookingId });
      const text = [
        `⏰ <b>Изменение времени — Бронь #${bookingId}</b>`,
        ``,
        `<b>Текущее время:</b> ${b.time}`,
        ``,
        `Введите новое время в формате <code>ЧЧ:ММ</code>`,
        `<i>Пример: 14:30. Рабочие часы: 09:00–20:00</i>`,
      ].join("\n");
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([[Markup.button.callback("❌ Отмена", `pedit:${bookingId}`)]]),
      });
    }
  });

  // Select new service: psv:BOOKING_ID:SVC_ID
  bot.action(/^psv:(\d+):(.+)$/, async (ctx) => {
    if (!isAdminCtx(ctx)) return await ctx.answerCbQuery().catch(() => {});
    const bookingId = Number(ctx.match[1]);
    const svcId = ctx.match[2];
    const service = getServiceById(svcId);
    if (!service) {
      await ctx.answerCbQuery("Услуга не найдена").catch(() => {});
      return;
    }
    const updated = updateBookingDetails(bookingId, { serviceId: service.id, serviceName: service.name });
    if (!updated) {
      await ctx.answerCbQuery("Бронь не найдена").catch(() => {});
      return;
    }
    notifyUserEdited(updated, `Услуга изменена на: <b>${service.name}</b>`).catch(() => {});
    await ctx.answerCbQuery(`Услуга изменена на «${service.name}»`);
    await showBookingDetail(ctx, bookingId);
  });

  // ── Admins management ─────────────────────────────────────────────────────────

  bot.action("padm", async (ctx) => {
    if (!isAdminCtx(ctx)) return await ctx.answerCbQuery().catch(() => {});
    await ctx.answerCbQuery();
    adminStates.delete(ctx.from.id);
    await showAdminsPanel(ctx);
  });

  bot.action("pnewadm", async (ctx) => {
    if (!isAdminCtx(ctx)) return await ctx.answerCbQuery().catch(() => {});
    await ctx.answerCbQuery();
    adminStates.set(ctx.from.id, { action: "new_admin" });
    await ctx.editMessageText(
      [
        "➕ <b>Добавление администратора</b>",
        "",
        "Введите Telegram username нового администратора.",
        "<i>Пример: @username или username</i>",
      ].join("\n"),
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([[Markup.button.callback("❌ Отмена", "padm")]]),
      }
    );
  });

  bot.action(/^prmadm:(.+)$/, async (ctx) => {
    if (!isAdminCtx(ctx)) return await ctx.answerCbQuery().catch(() => {});
    const username = ctx.match[1];
    const removed = removeAdmin(username);
    await ctx.answerCbQuery(removed ? `@${username} удалён` : "Пользователь не найден");
    await showAdminsPanel(ctx);
  });

  // ── Text message handler (for edit date/time and new admin flows) ─────────────

  bot.on("text", async (ctx) => {
    if (!isAdminCtx(ctx)) return;

    const userId = ctx.from.id;
    const state = adminStates.get(userId);
    if (!state) return;

    const input = ctx.message.text.trim();

    if (state.action === "edit_date") {
      const dateStr = parseDate(input);
      if (!dateStr) {
        await ctx.reply(
          "❌ Неверный формат. Введите дату в формате <code>ДД.ММ.ГГГГ</code>, например: <code>15.03.2026</code>",
          { parse_mode: "HTML" }
        );
        return;
      }
      adminStates.delete(userId);
      const updated = updateBookingDetails(state.bookingId, { date: dateStr });
      if (!updated) {
        await ctx.reply("❌ Бронь не найдена.");
        return;
      }
      notifyUserEdited(updated, `Дата записи изменена на: <b>${dateStr}</b>`).catch(() => {});
      await ctx.reply(`✅ Дата брони #${state.bookingId} изменена на <b>${dateStr}</b>`, { parse_mode: "HTML" });
      await showBookingDetail(ctx, state.bookingId);

    } else if (state.action === "edit_time") {
      const timeStr = parseTime(input);
      if (!timeStr) {
        await ctx.reply(
          "❌ Неверный формат. Введите время в формате <code>ЧЧ:ММ</code>, например: <code>14:30</code>",
          { parse_mode: "HTML" }
        );
        return;
      }
      adminStates.delete(userId);
      const updated = updateBookingDetails(state.bookingId, { time: timeStr });
      if (!updated) {
        await ctx.reply("❌ Бронь не найдена.");
        return;
      }
      notifyUserEdited(updated, `Время записи изменено на: <b>${timeStr}</b>`).catch(() => {});
      await ctx.reply(`✅ Время брони #${state.bookingId} изменено на <b>${timeStr}</b>`, { parse_mode: "HTML" });
      await showBookingDetail(ctx, state.bookingId);

    } else if (state.action === "new_admin") {
      const username = input.replace(/^@/, "").toLowerCase();
      if (!username || username.length < 3 || !/^[a-z0-9_]+$/i.test(username)) {
        await ctx.reply("❌ Некорректный username. Введите ещё раз (только латинские буквы, цифры и _).");
        return;
      }
      adminStates.delete(userId);
      addAdmin(username);
      await ctx.reply(`✅ Пользователь @${username} добавлен как администратор.`);
      await showAdminsPanel(ctx);
    }
  });
}

// ─── Reminders ────────────────────────────────────────────────────────────────

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
