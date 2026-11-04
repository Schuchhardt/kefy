// Utilidades puras de la vista (sin React ni host): las cubren los tests de
// tests/unit/mcp-app/format.test.ts.

export type Lang = 'es' | 'en';

/** Idioma de la vista: el locale del host manda; si no, el de la vista del servidor. */
export function pickLang(hostLocale: string | undefined, fallback: Lang | undefined): Lang {
  const l = (hostLocale ?? '').toLowerCase();
  if (l.startsWith('es')) return 'es';
  if (l.startsWith('en')) return 'en';
  return fallback ?? 'es';
}

/** Fecha y hora legibles en el idioma y la zona del host. */
export function formatDateTime(iso: string | null | undefined, locale: string, timeZone?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
  try {
    return new Intl.DateTimeFormat(locale, timeZone ? { ...opts, timeZone } : opts).format(d);
  } catch {
    return new Intl.DateTimeFormat(locale, opts).format(d);
  }
}

export function formatDate(iso: string | null | undefined, locale: string, timeZone?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, timeZone ? { dateStyle: 'medium', timeZone } : { dateStyle: 'medium' }).format(d);
  } catch {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
  }
}

/** «#a, b  #c» → ['a', 'b', 'c'] (sin #, sin repetidos, máx. 30). */
export function parseHashtags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const tag = raw.replace(/^#+/, '').trim();
    if (tag && !out.includes(tag)) out.push(tag.slice(0, 100));
  }
  return out.slice(0, 30);
}

export function hashtagsText(tags: string[]): string {
  return tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
}

/**
 * Prompt de generate_content_image a partir de la instrucción del usuario
 * («más cálida, con el logo más chico»): la herramienta genera desde cero, así
 * que se le recuerda de qué trata la pieza y que conserve la imagen actual
 * (que viaja como referencia). Máx. 1000 caracteres, como exige la herramienta.
 */
export function regeneratePrompt(instruction: string, subject: string | null, hasReference: boolean): string {
  const parts = [instruction.trim()];
  const topic = (subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (topic) parts.push(`Subject: ${topic}`);
  if (hasReference) parts.push('Keep the subject and composition of the reference image; apply only the requested changes.');
  return parts.join('. ').slice(0, 1000);
}

/** Margen mínimo para programar desde la vista (el servidor exige > 2 min). */
export const MIN_SCHEDULE_MINUTES = 5;

/**
 * Valor de <input type="datetime-local"> (hora local del navegador) → ISO con
 * zona, como pide publish_content. null si es inválido o demasiado pronto.
 */
export function scheduleIso(localValue: string, now = Date.now()): string | null {
  if (!localValue) return null;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() - now < MIN_SCHEDULE_MINUTES * 60_000) return null;
  return d.toISOString();
}

/** Valor por defecto del selector: dentro de una hora, redondeado al cuarto. */
export function defaultScheduleValue(now = new Date()): string {
  const d = new Date(now.getTime() + 60 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function percent(progress: number): number {
  return Math.round(Math.max(0, Math.min(1, progress || 0)) * 100);
}

/** Texto de una vista sin título: el comienzo del cuerpo. */
export function displayTitle(title: string | null | undefined, body: string | null | undefined, fallback: string): string {
  const t = (title ?? '').trim();
  if (t) return t;
  const b = (body ?? '').replace(/\s+/g, ' ').trim();
  return b ? (b.length > 60 ? `${b.slice(0, 60)}…` : b) : fallback;
}
