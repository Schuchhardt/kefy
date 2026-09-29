'use client';

// Día + hora de una publicación programada. La hora es un <input type="time">:
// en el móvil abre el selector nativo (antes eran dos campos numéricos, horas
// y minutos, que había que teclear).

import { useId } from 'react';
import { DayPicker } from 'react-day-picker';
import { es, enUS } from 'react-day-picker/locale';
import 'react-day-picker/style.css';
import esPublish from '@/locales/es/dashboard/publish';
import enPublish from '@/locales/en/dashboard/publish';
import styles from './DateTimePicker.module.css';

interface DateTimePickerProps {
  value:     Date | null;
  onChange:  (date: Date | null) => void;
  /** Disallow dates before this (default: now). */
  minDate?:  Date;
  lang?:     'es' | 'en';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `HH:MM` para el input; sin fecha elegida, las 09:00. */
function timeValue(value: Date | null): string {
  return value ? `${pad(value.getHours())}:${pad(value.getMinutes())}` : '09:00';
}

export default function DateTimePicker({ value, onChange, minDate, lang = 'es' }: DateTimePickerProps) {
  const t = (lang === 'en' ? enPublish : esPublish).dateTime;
  const dayLabelId = useId();
  const timeId = useId();
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

  function handleTimeChange(raw: string) {
    const [h, m] = raw.split(':').map(Number);
    // Borrar el campo no borra la fecha: se ignora hasta que haya una hora.
    if (!Number.isInteger(h) || !Number.isInteger(m)) return;
    const next = new Date(value ?? new Date());
    next.setHours(h, m, 0, 0);
    onChange(next);
  }

  return (
    <div className={styles.root}>
      <p id={dayLabelId} className="sr-only">{t.dayLabel}</p>
      <div className={styles.calendar}>
        <DayPicker
          mode="single"
          selected={value ?? undefined}
          onSelect={handleDayChange}
          locale={locale}
          disabled={{ before: min }}
          weekStartsOn={1}
          showOutsideDays
          aria-labelledby={dayLabelId}
        />
      </div>

      <div className={styles.timeRow}>
        <label htmlFor={timeId} className={styles.timeLabel}>{t.timeLabel}</label>
        <input
          id={timeId}
          type="time"
          className={`ui-input ${styles.time}`}
          value={timeValue(value)}
          onChange={(e) => handleTimeChange(e.target.value)}
        />
        {value && (
          <p className={styles.summary} aria-live="polite">
            {t.summary(value.toLocaleString(lang === 'en' ? 'en-US' : 'es-ES', {
              weekday: 'long', day: 'numeric', month: 'long',
              hour: '2-digit', minute: '2-digit',
            }))}
          </p>
        )}
      </div>
    </div>
  );
}
