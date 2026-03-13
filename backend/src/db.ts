import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

function resolveDbPath(): string {
  // Приоритет: явная переменная → /data (Render disk) → рядом с dist/
  const candidates = [
    process.env.DB_PATH,
    process.env.NODE_ENV === "production" ? "/data/bookings.db" : undefined,
    path.join(__dirname, "..", "bookings.db"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const dir = path.dirname(candidate);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Проверяем что директория доступна для записи
      fs.accessSync(dir, fs.constants.W_OK);
      return candidate;
    } catch {
      console.warn(`[db] Директория ${dir} недоступна, пробуем следующий вариант...`);
    }
  }

  // Абсолютный fallback — текущая рабочая директория
  const fallback = path.join(process.cwd(), "bookings.db");
  console.warn(`[db] Используем fallback путь: ${fallback}`);
  return fallback;
}

const DB_PATH = resolveDbPath();
console.log(`[db] База данных: ${DB_PATH}`);

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

db.exec(`
  CREATE TABLE IF NOT EXISTS services (
    id              TEXT    PRIMARY KEY,
    name            TEXT    NOT NULL,
    description     TEXT    NOT NULL DEFAULT '',
    durationMinutes INTEGER NOT NULL DEFAULT 60,
    price           INTEGER NOT NULL DEFAULT 0,
    sortOrder       INTEGER NOT NULL DEFAULT 0,
    active          INTEGER NOT NULL DEFAULT 1
  )
`);

// Миграция: колонка для отметки об отправке напоминания
try {
  db.exec("ALTER TABLE bookings ADD COLUMN reminderSent INTEGER NOT NULL DEFAULT 0");
} catch {
  // колонка уже существует
}

// Засеваем дефолтные услуги если таблица пустая
const serviceCount = (db.prepare("SELECT COUNT(*) as cnt FROM services").get() as { cnt: number }).cnt;
if (serviceCount === 0) {
  const insert = db.prepare(
    "INSERT INTO services (id, name, description, durationMinutes, price, sortOrder) VALUES (?, ?, ?, ?, ?, ?)"
  );
  insert.run("wrap",  "Оклейка авто",  "Защитная или декоративная оклейка кузова плёнкой.", 240, 15000, 1);
  insert.run("wash",  "Мойка",         "Комплексная мойка кузова и салона.",                  60,  1500, 2);
  insert.run("tires", "Замена шин",    "Сезонная переобувка и балансировка.",                 90,  2000, 3);
}

// Миграция для существующих БД без колонки telegramUserId
try {
  db.exec("ALTER TABLE bookings ADD COLUMN telegramUserId TEXT");
} catch {
  // колонка уже существует — пропускаем
}

// Миграция для существующих БД без колонки clientName
try {
  db.exec("ALTER TABLE bookings ADD COLUMN clientName TEXT");
} catch {
  // колонка уже существует — пропускаем
}

export type Service = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  sortOrder: number;
  active: number;
};

export const getAllServices = (): Service[] => {
  return db.prepare("SELECT * FROM services WHERE active = 1 ORDER BY sortOrder ASC").all() as Service[];
};

export const getServiceById = (id: string): Service | undefined => {
  return db.prepare("SELECT * FROM services WHERE id = ?").get(id) as Service | undefined;
};

export const upsertService = (data: Omit<Service, "active">): Service => {
  db.prepare(`
    INSERT INTO services (id, name, description, durationMinutes, price, sortOrder, active)
    VALUES (@id, @name, @description, @durationMinutes, @price, @sortOrder, 1)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      durationMinutes = excluded.durationMinutes,
      price = excluded.price,
      sortOrder = excluded.sortOrder
  `).run(data);
  return getServiceById(data.id)!;
};

export const deleteService = (id: string): boolean => {
  const result = db.prepare("UPDATE services SET active = 0 WHERE id = ?").run(id);
  return result.changes > 0;
};

export type BookingStatus = "pending" | "confirmed" | "done" | "cancelled";

/** Возвращает активные записи на указанную дату, которым ещё не отправили напоминание */
export const getBookingsForReminder = (date: string): Booking[] => {
  return db.prepare(
    "SELECT * FROM bookings WHERE date = ? AND status NOT IN ('cancelled', 'done') AND reminderSent = 0"
  ).all(date) as Booking[];
};

export const markReminderSent = (id: number): void => {
  db.prepare("UPDATE bookings SET reminderSent = 1 WHERE id = ?").run(id);
};

export type Booking = {
  id: number;
  serviceId: string;
  serviceName: string;
  date: string;
  time: string;
  clientName: string;
  carModel: string;
  phone: string;
  comment?: string;
  createdAt: string;
  status: BookingStatus;
  msgChatId?: string;
  msgId?: number;
  telegramUserId?: string;
  reminderSent?: number;
};

export const createBooking = (data: Omit<Booking, "id" | "createdAt" | "status" | "msgChatId" | "msgId">): Booking => {
  const createdAt = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO bookings (serviceId, serviceName, date, time, clientName, carModel, phone, comment, createdAt, status, telegramUserId)
    VALUES (@serviceId, @serviceName, @date, @time, @clientName, @carModel, @phone, @comment, @createdAt, 'pending', @telegramUserId)
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

export const getBookingsByUserId = (telegramUserId: string): Booking[] => {
  return db
    .prepare("SELECT * FROM bookings WHERE telegramUserId = ? ORDER BY createdAt DESC")
    .all(telegramUserId) as Booking[];
};

export const updateBookingStatus = (id: number, status: BookingStatus): Booking | undefined => {
  db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, id);
  return getBookingById(id);
};

export const saveMessageRef = (bookingId: number, chatId: string, messageId: number) => {
  db.prepare("UPDATE bookings SET msgChatId = ?, msgId = ? WHERE id = ?").run(chatId, messageId, bookingId);
};

const RETENTION_DAYS = 60;

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
