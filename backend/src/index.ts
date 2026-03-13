import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createBooking, getAllBookings, getBookingsByUserId, updateBookingStatus, deleteOldBookings } from "./db";
import { bot, notifyAdmin } from "./bot";
import { validateTelegramInitData } from "./validateInitData";

const app = express();
const PORT = process.env.PORT || 4000;

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    allowedHeaders: ["Content-Type", "X-Telegram-Init-Data"],
  })
);
app.use(express.json());

// Общий лимит для всего API: 100 запросов за 15 минут с одного IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много запросов. Попробуйте через несколько минут." },
});

// Строгий лимит для создания броней: 10 за 15 минут
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток записи. Попробуйте через 15 минут." },
});

app.use("/api", apiLimiter);

type ResolveResult =
  | { ok: true; userId: string | undefined }
  | { ok: false; error: string };

/**
 * Валидирует заголовок X-Telegram-Init-Data и возвращает userId.
 * Если BOT_TOKEN не задан (dev-режим) — пропускает проверку.
 */
function resolveUserId(rawHeader: string | string[] | undefined): ResolveResult {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) return { ok: true, userId: undefined };

  if (typeof rawHeader !== "string" || !rawHeader) {
    return { ok: false, error: "Требуется авторизация через Telegram." };
  }

  const result = validateTelegramInitData(rawHeader, botToken);
  if (!result.valid) {
    console.warn("[auth] Невалидный initData:", result.reason);
    return { ok: false, error: "Данные Telegram недействительны или устарели." };
  }

  return { ok: true, userId: result.user ? String(result.user.id) : undefined };
}

type Service = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
};

const services: Service[] = [
  {
    id: "wrap",
    name: "Оклейка авто",
    description: "Защитная или декоративная оклейка кузова плёнкой.",
    durationMinutes: 240,
    price: 15000,
  },
  {
    id: "wash",
    name: "Мойка",
    description: "Комплексная мойка кузова и салона.",
    durationMinutes: 60,
    price: 1500,
  },
  {
    id: "tires",
    name: "Замена шин",
    description: "Сезонная переобувка и балансировка.",
    durationMinutes: 90,
    price: 2000,
  },
];

/** Телефон: +7/8/7 + 10 цифр */
const PHONE_RE = /^(\+7|7|8)\d{10}$/;

/** Рабочие часы в минутах от начала суток */
const WORK_START_MIN = 9 * 60;  // 09:00
const WORK_END_MIN   = 20 * 60; // 20:00

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(minutes: number): string {
  return [
    Math.floor(minutes / 60).toString().padStart(2, "0"),
    (minutes % 60).toString().padStart(2, "0"),
  ].join(":");
}

/**
 * Проверяет рабочие часы и конфликты с уже существующими записями.
 * Возвращает строку с ошибкой или null если всё ок.
 */
function validateTimeSlot(date: string, time: string, durationMinutes: number): string | null {
  const startMin = timeToMinutes(time);
  const endMin   = startMin + durationMinutes;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  if (date < todayStr) {
    return "Нельзя записаться задним числом.";
  }
  if (date === todayStr) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (startMin <= nowMin) {
      return `Нельзя записаться на прошедшее время. Сейчас ${minutesToTime(nowMin)}, выберите более позднее время.`;
    }
  }

  if (startMin < WORK_START_MIN) {
    return `Мы работаем с ${minutesToTime(WORK_START_MIN)}. Выберите другое время.`;
  }
  if (endMin > WORK_END_MIN) {
    const latestStart = minutesToTime(WORK_END_MIN - durationMinutes);
    return `Услуга не укладывается в рабочие часы (до ${minutesToTime(WORK_END_MIN)}). Последнее доступное время: ${latestStart}.`;
  }

  const existing = getAllBookings().filter(
    (b) => b.date === date && b.status !== "cancelled"
  );

  for (const booking of existing) {
    const svc = services.find((s) => s.id === booking.serviceId);
    const dur = svc?.durationMinutes ?? 60;
    const bStart = timeToMinutes(booking.time);
    const bEnd   = bStart + dur;

    if (startMin < bEnd && bStart < endMin) {
      return `Это время занято (${booking.time}–${minutesToTime(bEnd)}). Выберите другой слот.`;
    }
  }

  return null;
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/services", (_req, res) => {
  res.json(services);
});

app.get("/api/bookings", (req, res) => {
  const auth = resolveUserId(req.headers["x-telegram-init-data"]);
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  if (auth.userId) {
    return res.json(getBookingsByUserId(auth.userId));
  }

  // Dev-режим (BOT_TOKEN не задан): возвращаем все записи
  res.json(getAllBookings());
});

