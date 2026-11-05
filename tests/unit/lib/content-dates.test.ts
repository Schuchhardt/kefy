import { describe, it, expect } from 'vitest';
import { contentCardDate, formatCardDateTime, formatCardDay } from '@/lib/content-dates';

const opts = { timeZone: 'America/Santiago', now: new Date('2026-11-05T12:00:00Z') };
// Domingo 8 de noviembre, 19:00 en Santiago (UTC-3).
const SUNDAY = '2026-11-08T22:00:00Z';

describe('formatCardDateTime', () => {
  it('formato corto, con día de la semana y hora', () => {
    expect(formatCardDateTime(SUNDAY, 'es', opts)).toBe('Dom 8 nov · 19:00');
    expect(formatCardDateTime(SUNDAY, 'en', opts)).toBe('Sun, Nov 8 · 7:00 PM');
  });

  it('medianoche es 00:00, no 24:00, y las horas llevan dos dígitos', () => {
    expect(formatCardDateTime('2026-11-09T03:00:00Z', 'es', opts)).toBe('Lun 9 nov · 00:00');
    expect(formatCardDateTime('2026-11-09T12:05:00Z', 'es', opts)).toBe('Lun 9 nov · 09:05');
  });

  it('muestra el año solo si no es el actual', () => {
    expect(formatCardDateTime('2027-01-10T22:00:00Z', 'es', opts)).toBe('Dom 10 ene 2027 · 19:00');
  });
});

describe('formatCardDay', () => {
  it('día y mes', () => {
    expect(formatCardDay(SUNDAY, 'es', opts)).toBe('8 nov');
    expect(formatCardDay(SUNDAY, 'en', opts)).toBe('Nov 8');
  });
});

describe('contentCardDate', () => {
  const created_at = '2026-11-04T10:00:00Z';

  it('programado: la fecha a la que sale, no la de creación', () => {
    expect(contentCardDate({ status: 'scheduled', created_at, next_scheduled_at: SUNDAY }))
      .toEqual({ kind: 'scheduled', iso: SUNDAY });
  });

  it('publicado: la fecha a la que salió', () => {
    expect(contentCardDate({ status: 'published', created_at, last_published_at: SUNDAY }))
      .toEqual({ kind: 'published', iso: SUNDAY });
  });

  it('el resto, o sin fecha conocida: la de creación', () => {
    for (const item of [
      { status: 'draft', created_at },
      { status: 'approved', created_at },
      { status: 'scheduled', created_at, next_scheduled_at: null },
      { status: 'published', created_at, last_published_at: null },
    ]) {
      expect(contentCardDate(item)).toEqual({ kind: 'created', iso: created_at });
    }
  });
});
