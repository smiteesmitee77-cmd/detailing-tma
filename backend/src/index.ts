import express from "express";
import cors from "cors";
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
};

const services: Service[] = [
  {
    id: "wrap",
    name: "Оклейка авто",
    description: "Защитная или декоративная оклейка кузова плёнкой.",
    durationMinutes: 240,
  },
  {
    id: "wash",
    name: "Мойка",
    description: "Комплексная мойка кузова и салона.",
    durationMinutes: 60,
  },
  {
    id: "tires",
    name: "Замена шин",
    description: "Сезонная переобувка и балансировка.",
    durationMinutes: 90,
  },
];

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

app.post("/api/bookings", async (req, res) => {
  const { serviceId, date, time, carModel, phone, comment } = req.body || {};

  if (!serviceId || !date || !time || !carModel || !phone) {
    return res.status(400).json({ error: "Не заполнены обязательные поля." });
  }

  const service = services.find((s) => s.id === serviceId);
  if (!service) {
    return res.status(400).json({ error: "Выбранная услуга не найдена." });
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
    carModel,
    phone,
    comment: comment || undefined,
    telegramUserId,
  });

  notifyAdmin(booking).catch((e) => console.error("Ошибка уведомления бота:", e));

  res.status(201).json(booking);
});

app.patch("/api/bookings/:id/status", (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  scheduleCleanup();
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

if (process.env.BOT_TOKEN) {
  bot.launch().then(() => {
    console.log("Bot started.");
  });
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
} else {
  console.warn("BOT_TOKEN не задан — бот не запущен.");
}
