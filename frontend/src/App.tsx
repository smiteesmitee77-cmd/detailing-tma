import { useCallback, useEffect, useState } from "react";

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

  const twa = window.Telegram?.WebApp;
  const isInTelegram = !!(twa?.initData);
  const isFormValid = !!serviceId && !!date && !!time && !!clientName && !!carModel && !!phone;

  // Инициализация WebApp
  useEffect(() => {
    twa?.ready();
    twa?.expand();
    twa?.setHeaderColor("#050508");
    twa?.setBackgroundColor("#050508");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!serviceId || !date || !time || !clientName || !carModel || !phone) {
      setError("Заполни все обязательные поля.");
      return;
    }

    const cleanPhone = phone.replace(/\s/g, "");
    if (!PHONE_RE.test(cleanPhone)) {
      setError("Некорректный номер телефона. Формат: +79001234567");
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
  }, [serviceId, date, time, clientName, carModel, phone, comment, twa]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitBooking();
  };

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
          {/* верхняя зона */}
          <polygon points="0,0 200,0 120,160"         fill="rgba(40,55,120,0.85)" />
          <polygon points="200,0 390,0 280,140"        fill="rgba(25,35,90,0.90)" />
          <polygon points="120,160 280,140 390,0 200,0 0,0" fill="rgba(55,70,150,0.70)" />
          <polygon points="0,0 120,160 0,260"          fill="rgba(30,42,100,0.88)" />
          <polygon points="280,140 390,0 390,220"      fill="rgba(45,30,110,0.82)" />
          {/* средняя зона */}
          <polygon points="0,260 120,160 220,300"      fill="rgba(50,65,140,0.80)" />
          <polygon points="120,160 280,140 220,300"    fill="rgba(35,50,125,0.85)" />
          <polygon points="280,140 390,220 330,360"    fill="rgba(55,40,130,0.78)" />
          <polygon points="220,300 330,360 100,420"    fill="rgba(40,58,135,0.82)" />
          <polygon points="0,260 220,300 100,420"      fill="rgba(28,40,105,0.88)" />
          <polygon points="330,360 390,220 390,460"    fill="rgba(50,35,120,0.75)" />
          {/* нижняя зона */}
          <polygon points="0,420 100,420 60,580"       fill="rgba(32,45,110,0.88)" />
          <polygon points="100,420 330,360 250,520"    fill="rgba(45,60,140,0.80)" />
          <polygon points="330,360 390,460 390,600 250,520" fill="rgba(38,28,100,0.82)" />
          <polygon points="0,580 60,580 0,760"         fill="rgba(22,32,88,0.90)" />
          <polygon points="60,580 250,520 200,700"     fill="rgba(42,55,130,0.78)" />
          <polygon points="250,520 390,600 390,760 200,700" fill="rgba(48,35,115,0.80)" />
          <polygon points="0,760 200,700 0,844"        fill="rgba(20,28,80,0.92)" />
          <polygon points="200,700 390,760 390,844 0,844" fill="rgba(35,25,95,0.85)" />
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
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                disabled={loading || services.length === 0}
              >
                {loading
                  ? <option>Загружаем услуги…</option>
                  : services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {formatPrice(s.price)}
                    </option>
                  ))
                }
              </select>
              {selectedService && (
                <p className="field-hint">
                  {selectedService.description}&nbsp;
                  <span className="hint-duration">· {selectedService.durationMinutes} мин</span>
                </p>
              )}
            </div>

            <div className="field field-inline">
              <div>
                <label>Дата</label>
                <input
                  type="date"
                  value={date}
                  min={today}
                  placeholder="дд.мм.гггг"
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setDate(newDate);
                    if (newDate === today && time) {
                      const now = new Date();
                      const nowMin = now.getHours() * 60 + now.getMinutes();
                      const [h, m] = time.split(":").map(Number);
                      if (h * 60 + m <= nowMin) setTime("");
                    }
                  }}
                />
              </div>
              <div>
                <label>Время</label>
                <input
                  type="time"
                  value={time}
                  min={minTime}
                  max={maxTime}
                  placeholder="09:00"
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>Имя</label>
              <input
                type="text"
                placeholder="Как к вам обращаться?"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Автомобиль</label>
              <input
                type="text"
                placeholder="Например: BMW 5-Series, белый"
                value={carModel}
                onChange={(e) => setCarModel(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Телефон</label>
              <input
                type="tel"
                placeholder="+7 900 123-45-67"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
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
