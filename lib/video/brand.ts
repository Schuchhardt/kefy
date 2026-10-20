// ─── Marca del video ──────────────────────────────────────────────────────────
//
// Todo lo que el video toma del Brand Kit, en un solo lugar. Hay dos partes:
//
//   resolveFilmTheme  — el diseño: colores, tipografías, logo y cierre. La
//                       composición KefyFilm recibe esto ya resuelto.
//   videoBrandBrief   — el copy: lo que Claude tiene que saber de la marca
//                       para escribir el guion con su voz.
//
// Un Brand Kit real viene incompleto, con colores en formatos raros, fuentes
// de pago que Google no tiene y logos oscuros. Por eso cada campo se valida y
// tiene un respaldo pensado como diseño propio, no como un hueco:
//
//   - Acento amarillo cálido (#FFD23F) sobre tinta: el estilo de subtítulos
//     de los reels nativos, que se lee sobre cualquier foto.
//   - Montserrat para titulares y subtítulos: geométrica, gruesa y con tildes
//     y ñ completas.
//   - Sin logo, un wordmark con el nombre en la tipografía de titulares.
//
// Con solo un color de marca, el resto de la paleta se deriva de él.

import { findGoogleFont } from '@/lib/google-fonts';
import type { FilmTheme } from '@/remotion/film-types';

/** Paleta de respaldo cuando la marca no definió colores (o son ilegibles). */
export const FALLBACK_THEME = {
  accent:      '#ffd23f',
  primary:     '#14141c',
  secondary:   '#2a2440',
  headingFont: 'Montserrat',
  bodyFont:    'Montserrat',
} as const;

export interface VideoBrandKit {
  name?:                string | null;
  tagline?:             string | null;
  industry?:            string | null;
  niche?:               string | null;
  mission?:             string | null;
  target_audience?:     string | null;
  differentiators?:     string[] | null;
  communication_style?: string | null;
  tone?:                string[] | null;
  uses_emojis?:         boolean | null;
  language?:            string | null;
  customer_locations?:  string[] | null;
  website_url?:         string | null;
  social_urls?:         Record<string, string | undefined> | null;
  primary_color?:       string | null;
  secondary_color?:     string | null;
  accent_color?:        string | null;
  font_heading?:        string | null;
  font_body?:           string | null;
  logo_url?:            string | null;
}

// ─── Color ───────────────────────────────────────────────────────────────────

