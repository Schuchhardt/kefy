// ─── Destinos de publicación: dónde está un contenido y dónde más puede ir ───
//
// Un mismo contenido se puede publicar en todas las cuentas conectadas de su
// marca, esté en borrador, programado o ya publicado. Este módulo decide, por
// cuenta, si el contenido ya salió ahí, si está programado, si todavía se
// puede publicar (y entonces se recomienda) o si esa red no admite el formato.
//
// Puro, sin dependencias de servidor: lo comparten el servicio
// (listPublishTargets en lib/services/publish.ts), la herramienta
// list_publish_targets, el modal de publicar y la ficha del contenido.
//
// Las capacidades por red salen de docs.zernio.com/platforms/<red> (verificado
// el 5-nov-2026; ver docs/zernio.md, «Publicar el mismo contenido en otras
// redes»). Solo se marca como incompatible lo que la documentación prohíbe:
// una red desconocida se da por compatible, para no bloquear lo que no sabemos.

import { resolvePublishMedia, type PublishMediaSource } from '@/lib/publish-media';
import type { ContentType } from '@/types/content';

export interface PlatformCaps {
  /** Acepta un post sin imagen ni video. */
  textOnly: boolean;
  /** Imágenes por post. 0 = solo video (YouTube). */
  maxImages: number;
  /** Acepta video. */
  video: boolean;
  /** Tiene superficie de Stories. Si no, Kefy publica la story como post normal. */
  stories: boolean;
}

export const PLATFORM_CAPS: Readonly<Record<string, PlatformCaps>> = {
  instagram:      { textOnly: false, maxImages: 10, video: true,  stories: true  },
  facebook:       { textOnly: true,  maxImages: 10, video: true,  stories: true  },
  linkedin:       { textOnly: true,  maxImages: 20, video: true,  stories: false },
  twitter:        { textOnly: true,  maxImages: 4,  video: true,  stories: false },
  tiktok:         { textOnly: false, maxImages: 35, video: true,  stories: false },
  youtube:        { textOnly: false, maxImages: 0,  video: true,  stories: false },
  threads:        { textOnly: true,  maxImages: 10, video: true,  stories: false },
  reddit:         { textOnly: true,  maxImages: 20, video: true,  stories: false },
  pinterest:      { textOnly: false, maxImages: 1,  video: true,  stories: false },
  bluesky:        { textOnly: true,  maxImages: 4,  video: true,  stories: false },
  googlebusiness: { textOnly: true,  maxImages: 1,  video: false, stories: false },
  telegram:       { textOnly: true,  maxImages: 10, video: true,  stories: false },
  snapchat:       { textOnly: false, maxImages: 1,  video: true,  stories: true  },
  discord:        { textOnly: true,  maxImages: 10, video: true,  stories: false },
};

/** Se conectan en Zernio pero no reciben posts (WhatsApp: solo plantillas y difusiones). */
export const NON_PUBLISHING_PLATFORMS: ReadonlySet<string> = new Set(['whatsapp']);

// ─── Qué media sale ──────────────────────────────────────────────────────────

/** Lo que recibe la red: solo texto, N imágenes o un video. */
export type MediaShape =
  | { kind: 'text' }
  /** `count: null` = todavía no se sabe (la versión en ese formato no existe aún). */
  | { kind: 'images'; count: number | null }
  | { kind: 'video' };

/** Lo que tendrá un formato cuando se genere su versión. */
function expectedShape(format: ContentType): MediaShape {
  if (format === 'reel') return { kind: 'video' };
  if (format === 'carousel') return { kind: 'images', count: null };
  return { kind: 'images', count: 1 };
}

/**
 * La forma del media que se publicaría, con las mismas reglas que la
 * publicación (resolvePublishMedia). `ready: false` si todavía no se puede
 * publicar: la versión en ese formato no está generada o el reel no tiene
 * video. En ese caso la forma es la esperada del formato.
 */
export function mediaShapeOf(
  format: ContentType,
  source: PublishMediaSource | null,
): { shape: MediaShape; ready: boolean } {
  if (!source) return { shape: expectedShape(format), ready: false };
  const resolved = resolvePublishMedia(format, source);
  if (!resolved.ok) return { shape: expectedShape(format), ready: false };
  const { media } = resolved;
  if (media.is_video) return { shape: { kind: 'video' }, ready: true };
  const count = media.media_urls?.length ?? (media.image_url ? 1 : 0);
  return { shape: count > 0 ? { kind: 'images', count } : { kind: 'text' }, ready: true };
}

// ─── ¿Lo admite la red? ──────────────────────────────────────────────────────

export type FitIssue =
  /** La red no recibe posts (WhatsApp). */
  | 'no_publishing'
  /** La red exige imagen o video y la pieza es solo texto. */
  | 'needs_media'
  /** La red solo publica video (YouTube). */
  | 'video_only'
  /** La red no admite video (Google Business). */
  | 'no_video'
  /** Más imágenes de las que admite la red (carrusel en X, Pinterest…). */
  | 'too_many_images';

export type PlatformFit =
  /** `asPost`: una story que esta red publica como post normal. */
  | { ok: true; asPost: boolean }
  | { ok: false; issue: FitIssue; maxImages?: number };

