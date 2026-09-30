// ─── Colores de estado: una sola tabla ───────────────────────────────────────
//
// Había tres STATUS_COLORS (create, calendar, detalle) más el del home, y no
// coincidían: «programado» era naranja en unos y azul en otro. Además
// concatenaban opacidad a mano (`${color}22`), que con `var(--accent)` da CSS
// inválido y dejaba el badge de «publicado» sin fondo.
//
// Aquí cada estado tiene un tono semántico y el tono sus tokens de color.

import type { ContentStatus, PostStatus } from '@/types/content';

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'accent' | 'danger';
export type AnyStatus = ContentStatus | PostStatus;

export const STATUS_TONE: Record<AnyStatus, Tone> = {
  draft: 'neutral',
  approved: 'info',
  scheduled: 'warning',
  published: 'accent',
  archived: 'neutral',
  pending: 'neutral',
  failed: 'danger',
  cancelled: 'neutral',
};

export const TONE_COLORS: Record<Tone, { color: string; background: string; border: string }> = {
  neutral: { color: 'var(--muted)', background: 'var(--surface-2)', border: 'var(--border)' },
  info: { color: 'var(--info)', background: 'var(--info-soft)', border: 'var(--info-border)' },
  warning: { color: 'var(--warning)', background: 'var(--warning-soft)', border: 'var(--warning-border)' },
  success: { color: 'var(--success)', background: 'var(--success-soft)', border: 'var(--success-border)' },
  accent: { color: 'var(--accent-text)', background: 'var(--accent-soft)', border: 'var(--accent-border)' },
  danger: { color: 'var(--danger)', background: 'var(--danger-soft)', border: 'var(--danger-border)' },
};

/** Colores (texto, fondo y borde) de un estado de contenido o de publicación. */
export function statusColors(status: string): { color: string; background: string; border: string } {
  const tone = STATUS_TONE[status as AnyStatus] ?? 'neutral';
  return TONE_COLORS[tone];
}
