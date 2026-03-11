import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;   // "HH:MM"
  min: string;     // "HH:MM"
  max: string;     // "HH:MM"
  onChange: (v: string) => void;
  disabledSlots?: string[]; // times that should appear dimmed/disabled
};

function buildSlots(min: string, max: string, step = 30): string[] {
  const [minH, minM] = min.split(":").map(Number);
  const [maxH, maxM] = max.split(":").map(Number);
  const minTotal = minH * 60 + minM;
  const maxTotal = maxH * 60 + maxM;
  const slots: string[] = [];
  for (let t = Math.ceil(minTotal / step) * step; t <= maxTotal; t += step) {
    const h = Math.floor(t / 60).toString().padStart(2, "0");
    const m = (t % 60).toString().padStart(2, "0");
    slots.push(`${h}:${m}`);
  }
  return slots;
}

export function TimePicker({ value, min, max, onChange, disabledSlots }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const slots = buildSlots(min, max);
  const disabledSet = new Set(disabledSlots ?? []);

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
        <span>{value || "Время"}</span>
        <svg className="custom-select__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="picker-dropdown picker-dropdown--time">
          <div className="time-slots">
            {slots.map((slot) => {
              const isDisabled = disabledSet.has(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  className={
                    `time-slot` +
                    (slot === value ? " time-slot--active" : "") +
                    (isDisabled ? " time-slot--disabled" : "")
                  }
                  disabled={isDisabled}
                  onClick={() => {
                    if (isDisabled) return;
                    onChange(slot);
                    setOpen(false);
                  }}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
