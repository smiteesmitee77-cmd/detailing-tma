import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "bookings.db");

const db = new Database(DB_PATH);

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
};

export const createBooking = (data: Omit<Booking, "id" | "createdAt" | "status" | "msgChatId" | "msgId">): Booking => {
  const createdAt = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO bookings (serviceId, serviceName, date, time, carModel, phone, comment, createdAt, status)
    VALUES (@serviceId, @serviceName, @date, @time, @carModel, @phone, @comment, @createdAt, 'pending')
  `);
  const result = stmt.run({ ...data, createdAt });
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

export default db;