app.post("/api/bookings", bookingLimiter, async (req, res) => {
  const { serviceId, date, time, clientName, carModel, phone, comment } = req.body || {};

  if (!serviceId || !date || !time || !clientName || !carModel || !phone) {
    return res.status(400).json({ error: "Не заполнены обязательные поля." });
  }

  if (!PHONE_RE.test(String(phone).replace(/\s/g, ""))) {
    return res.status(400).json({ error: "Некорректный номер телефона. Формат: +79001234567" });
  }

  const service = services.find((s) => s.id === serviceId);
  if (!service) {
    return res.status(400).json({ error: "Выбранная услуга не найдена." });
  }

  const slotError = validateTimeSlot(date, time, service.durationMinutes);
  if (slotError) {
    return res.status(409).json({ error: slotError });
  }

  const rawInitData = req.headers["x-telegram-init-data"];
  const auth = resolveUserId(rawInitData);
  if (!auth.ok) return res.status(401).json({ error: auth.error });
  const telegramUserId = auth.userId;

  const booking = createBooking({
    serviceId,
    serviceName: service.name,
    date,
    time,
    clientName,
    carModel,
    phone,
    comment: comment || undefined,
    telegramUserId,
  });

  notifyAdmin(booking).catch((e) => console.error("Ошибка уведомления бота:", e));

  res.status(201).json(booking);
});

// Отмена своей брони клиентом — только авторизованный владелец может отменить
app.post("/api/bookings/:id/cancel", (req, res) => {
  const auth = resolveUserId(req.headers["x-telegram-init-data"]);
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  const id = Number(req.params.id);
  const booking = getAllBookings().find((b) => b.id === id);

  if (!booking) {
    return res.status(404).json({ error: "Бронь не найдена." });
  }

  // В dev-режиме (userId = undefined) отменять нельзя — требуется авторизация
  if (!auth.userId) {
    return res.status(403).json({ error: "Для отмены записи требуется авторизация через Telegram." });
  }

  if (booking.telegramUserId !== auth.userId) {
    return res.status(403).json({ error: "Нельзя отменить чужую запись." });
  }

  if (booking.status === "cancelled") {
    return res.status(400).json({ error: "Запись уже отменена." });
  }

  if (booking.status === "done") {
    return res.status(400).json({ error: "Нельзя отменить выполненную запись." });
  }

  const updated = updateBookingStatus(id, "cancelled");

  // Уведомляем администратора об отмене клиентом
  if (updated) {
    notifyAdmin(updated).catch((e) => console.error("Ошибка уведомления бота:", e));
  }

  res.json(updated);
});

app.patch("/api/bookings/:id/status", (req, res) => {
  // Эндпоинт предназначен только для бота. Проверяем секретный заголовок.
  const BOT_SECRET = process.env.BOT_SECRET;
  if (BOT_SECRET) {
    const provided = req.headers["x-bot-secret"];
    if (provided !== BOT_SECRET) {
      return res.status(403).json({ error: "Доступ запрещён." });
    }
  }

  const id = Number(req.params.id);
  const { status } = req.body || {};

  const allowed = ["pending", "confirmed", "done", "cancelled"];
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ error: "Некорректный статус." });
  }

  const updated = updateBookingStatus(id, status);
  if (!updated) {
    return res.status(404).json({ error: "Бронь не найдена." });
  }

  res.json(updated);
});

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 часа

function runCleanup() {
  try {
    const deleted = deleteOldBookings();
    if (deleted > 0) {
      console.log(`[cleanup] Удалено устаревших записей: ${deleted}`);
    }
  } catch (e) {
    console.error("[cleanup] Ошибка при очистке старых записей:", e);
  }
}

function scheduleCleanup() {
  runCleanup();
  const timer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  // unref — чтобы таймер не блокировал graceful shutdown процесса
  timer.unref();
}

async function startBot() {
  if (!process.env.BOT_TOKEN) {
    console.warn("BOT_TOKEN не задан — бот не запущен.");
    return;
  }

  const webhookUrl = process.env.WEBHOOK_URL;

  if (webhookUrl) {
    // Продакшн: Telegram сам шлёт обновления к нам на /webhook
    const secretPath = `/webhook/${process.env.BOT_TOKEN}`;
    await bot.telegram.setWebhook(`${webhookUrl}${secretPath}`);
    app.use(secretPath, bot.webhookCallback(secretPath));
    console.log(`[bot] Webhook установлен: ${webhookUrl}${secretPath}`);
  } else {
    // Dev: long polling
    bot.launch().then(() => console.log("[bot] Long polling запущен."));
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  }
}

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  scheduleCleanup();
  startBot();
});
