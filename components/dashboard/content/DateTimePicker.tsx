'use client';

import { DayPicker } from 'react-day-picker';
import { es, enUS } from 'date-fns/locale';
import 'react-day-picker/style.css';

interface DateTimePickerProps {
  value:     Date | null;
  onChange:  (date: Date | null) => void;
  /** Disallow dates before this (default: now). */
  minDate?:  Date;
  lang?:     'es' | 'en';
}

export default function DateTimePicker({ value, onChange, minDate, lang = 'es' }: DateTimePickerProps) {
  const min = minDate ?? new Date();
  const locale = lang === 'en' ? enUS : es;

  const hours   = value ? value.getHours()   : 9;
  const minutes = value ? value.getMinutes() : 0;

  function handleDayChange(day: Date | undefined) {
    if (!day) { onChange(null); return; }
    const next = new Date(day);
    next.setHours(hours, minutes, 0, 0);
    onChange(next);
  }

  function handleTimeChange(h: number, m: number) {
    const base = value ?? new Date();
    const next = new Date(base);
    next.setHours(h, m, 0, 0);
    onChange(next);
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div className="kefy-daypicker" style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 8,
      }}>
        <DayPicker
          mode="single"
          selected={value ?? undefined}
          onSelect={handleDayChange}
          locale={locale}
          disabled={{ before: min }}
          weekStartsOn={1}
          showOutsideDays
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
          {lang === 'en' ? 'Time' : 'Hora'}
        </label>
        <input
          type="number"
          min={0}
          max={23}
          value={hours}
          onChange={(e) => handleTimeChange(Math.max(0, Math.min(23, Number(e.target.value) || 0)), minutes)}
          style={timeInputStyle}
          aria-label={lang === 'en' ? 'Hours' : 'Horas'}
        />
        <span style={{ fontWeight: 700, color: 'var(--muted)' }}>:</span>
        <input
          type="number"
          min={0}
          max={59}
          step={5}
          value={String(minutes).padStart(2, '0')}
          onChange={(e) => handleTimeChange(hours, Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
          style={timeInputStyle}
          aria-label={lang === 'en' ? 'Minutes' : 'Minutos'}
        />
        {value && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
            {value.toLocaleString(lang === 'en' ? 'en-US' : 'es-ES', {
              weekday: 'short', day: '2-digit', month: 'short',
              hour: '2-digit', minute: '2-digit',
            })}
          </span>
        )}
      </div>

      <style jsx global>{`
        .kefy-daypicker .rdp-root {
          --rdp-accent-color: var(--accent);
          --rdp-accent-background-color: rgba(198,255,75,0.18);
          --rdp-background-color: var(--bg);
          --rdp-day-height: 36px;
          --rdp-day-width: 36px;
          --rdp-day_button-height: 32px;
          --rdp-day_button-width: 32px;
          --rdp-day_button-border-radius: 8px;
          --rdp-selected-border: 2px solid var(--accent);
          --rdp-today-color: var(--accent);
          color: var(--text);
          font-size: 13px;
        }
        .kefy-daypicker .rdp-caption_label { font-weight: 700; }
        .kefy-daypicker .rdp-chevron       { fill: var(--text); }
        .kefy-daypicker .rdp-day_button:hover:not([disabled]) {
          background: rgba(198,255,75,0.10);
        }
        .kefy-daypicker .rdp-selected .rdp-day_button {
          background: var(--accent);
          color: #000;
          font-weight: 700;
        }
        .kefy-daypicker .rdp-disabled { opacity: 0.3; }
        .kefy-daypicker .rdp-weekday  { color: var(--muted); font-weight: 600; }
      `}</style>
    </div>
  );
}

const timeInputStyle: React.CSSProperties = {
  width: 56,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 13,
  color: 'var(--text)',
  textAlign: 'center',
  outline: 'none',
  MozAppearance: 'textfield',
};
