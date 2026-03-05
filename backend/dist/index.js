"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const db_1 = require("./db");
const bot_1 = require("./bot");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:5173";
app.use((0, cors_1.default)({
    origin: ALLOWED_ORIGIN,
}));
app.use(express_1.default.json());
const services = [
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
    res.json((0, db_1.getAllBookings)());
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
    const booking = (0, db_1.createBooking)({
        serviceId,
        serviceName: service.name,
        date,
        time,
        carModel,
        phone,
        comment: comment || undefined,
    });
    (0, bot_1.notifyAdmin)(booking).catch((e) => console.error("Ошибка уведомления бота:", e));
    res.status(201).json(booking);
});
app.patch("/api/bookings/:id/status", (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    const allowed = ["pending", "confirmed", "done", "cancelled"];
    if (!status || !allowed.includes(status)) {
        return res.status(400).json({ error: "Некорректный статус." });
    }
    const updated = (0, db_1.updateBookingStatus)(id, status);
    if (!updated) {
        return res.status(404).json({ error: "Бронь не найдена." });
    }
    res.json(updated);
});
app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
});
if (process.env.BOT_TOKEN) {
    bot_1.bot.launch().then(() => {
        console.log("Bot started.");
    });
    process.once("SIGINT", () => bot_1.bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot_1.bot.stop("SIGTERM"));
}
else {
    console.warn("BOT_TOKEN не задан — бот не запущен.");
}