export function platformFit(platform: string, format: ContentType, shape: MediaShape): PlatformFit {
  if (NON_PUBLISHING_PLATFORMS.has(platform)) return { ok: false, issue: 'no_publishing' };
  const caps = PLATFORM_CAPS[platform];
  const asPost = format === 'story' && !caps?.stories;
  if (!caps) return { ok: true, asPost };

  if (shape.kind === 'text' && !caps.textOnly) return { ok: false, issue: 'needs_media' };
  if (shape.kind === 'video' && !caps.video) return { ok: false, issue: 'no_video' };
  if (shape.kind === 'images') {
    if (caps.maxImages === 0) return { ok: false, issue: 'video_only' };
    // Un carrusel tiene al menos 2 imágenes aunque aún no se sepa cuántas.
    const count = shape.count ?? (format === 'carousel' ? 2 : 1);
    if (count > caps.maxImages) return { ok: false, issue: 'too_many_images', maxImages: caps.maxImages };
  }
  return { ok: true, asPost };
}

// ─── Estado por cuenta ───────────────────────────────────────────────────────

export type TargetState = 'published' | 'scheduled' | 'available' | 'incompatible' | 'inactive';

export interface TargetAccount {
  id: string;
  platform: string;
  username: string | null;
  avatar_url?: string | null;
  status: string;
}

/** Una fila de kefy_scheduled_posts de este contenido. */
export interface TargetPost {
  id: string;
  social_account_id: string | null;
  status: string;
  /** Formato publicado; null en filas antiguas = el formato propio del contenido. */
  format: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  platform_post_url?: string | null;
}

export interface PublishTarget {
  social_account_id: string;
  platform: string;
  username: string | null;
  avatar_url: string | null;
  state: TargetState;
  /** Por qué la red no admite este formato (state 'incompatible'). */
  issue?: FitIssue;
  /** Con issue 'too_many_images': cuántas admite la red. */
  max_images?: number;
  /** La story sale como post normal en esta red. */
  as_post?: boolean;
  /** state 'published': URL pública del post, si ya se conoce. */
  post_url?: string | null;
  published_at?: string | null;
  /** state 'scheduled': la publicación programada (para moverla o cancelarla). */
  scheduled_post_id?: string;
  scheduled_at?: string | null;
  /** Otros formatos de este contenido ya publicados o programados en esta cuenta. */
  other_formats: ContentType[];
}

const SCHEDULED_STATUSES = new Set(['scheduled', 'pending']);
const STATE_ORDER: Record<TargetState, number> = {
  published: 0, scheduled: 1, available: 2, incompatible: 3, inactive: 4,
};

/**
 * El estado de cada cuenta para publicar el contenido en `format`.
 *
 * - published / scheduled: ya salió (o va a salir) en esa cuenta en ese mismo
 *   formato. Las filas fallidas o canceladas no cuentan.
 * - inactive: cuenta desconectada o con el token vencido.
 * - incompatible: la red no admite ese formato (ver platformFit).
 * - available: se puede publicar ahí. Son las cuentas que se recomiendan.
 *
 * El mismo contenido en otro formato (la story de un post) no cuenta como
 * publicado: va en `other_formats` y la cuenta sigue disponible.
 */
export function buildPublishTargets(input: {
  accounts: TargetAccount[];
  posts: TargetPost[];
  format: ContentType;
  primaryFormat: ContentType;
  shape: MediaShape;
}): PublishTarget[] {
  const { accounts, posts, format, primaryFormat, shape } = input;
  const formatOf = (p: TargetPost) => (p.format ?? primaryFormat) as ContentType;

  const targets = accounts.map((account): PublishTarget => {
    const mine = posts.filter((p) => p.social_account_id === account.id
      && (p.status === 'published' || SCHEDULED_STATUSES.has(p.status)));
    const sameFormat = mine.filter((p) => formatOf(p) === format);
    const other_formats = [...new Set(mine.map(formatOf).filter((f) => f !== format))];
    const base = {
      social_account_id: account.id,
      platform: account.platform,
      username: account.username,
      avatar_url: account.avatar_url ?? null,
      other_formats,
    };

    const published = sameFormat
      .filter((p) => p.status === 'published')
      .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))[0];
    if (published) {
      return { ...base, state: 'published', post_url: published.platform_post_url ?? null, published_at: published.published_at };
    }

    const scheduled = sameFormat
      .filter((p) => SCHEDULED_STATUSES.has(p.status))
      .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))[0];
    if (scheduled) {
      return { ...base, state: 'scheduled', scheduled_post_id: scheduled.id, scheduled_at: scheduled.scheduled_at };
    }

    if (account.status !== 'active') return { ...base, state: 'inactive' };

    const fit = platformFit(account.platform, format, shape);
    if (!fit.ok) {
      return { ...base, state: 'incompatible', issue: fit.issue, ...(fit.maxImages !== undefined ? { max_images: fit.maxImages } : {}) };
    }
    return { ...base, state: 'available', ...(fit.asPost ? { as_post: true } : {}) };
  });

  // Estable: dentro de cada estado se conserva el orden de las cuentas.
  return targets
    .map((t, i) => ({ t, i }))
    .sort((a, b) => STATE_ORDER[a.t.state] - STATE_ORDER[b.t.state] || a.i - b.i)
    .map(({ t }) => t);
}

/** Cuentas donde todavía se puede publicar: las que se recomiendan. */
export function suggestedAccountIds(targets: PublishTarget[]): string[] {
  return targets.filter((t) => t.state === 'available').map((t) => t.social_account_id);
}

/** true si el contenido ya salió o va a salir en alguna cuenta, en cualquier formato. */
export function hasCoverage(targets: PublishTarget[]): boolean {
  return targets.some((t) => t.state === 'published' || t.state === 'scheduled' || t.other_formats.length > 0);
}
