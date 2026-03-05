"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveMessageRef = exports.updateBookingStatus = exports.getAllBookings = exports.getBookingById = exports.createBooking = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const DB_PATH = process.env.DB_PATH || path_1.default.join(__dirname, "..", "bookings.db");
const db = new better_sqlite3_1.default(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    serviceId   TEXT    NOT NULL,
    serviceName TEXT    NOT NULL,
    date        TEXT    NOT NULL,
    time        TEXT    NOT NULL,
    carModel    TEXT    NOT NULL,
    phone       TEXT    NOT NULL,
    comment     TEXT,
    createdAt   TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'pending',
    msgChatId   TEXT,
    msgId       INTEGER
  )
`);
const createBooking = (data) => {
    const createdAt = new Date().toISOString();
    const stmt = db.prepare(`
    INSERT INTO bookings (serviceId, serviceName, date, time, carModel, phone, comment, createdAt, status)
    VALUES (@serviceId, @serviceName, @date, @time, @carModel, @phone, @comment, @createdAt, 'pending')
  `);
    const result = stmt.run({ ...data, createdAt });
    return (0, exports.getBookingById)(result.lastInsertRowid);
};
exports.createBooking = createBooking;
const getBookingById = (id) => {
    return db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);
};
exports.getBookingById = getBookingById;
const getAllBookings = () => {
    return db.prepare("SELECT * FROM bookings ORDER BY createdAt DESC").all();
};
exports.getAllBookings = getAllBookings;
const updateBookingStatus = (id, status) => {
    db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, id);
    return (0, exports.getBookingById)(id);
};
exports.updateBookingStatus = updateBookingStatus;
const saveMessageRef = (bookingId, chatId, messageId) => {
    db.prepare("UPDATE bookings SET msgChatId = ?, msgId = ? WHERE id = ?").run(chatId, messageId, bookingId);
};
exports.saveMessageRef = saveMessageRef;
exports.default = db;
