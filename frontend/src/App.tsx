import { useCallback, useEffect, useRef, useState } from "react";
import { DatePicker } from "./DatePicker";
import { TimePicker } from "./TimePicker";

type Service = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
};

type Booking = {
  id: string;
  serviceId: string;
  serviceName: string;
  date: string;
  time: string;
  clientName: string;
  carModel: string;
  phone: string;
  comment?: string;
  createdAt: string;
  status: "pending" | "confirmed" | "done" | "cancelled";
};

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

/** Телефон: +7/8/7 + 10 цифр */
const PHONE_RE = /^(\+7|7|8)\d{10}$/;

function formatPrice(price: number): string {
  return price.toLocaleString("ru-RU") + " ₽";
}

function App() {
  const [services, setServices] = useState<Service[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [clientName, setClientName] = useState<string>("");
  const [carModel, setCarModel] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [comment, setComment] = useState<string>("");
  const [serviceDropOpen, setServiceDropOpen] = useState(false);
  const serviceDropRef = useRef<HTMLDivElement>(null);
  // Показывать ли inline-ошибки (только после первой попытки отправить)
  const [submitted, setSubmitted] = useState(false);

  const twa = window.Telegram?.WebApp;
  const isInTelegram = !!(twa?.initData);
  const isFormValid = !!serviceId && !!date && !!time && !!clientName && !!carModel && !!phone;

  const fieldErrors = {
    serviceId: !serviceId ? "Выберите услугу" : null,
    date: !date ? "Выберите дату" : null,
    time: !time ? "Выберите время" : null,
    clientName: !clientName.trim() ? "Введите ваше имя" : null,
    carModel: !carModel.trim() ? "Введите модель автомобиля" : null,
    phone: !phone.trim()
      ? "Введите номер телефона"
      : !PHONE_RE.test(phone.replace(/\s/g, ""))
        ? "Формат: +79001234567"
        : null,
  };

  // Инициализация WebApp
  useEffect(() => {
    twa?.ready();
    twa?.expand();
    twa?.setHeaderColor("#080808");
    twa?.setBackgroundColor("#080808");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Закрытие дропдауна по клику вне
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (serviceDropRef.current && !serviceDropRef.current.contains(e.target as Node)) {
        setServiceDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Загрузка данных
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const initData = window.Telegram?.WebApp?.initData ?? "";
        const authHeader = initData ? { "X-Telegram-Init-Data": initData } : {};

        const [servicesRes, bookingsRes] = await Promise.all([
          fetch(`${API_BASE}/api/services`),
          fetch(`${API_BASE}/api/bookings`, { headers: authHeader }),
        ]);

        if (!servicesRes.ok) throw new Error("Ошибка загрузки услуг");
        if (!bookingsRes.ok) throw new Error("Ошибка загрузки броней");

        const servicesData: Service[] = await servicesRes.json();
        const bookingsData: Booking[] = await bookingsRes.json();
        setServices(servicesData);
        setBookings(bookingsData);

        if (servicesData.length > 0) setServiceId(servicesData[0].id);
      } catch (e) {
        console.error(e);
        setError("Не удалось загрузить данные. Проверь, запущен ли backend.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const submitBooking = useCallback(async () => {
    setSubmitted(true);

    if (!serviceId || !date || !time || !clientName || !carModel || !phone) {
      return;
    }

    const cleanPhone = phone.replace(/\s/g, "");
    if (!PHONE_RE.test(cleanPhone)) {
      return;
    }

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const initData = twa?.initData ?? "";
      const res = await fetch(`${API_BASE}/api/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(initData ? { "X-Telegram-Init-Data": initData } : {}),
        },
        body: JSON.stringify({
          serviceId,
          date,
          time,
          clientName,
          carModel,
          phone: cleanPhone,
          comment: comment || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Ошибка создания брони.");
      }

      const created: Booking = await res.json();
      setBookings((prev) => [created, ...prev]);
      setSuccess("Заявка отправлена! Мы свяжемся с тобой для подтверждения.");

      setTime("");
      setClientName("");
      setCarModel("");
      setPhone("");
      setComment("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Не удалось отправить заявку.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [serviceId, date, time, clientName, carModel, phone, comment, twa, setSubmitted]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitBooking();
  };

  const cancelBooking = useCallback(async (bookingId: string) => {
    if (!window.confirm("Отменить эту запись?")) return;
    const initData = twa?.initData ?? "";
    try {
      const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(initData ? { "X-Telegram-Init-Data": initData } : {}),
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || "Не удалось отменить запись.");
        return;
      }
      const updated: Booking = await res.json();
      setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
    }
  }, [twa]);

  // Авто-закрытие WebApp через 2.5с после успешной записи
  useEffect(() => {
    if (!success || !isInTelegram) return;
    const timer = setTimeout(() => twa?.close(), 2500);
    return () => clearTimeout(timer);
  }, [success, isInTelegram, twa]);
  useEffect(() => {
    if (!twa) return;
    twa.MainButton.hide();
  }, [twa]);

  const today = new Date().toISOString().slice(0, 10);

  const selectedService = services.find((s) => s.id === serviceId);
  const durationMin = selectedService?.durationMinutes ?? 60;
  const maxStartMin = 20 * 60 - durationMin;
  const minTime = (() => {
    if (date === today) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes() + 1;
      const clampedMin = Math.max(nowMin, 9 * 60);
      return [
        Math.floor(clampedMin / 60).toString().padStart(2, "0"),
        (clampedMin % 60).toString().padStart(2, "0"),
      ].join(":");
    }
    return "09:00";
  })();
  const maxTime = [
    Math.floor(maxStartMin / 60).toString().padStart(2, "0"),
    (maxStartMin % 60).toString().padStart(2, "0"),
  ].join(":");

  const occupiedSlotsForSelectedDate = bookings
    .filter((b) => b.date === date && b.status !== "cancelled")
    .map((b) => b.time);

  const statusLabel: Record<Booking["status"], string> = {
    pending:   "Новая",
    confirmed: "Подтверждена",
    done:      "Выполнена",
    cancelled: "Отменена",
  };

  return (
    <div className="app-root">
      <div className="bg-shapes" aria-hidden="true">
        <svg className="bg-poly" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          {/* верхняя зона — чёрно-серые тона */}
          <polygon points="0,0 200,0 120,160"              fill="rgba(30,30,30,0.95)" />
          <polygon points="200,0 390,0 280,140"             fill="rgba(18,18,18,0.98)" />
          <polygon points="120,160 280,140 390,0 200,0 0,0" fill="rgba(40,40,40,0.90)" />
          <polygon points="0,0 120,160 0,260"               fill="rgba(22,22,22,0.96)" />
          <polygon points="280,140 390,0 390,220"           fill="rgba(28,28,28,0.94)" />
          {/* средняя зона */}
          <polygon points="0,260 120,160 220,300"           fill="rgba(35,35,35,0.92)" />
          <polygon points="120,160 280,140 220,300"         fill="rgba(25,25,25,0.95)" />
          <polygon points="280,140 390,220 330,360"         fill="rgba(32,32,32,0.90)" />
          <polygon points="220,300 330,360 100,420"         fill="rgba(28,28,28,0.93)" />
          <polygon points="0,260 220,300 100,420"           fill="rgba(20,20,20,0.96)" />
          <polygon points="330,360 390,220 390,460"         fill="rgba(38,38,38,0.88)" />
          {/* нижняя зона */}
          <polygon points="0,420 100,420 60,580"            fill="rgba(22,22,22,0.95)" />
          <polygon points="100,420 330,360 250,520"         fill="rgba(30,30,30,0.90)" />
          <polygon points="330,360 390,460 390,600 250,520" fill="rgba(18,18,18,0.96)" />
          <polygon points="0,580 60,580 0,760"              fill="rgba(15,15,15,0.98)" />
          <polygon points="60,580 250,520 200,700"          fill="rgba(26,26,26,0.94)" />
          <polygon points="250,520 390,600 390,760 200,700" fill="rgba(20,20,20,0.96)" />
          <polygon points="0,760 200,700 0,844"             fill="rgba(12,12,12,0.99)" />
          <polygon points="200,700 390,760 390,844 0,844"   fill="rgba(16,16,16,0.98)" />
        </svg>
        <div className="bg-blur-overlay" />
        <div className="bg-shape bg-shape--circle1" />
        <div className="bg-shape bg-shape--circle2" />
        <div className="bg-shape bg-shape--circle3" />
      </div>
      <main className="app-container" style={isInTelegram ? { paddingBottom: "80px" } : undefined}>
        <header className="app-header">
          <h1>CARBASE</h1>
          <p>Оклейка · Мойка · Шиномонтаж</p>
        </header>

        <section className="card card-main">
          <h2>Новая запись</h2>
          <form className="booking-form" onSubmit={handleSubmit}>

            <div className="field">
              <label>Услуга</label>
              <div className="custom-select" ref={serviceDropRef}>
                <button
                  type="button"
                  className={`custom-select__trigger${serviceDropOpen ? " custom-select__trigger--open" : ""}${submitted && fieldErrors.serviceId ? " input-error" : ""}`}
                  onClick={() => !loading && services.length > 0 && setServiceDropOpen(o => !o)}
                  disabled={loading || services.length === 0}
                >
                  <span>
                    {loading
                      ? "Загружаем услуги…"
                      : selectedService
                        ? `${selectedService.name} — ${formatPrice(selectedService.price)}`
                        : "Выберите услугу"
                    }
                  </span>
                  <svg className="custom-select__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {serviceDropOpen && (
                  <ul className="custom-select__dropdown">
                    {services.map((s) => (
                      <li
                        key={s.id}
                        className={`custom-select__option${s.id === serviceId ? " custom-select__option--active" : ""}`}
                        onClick={() => { setServiceId(s.id); setServiceDropOpen(false); }}
                      >
                        <span className="custom-select__option-name">{s.name}</span>
                        <span className="custom-select__option-price">{formatPrice(s.price)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {selectedService && (
                <p className="field-hint">
                  {selectedService.description}&nbsp;
                  <span className="hint-duration">· {selectedService.durationMinutes} мин</span>
                </p>
              )}
              {submitted && fieldErrors.serviceId && <p className="field-error">{fieldErrors.serviceId}</p>}
            </div>

            <div className="field field-inline">
              <div>
                <label>Дата</label>
                <DatePicker
                  value={date}
                  min={today}
                  onChange={(v) => {
                    setDate(v);
                    if (v === today && time) {
                      const now = new Date();
                      const nowMin = now.getHours() * 60 + now.getMinutes();
                      const [h, m] = time.split(":").map(Number);
                      if (h * 60 + m <= nowMin) setTime("");
                    }
                  }}
                />
                {submitted && fieldErrors.date && <p className="field-error">{fieldErrors.date}</p>}
              </div>
              <div>
                <label>Время</label>
                <TimePicker
                  value={time}
                  min={minTime}
                  max={maxTime}
                  disabledSlots={occupiedSlotsForSelectedDate}
                  onChange={setTime}
                />
                {submitted && fieldErrors.time && <p className="field-error">{fieldErrors.time}</p>}
              </div>
            </div>

            <div className="field">
              <label>Имя</label>
              <input
                type="text"
                placeholder="Как к вам обращаться?"
                value={clientName}
                className={submitted && fieldErrors.clientName ? "input-error" : ""}
                onChange={(e) => setClientName(e.target.value)}
              />
              {submitted && fieldErrors.clientName && <p className="field-error">{fieldErrors.clientName}</p>}
            </div>

            <div className="field">
              <label>Автомобиль</label>
              <input
                type="text"
                placeholder="Например: BMW 5-Series, белый"
                value={carModel}
                className={submitted && fieldErrors.carModel ? "input-error" : ""}
                onChange={(e) => setCarModel(e.target.value)}
              />
              {submitted && fieldErrors.carModel && <p className="field-error">{fieldErrors.carModel}</p>}
            </div>

            <div className="field">
              <label>Телефон</label>
              <input
                type="tel"
                placeholder="+7 900 123-45-67"
                value={phone}
                className={submitted && fieldErrors.phone ? "input-error" : ""}
                onChange={(e) => setPhone(e.target.value)}
              />
              {submitted && fieldErrors.phone && <p className="field-error">{fieldErrors.phone}</p>}
            </div>

            <div className="field">
              <label>Комментарий</label>
              <textarea
                placeholder="Особые пожелания, цвет плёнки, пожелания по времени…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <button
              type="submit"
              className={`primary-button${!isFormValid ? " primary-button--dim" : ""}${submitting ? " primary-button--loading" : ""}`}
              disabled={submitting}
            >
              {submitting ? "Отправляем…" : "Записаться"}
            </button>
          </form>
        </section>

        <section className="card card-secondary">
          <div className="card-header-row">
            <h2>Мои записи</h2>
            <span className="badge">{bookings.length}</span>
          </div>
          {loading ? (
            <div className="skeleton-list">
              {[1, 2].map((n) => <div key={n} className="skeleton-item" />)}
            </div>
          ) : bookings.length === 0 ? (
            <p className="muted">Здесь появятся ваши записи</p>
          ) : (
            <ul className="booking-list">
              {bookings.map((b) => (
                <li key={b.id} className="booking-item">
                  <div className="booking-main">
                    <div className="booking-title">
                      <span className="service-name">{b.serviceName}</span>
                      <span className={`status status-${b.status}`}>
                        {statusLabel[b.status]}
                      </span>
                    </div>
                    <div className="booking-meta">
                      <span>{b.date} · {b.time}</span>
                      <span>{b.carModel}</span>
                    </div>
                  </div>
                  <div className="booking-extra">
                    <span className="phone">{b.phone}</span>
                    {b.comment && (
                      <span className="comment">«{b.comment}»</span>
                    )}
                  </div>
                  {(b.status === "pending" || b.status === "confirmed") && isInTelegram && (
                    <button
                      type="button"
                      className="cancel-button"
                      onClick={() => cancelBooking(b.id)}
                    >
                      Отменить
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
