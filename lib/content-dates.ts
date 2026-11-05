// ─── Fecha de las tarjetas de «Mis contenidos» ───────────────────────────────
//
// La fecha que importa depende del estado: cuándo sale lo programado, cuándo
// salió lo publicado y cuándo se creó el resto. Es la misma que ordena
// `kefy_publication_at` en la base de datos.

type Lang = 'es' | 'en';

export interface CardDateItem {
  status: string;
  created_at: string;
  next_scheduled_at?: string | null;
  last_published_at?: string | null;
}

export type CardDate =
  | { kind: 'scheduled' | 'published' | 'created'; iso: string };

interface FormatOptions {
  /** Para los tests; por defecto, la zona del navegador. */
  timeZone?: string;
  now?: Date;
}

function dateParts(iso: string, lang: Lang, opts: FormatOptions) {
  const fmt = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es-ES', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hourCycle: lang === 'en' ? 'h12' : 'h23',
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  });
  const parts = fmt.formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value.replace('.', '') ?? '';
  const thisYear = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  }).format(opts.now ?? new Date());
  return {
    weekday: get('weekday'), day: get('day'), month: get('month'),
    year: get('year') === thisYear ? '' : ` ${get('year')}`,
    hour: lang === 'en' ? get('hour') : get('hour').padStart(2, '0'),
    minute: get('minute'),
    period: get('dayPeriod').replace(/\s/g, ''),
  };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «Dom 8 nov · 19:00» / «Sun, Nov 8 · 7:00 PM». */
export function formatCardDateTime(iso: string, lang: Lang, opts: FormatOptions = {}): string {
  const p = dateParts(iso, lang, opts);
  return lang === 'en'
    ? `${p.weekday}, ${p.month} ${p.day}${p.year} · ${p.hour}:${p.minute} ${p.period}`
    : `${capitalize(p.weekday)} ${p.day} ${p.month}${p.year} · ${p.hour}:${p.minute}`;
}

/** «8 nov» / «Nov 8». */
export function formatCardDay(iso: string, lang: Lang, opts: FormatOptions = {}): string {
  const p = dateParts(iso, lang, opts);
  return lang === 'en' ? `${p.month} ${p.day}${p.year}` : `${p.day} ${p.month}${p.year}`;
}

/** Qué fecha enseña la tarjeta. Sin fecha conocida, la de creación. */
export function contentCardDate(item: CardDateItem): CardDate {
  if (item.status === 'scheduled' && item.next_scheduled_at) return { kind: 'scheduled', iso: item.next_scheduled_at };
  if (item.status === 'published' && item.last_published_at) return { kind: 'published', iso: item.last_published_at };
  return { kind: 'created', iso: item.created_at };
}
