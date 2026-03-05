import { useEffect, useRef, useState } from "react";

type Props = {
  value: string; // "YYYY-MM-DD"
  min: string;   // "YYYY-MM-DD"
  onChange: (v: string) => void;
};

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function formatDisplay(value: string): string {
  if (!value) return "Выберите дату";
  const [y, m, d] = value.split("-");
  return `${d} ${MONTHS[parseInt(m) - 1]} ${y}`;
}

type DrumProps = {
  items: string[];
  selectedIndex: number;
  onSelect: (i: number) => void;
};

function Drum({ items, selectedIndex, onSelect }: DrumProps) {
  const ref = useRef<HTMLDivElement>(null);
  const itemH = 40;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = selectedIndex * itemH;
  }, [selectedIndex]);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / itemH);
    if (idx !== selectedIndex) onSelect(Math.max(0, Math.min(idx, items.length - 1)));
  };

  return (
    <div className="drum-wrap">
      <div className="drum-fade-top" />
      <div className="drum-fade-bottom" />
      <div className="drum-selector" />
      <div
        ref={ref}
        className="drum-scroll"
        onScroll={handleScroll}
        style={{ height: itemH * 5 }}
      >
        {/* padding items */}
        <div style={{ height: itemH * 2 }} />
        {items.map((item, i) => (
          <div
            key={item}
            className={`drum-item${i === selectedIndex ? " drum-item--active" : ""}`}
            style={{ height: itemH }}
            onClick={() => {
              onSelect(i);
              if (ref.current) ref.current.scrollTop = i * itemH;
            }}
          >
            {item}
          </div>
        ))}
        <div style={{ height: itemH * 2 }} />
      </div>
    </div>
  );
}

export function DatePicker({ value, min, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const today = new Date(min);
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  const parsed = value ? new Date(value) : today;
  const [selYear, setSelYear] = useState(parsed.getFullYear());
  const [selMonth, setSelMonth] = useState(parsed.getMonth());
  const [selDay, setSelDay] = useState(parsed.getDate());

  const years = Array.from({ length: 3 }, (_, i) => String(todayY + i));
  const months = MONTHS.map((m, i) => ({ label: m, idx: i }));
  const totalDays = daysInMonth(selYear, selMonth);
  const minDay = selYear === todayY && selMonth === todayM ? todayD : 1;
  const days = Array.from({ length: totalDays - minDay + 1 }, (_, i) =>
    String(i + minDay).padStart(2, "0")
  );

  const yearIdx = years.indexOf(String(selYear));
  const monthIdx = months.findIndex((m) => m.idx === selMonth);
  const dayIdx = days.indexOf(String(selDay).padStart(2, "0"));

  const confirm = () => {
    const d = String(selDay).padStart(2, "0");
    const m = String(selMonth + 1).padStart(2, "0");
    onChange(`${selYear}-${m}-${d}`);
    setOpen(false);
  };

  // adjust day if out of range after month/year change
  useEffect(() => {
    const max = daysInMonth(selYear, selMonth);
    const min2 = selYear === todayY && selMonth === todayM ? todayD : 1;
    if (selDay > max) setSelDay(max);
    if (selDay < min2) setSelDay(min2);
  }, [selYear, selMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="custom-picker" ref={ref}>
      <button
        type="button"
        className={`custom-select__trigger${open ? " custom-select__trigger--open" : ""}${!value ? " custom-select__trigger--placeholder" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{formatDisplay(value)}</span>
        <svg className="custom-select__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="picker-dropdown">
          <div className="picker-drums">
            <Drum
              items={days}
              selectedIndex={Math.max(0, dayIdx)}
              onSelect={(i) => setSelDay(parseInt(days[i]))}
            />
            <Drum
              items={months.map((m) => m.label)}
              selectedIndex={Math.max(0, monthIdx)}
              onSelect={(i) => setSelMonth(months[i].idx)}
            />
            <Drum
              items={years}
              selectedIndex={Math.max(0, yearIdx)}
              onSelect={(i) => setSelYear(parseInt(years[i]))}
            />
          </div>
          <button type="button" className="picker-confirm" onClick={confirm}>
            Готово
          </button>
        </div>
      )}
    </div>
  );
}
