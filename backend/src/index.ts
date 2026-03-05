import "dotenv/config";
import express from "express";
import cors from "cors";
import { createBooking, getAllBookings, updateBookingStatus } from "./db";
import { bot, notifyAdmin } from "./bot";

const app = express();
const PORT = process.env.PORT || 4000;

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: ALLOWED_ORIGIN,
  })
);
app.use(express.json());

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

app.get("/api/bookings", (_req, res) => {
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

  const booking = createBooking({
    serviceId,
    serviceName: service.name,
    date,
    time,
    carModel,
    phone,
    comment: comment || undefined,
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
});

if (process.env.BOT_TOKEN) {
  bot.launch().then(() => {
    console.log("Bot started.");
  });
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
} else {
  console.warn("BOT_TOKEN не задан — бот не запущен.");
}
