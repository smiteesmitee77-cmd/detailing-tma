import { useEffect, useState } from "react";

type Service = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
};

type Booking = {
  id: string;
  serviceId: string;
  serviceName: string;
  date: string;
  time: string;
  carModel: string;
  phone: string;
  comment?: string;
  createdAt: string;
  status: "pending" | "confirmed" | "done" | "cancelled";
};

const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:4000";

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
  const [carModel, setCarModel] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [comment, setComment] = useState<string>("");

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [servicesRes, bookingsRes] = await Promise.all([
          fetch(`${API_BASE}/api/services`),
          fetch(`${API_BASE}/api/bookings`),
        ]);

        if (!servicesRes.ok) {
          throw new Error("Ошибка загрузки услуг");
        }
        if (!bookingsRes.ok) {
          throw new Error("Ошибка загрузки броней");
        }

        const servicesData: Service[] = await servicesRes.json();
        const bookingsData: Booking[] = await bookingsRes.json();
        setServices(servicesData);
        setBookings(bookingsData);

        if (servicesData.length > 0) {
          setServiceId(servicesData[0].id);
        }
      } catch (e) {
        console.error(e);
        setError("Не удалось загрузить данные. Проверь, запущен ли backend.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!serviceId || !date || !time || !carModel || !phone) {
      setError("Заполни все обязательные поля.");
      return;
    }

    try {
      setSubmitting(true);
      const initData = window.Telegram?.WebApp?.initData ?? "";
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
          carModel,
          phone,
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
      setCarModel("");
      setPhone("");
      setComment("");
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Не удалось отправить заявку.");
    } finally {
      setSubmitting(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="app-root">
      <div className="background-glow" />
      <main className="app-container">
        <header className="app-header">
          <h1>CARBASE</h1>
          <p>Запись на оклейку, мойку и замену шин</p>
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
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {serviceId && (
                <p className="field-hint">
                  {services.find((s) => s.id === serviceId)?.description}
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
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <label>Время</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>Авто</label>
              <input
                type="text"
                placeholder="Марка и модель"
                value={carModel}
                onChange={(e) => setCarModel(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Телефон</label>
              <input
                type="tel"
                placeholder="+7..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Комментарий (опционально)</label>
              <textarea
                placeholder="Особые пожелания, цвет плёнки и т.п."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <button
              type="submit"
              className="primary-button"
              disabled={submitting}
            >
              {submitting ? "Отправляем..." : "Записаться"}
            </button>
          </form>
        </section>

        <section className="card card-secondary">
          <div className="card-header-row">
            <h2>Последние заявки</h2>
            <span className="badge">{bookings.length}</span>
          </div>
          {loading ? (
            <p className="muted">Загружаем данные...</p>
          ) : bookings.length === 0 ? (
            <p className="muted">Пока нет ни одной заявки.</p>
          ) : (
            <ul className="booking-list">
              {bookings.map((b) => (
                <li key={b.id} className="booking-item">
                  <div className="booking-main">
                    <div className="booking-title">
                      <span className="service-name">{b.serviceName}</span>
                      <span className={`status status-${b.status}`}>
                        {b.status === "pending" && "Новая"}
                        {b.status === "confirmed" && "Подтверждена"}
                        {b.status === "done" && "Выполнена"}
                        {b.status === "cancelled" && "Отменена"}
                      </span>
                    </div>
                    <div className="booking-meta">
                      <span>
                        {b.date} в {b.time}
                      </span>
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

