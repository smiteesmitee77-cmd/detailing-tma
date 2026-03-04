import express from "express";
import cors from "cors";

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

type BookingStatus = "pending" | "confirmed" | "done" | "cancelled";

type Booking = {
  id: string;
  serviceId: string;
  serviceName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  carModel: string;
  phone: string;
  comment?: string;
  createdAt: string;
  status: BookingStatus;
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

const bookings: Booking[] = [];

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/services", (_req, res) => {
  res.json(services);
});

app.get("/api/bookings", (_req, res) => {
  res.json(bookings);
});

app.post("/api/bookings", (req, res) => {
  const { serviceId, date, time, carModel, phone, comment } = req.body || {};

  if (!serviceId || !date || !time || !carModel || !phone) {
    return res.status(400).json({ error: "Не заполнены обязательные поля." });
  }

  const service = services.find((s) => s.id === serviceId);
  if (!service) {
    return res.status(400).json({ error: "Выбранная услуга не найдена." });
  }

  const id = String(bookings.length + 1);
  const createdAt = new Date().toISOString();

  const booking: Booking = {
    id,
    serviceId,
    serviceName: service.name,
    date,
    time,
    carModel,
    phone,
    comment,
    createdAt,
    status: "pending",
  };

  bookings.push(booking);

  res.status(201).json(booking);
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});