/** `#abc`, `abc`, `#AABBCC`, `rgb(…)` → `#aabbcc`, o null si no es un color usable. */
export function normalizeHex(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  const rgb = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
  if (rgb) {
    const parts = rgb.slice(1, 4).map((n) => Math.min(255, Number(n)));
    return `#${parts.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  }
  const hex = v.replace(/^#/, '');
  if (/^[0-9a-f]{3}$/.test(hex)) return `#${hex.split('').map((c) => c + c).join('')}`;
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  if (/^[0-9a-f]{8}$/.test(hex)) return `#${hex.slice(0, 6)}`;
  return null;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminancia relativa WCAG. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const INK   = '#0b0b0f';
const WHITE = '#ffffff';

/** Texto legible sobre un fondo: tinta o blanco, el que más contraste dé. */
export function readableOn(bg: string): string {
  return contrastRatio(bg, INK) >= contrastRatio(bg, WHITE) ? INK : WHITE;
}

/** Saturación HSL (0–1): un gris no sirve de acento. */
function saturation(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

/** Mezcla dos colores (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const ca = channels(a);
  const cb = channels(b);
  return `#${ca.map((c, i) => Math.round(c + (cb[i]! - c) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Un acento sirve si destaca: con algo de color y sin ser casi negro ni casi
 * blanco. Va de fondo de la palabra que se está diciendo y de subrayado de
 * los titulares: un gris oscuro ahí no se ve sobre una foto.
 */
export function isUsableAccent(hex: string): boolean {
  const l = luminance(hex);
  return saturation(hex) >= 0.25 && l >= 0.06 && l <= 0.9;
}

// ─── Texto de marca ──────────────────────────────────────────────────────────

/** `https://www.depando.cl/arriendos?x=1` → `depando.cl`. */
export function displayDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, '');
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

/** `https://instagram.com/depando.cl/` → `@depando.cl`. */
export function instagramHandle(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/i);
  if (m && !['p', 'reel', 'explore', 'stories'].includes(m[1]!.toLowerCase())) return `@${m[1]}`;
  if (/^@[A-Za-z0-9._]{1,30}$/.test(url.trim())) return url.trim();
  return null;
}

function clean(s: string | null | undefined, max: number): string | undefined {
  const v = typeof s === 'string' ? s.trim().slice(0, max) : '';
  return v || undefined;
}

// ─── Diseño ──────────────────────────────────────────────────────────────────

export function resolveFilmTheme(kit: VideoBrandKit | null | undefined): FilmTheme {
  const primaryRaw   = normalizeHex(kit?.primary_color);
  const secondaryRaw = normalizeHex(kit?.secondary_color);
  const accentRaw    = normalizeHex(kit?.accent_color);

  // El acento: el de la marca si destaca; si no, su primario o secundario; si
  // ninguno sirve, el de respaldo.
  const accent = [accentRaw, primaryRaw, secondaryRaw].find((c): c is string => !!c && isUsableAccent(c))
    ?? FALLBACK_THEME.accent;

  // Fondo de los planos sin imagen y de la tarjeta de cierre: el color de marca
  // oscurecido. Un primario claro (pastel, blanco) se lleva a tinta para que
  // los subtítulos blancos se lean.
  const base = primaryRaw ?? secondaryRaw ?? null;
  const primary = base ? (luminance(base) > 0.18 ? mix(base, INK, 0.72) : base) : FALLBACK_THEME.primary;
  const secondary = secondaryRaw && secondaryRaw !== base
    ? mix(secondaryRaw, INK, luminance(secondaryRaw) > 0.18 ? 0.6 : 0.2)
    : base ? mix(primary, accent, 0.25) : FALLBACK_THEME.secondary;

  const heading = findGoogleFont(kit?.font_heading)?.value ?? null;
  const body    = findGoogleFont(kit?.font_body)?.value ?? null;

  const name    = clean(kit?.name, 60);
  const logoUrl = typeof kit?.logo_url === 'string' && /^https:\/\//.test(kit.logo_url) ? kit.logo_url : undefined;
  const website = displayDomain(kit?.website_url) ?? undefined;
  const handle  = instagramHandle(kit?.social_urls?.instagram) ?? undefined;

  return {
    accent,
    onAccent:    readableOn(accent),
    primary,
    secondary,
    onPrimary:   readableOn(primary),
    headingFont: heading ?? body ?? FALLBACK_THEME.headingFont,
    bodyFont:    body ?? heading ?? FALLBACK_THEME.bodyFont,
    brandName:   name,
    logoUrl,
    tagline:     clean(kit?.tagline, 80),
    contact:     website ?? handle,
    branded:     !!(name || logoUrl || primaryRaw || accentRaw),
  };
}

// ─── Copy ────────────────────────────────────────────────────────────────────

/**
 * Acento de la voz a partir de dónde están los clientes. Neutro por defecto:
 * un TTS forzando un acento local suena caricaturesco más seguido que bien.
 */
export function voiceAccent(kit: VideoBrandKit | null | undefined, language: 'es' | 'en'): string {
  const where = (kit?.customer_locations ?? []).join(' ').toLowerCase();
  if (language === 'en') return 'Speak in natural, clear English.';
  if (/espa(ñ|n)a|spain|madrid|barcelona/.test(where)) return 'Speak in natural Castilian Spanish from Spain.';
  if (/m(é|e)xico/.test(where)) return 'Speak in natural Mexican Spanish.';
  if (/argentin|buenos aires/.test(where)) return 'Speak in natural Rioplatense Spanish.';
  return 'Speak in natural, neutral Latin American Spanish.';
}

/**
 * Lo que Claude tiene que saber de la marca para escribir el guion con su voz.
 * Sin Brand Kit, una guía de respaldo para que el copy no salga genérico.
 */
export function videoBrandBrief(kit: VideoBrandKit | null | undefined, language: 'es' | 'en'): string {
  const lines: string[] = [];
  const add = (label: string, v: string | null | undefined) => { const c = clean(v, 300); if (c) lines.push(`${label}: ${c}`); };

  add('Brand', kit?.name);
  add('Tagline', kit?.tagline);
  add('Industry', [kit?.industry, kit?.niche].filter(Boolean).join(' — '));
  add('Audience', kit?.target_audience);
  add('Mission', kit?.mission);
  if (kit?.differentiators?.length) add('What makes it different', kit.differentiators.slice(0, 4).join('; '));
  if (kit?.tone?.length) add('Voice', kit.tone.join(', '));
  add('Writing style', kit?.communication_style);
  if (kit?.customer_locations?.length) add('Customers in', kit.customer_locations.slice(0, 4).join(', '));
  const contact = displayDomain(kit?.website_url) ?? instagramHandle(kit?.social_urls?.instagram);
  add('Where to send people (use in the CTA)', contact);
  if (kit?.uses_emojis === false) lines.push('No emojis in the caption.');

  if (lines.length === 0) {
    return [
      'BRAND: no brand profile yet. Write as a confident, warm local business expert:',
      'concrete benefits and specific details from the topic instead of generic claims,',
      `plain ${language === 'en' ? 'English' : 'Spanish'} a friend would say out loud, and a simple CTA (follow, save or send a message).`,
      'Pick a cohesive, premium visual_style that fits the topic.',
    ].join(' ');
  }

  return [
    'BRAND PROFILE (write in this voice; stay true to what it offers — never invent prices, numbers or promises):',
    ...lines.map((l) => `- ${l}`),
  ].join('\n');
}
