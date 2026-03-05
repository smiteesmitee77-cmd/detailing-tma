import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "bookings.db");

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    serviceId      TEXT    NOT NULL,
    serviceName    TEXT    NOT NULL,
    date           TEXT    NOT NULL,
    time           TEXT    NOT NULL,
    carModel       TEXT    NOT NULL,
    phone          TEXT    NOT NULL,
    comment        TEXT,
    createdAt      TEXT    NOT NULL,
    status         TEXT    NOT NULL DEFAULT 'pending',
    msgChatId      TEXT,
    msgId          INTEGER,
    telegramUserId TEXT
  )
`);

// Миграция для существующих БД без колонки telegramUserId
try {
  db.exec("ALTER TABLE bookings ADD COLUMN telegramUserId TEXT");
} catch {
  // колонка уже существует — пропускаем
}

export type BookingStatus = "pending" | "confirmed" | "done" | "cancelled";

export type Booking = {
  id: number;
  serviceId: string;
  serviceName: string;
  date: string;
  time: string;
  carModel: string;
  phone: string;
  comment?: string;
  createdAt: string;
  status: BookingStatus;
  msgChatId?: string;
  msgId?: number;
  telegramUserId?: string;
};

export const createBooking = (data: Omit<Booking, "id" | "createdAt" | "status" | "msgChatId" | "msgId">): Booking => {
  const createdAt = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO bookings (serviceId, serviceName, date, time, carModel, phone, comment, createdAt, status, telegramUserId)
    VALUES (@serviceId, @serviceName, @date, @time, @carModel, @phone, @comment, @createdAt, 'pending', @telegramUserId)
  `);
  const result = stmt.run({ ...data, createdAt, telegramUserId: data.telegramUserId ?? null });
  return getBookingById(result.lastInsertRowid as number)!;
};

export const getBookingById = (id: number): Booking | undefined => {
  return db.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as Booking | undefined;
};

export const getAllBookings = (): Booking[] => {
  return db.prepare("SELECT * FROM bookings ORDER BY createdAt DESC").all() as Booking[];
};

export const updateBookingStatus = (id: number, status: BookingStatus): Booking | undefined => {
  db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, id);
  return getBookingById(id);
};

export const saveMessageRef = (bookingId: number, chatId: string, messageId: number) => {
  db.prepare("UPDATE bookings SET msgChatId = ?, msgId = ? WHERE id = ?").run(chatId, messageId, bookingId);
};

const RETENTION_DAYS = 7;

/**
 * Удаляет записи, созданные более RETENTION_DAYS дней назад.
 * Возвращает количество удалённых строк.
 */
export const deleteOldBookings = (): number => {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare("DELETE FROM bookings WHERE createdAt < ?").run(cutoff);
  return result.changes as number;
};

export default db;
