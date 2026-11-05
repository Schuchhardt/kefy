// ─── Servicio: publicar y programar ──────────────────────────────────────────
//
// Antes de tocar este archivo, leer docs/zernio.md (AGENTS.md).
//
// publishContent une la lógica de POST /api/social/publish (mode 'now') y de
// POST /api/social/schedule (mode 'schedule'), y la comparte con la
// herramienta publish_content del asistente. Cada modo conserva lo que hacía
// su ruta:
//
//   'now'      → 200 si algo se publicó, 502 si todo falló; guarda también las
//                filas fallidas en kefy_scheduled_posts; el contenido pasa a
//                'published' (o vuelve a 'approved' si todo falló).
//   'schedule' → 201 / 502; solo guarda las filas programadas; el contenido
//                pasa a 'scheduled' si al menos una cuenta se programó.
//
// La suscripción y el rate limit de publicación NO se comprueban aquí: los
// hacen las rutas (requireActiveSubscription + publishRule) y, en el camino
// del asistente, el registro de herramientas.

import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import { prepareCarouselSlides, prepareSingleImage } from '@/lib/publish-images';
import { imageTextToBake, type ImageOverlay } from '@/lib/image-text';
import { resolvePublishMedia, type PublishMediaSource, type ResolvedPublishMedia } from '@/lib/publish-media';
import type { CarouselSlide, ContentType, ScheduledSyncResult } from '@/types/content';
import type { ContentChannel } from '@/types/ai';
import type { ZernioPublishPayload } from '@/types/social';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';
import { loadOwnedItem, loadOwnedScheduledPost } from '@/lib/services/ownership';
import { fillMissingPostUrls, type PostUrlRow } from '@/lib/services/post-urls';
import {
  buildPublishTargets, mediaShapeOf, suggestedAccountIds,
  type PublishTarget, type TargetAccount, type TargetPost,
} from '@/lib/publish-targets';
import { syncContentItemStatus } from '@/lib/services/content-status';
import { getChannelLabel } from '@/lib/channels';
import { manualRemovalSteps } from '@/lib/post-removal';
import type { Channel } from '@/types/channels';

export type PublishMode = 'now' | 'schedule';

export interface PublishContentInput {
  itemId: string;
  accountIds: string[];
  /** Por defecto, el content_type del propio contenido. */
  format?: ContentType;
  mode: PublishMode;
  /** ISO 8601. Obligatorio con mode 'schedule'. */
  scheduledAt?: string;
  /**
   * Base del x-request-id de Zernio (`${requestIdBase}:${accountId}`). Solo
   * deduplica reintentos dentro de la ventana de ~5 min de Zernio; la
   * idempotencia durable es la fila de kefy_assistant_actions.
   */
  requestIdBase?: string;
}

export interface PublishResultEntry {
  social_account_id: string;
  platform: string | null;
  status: 'published' | 'scheduled' | 'failed';
  zernio_post_id?: string;
  /** URL pública del post en la red, si Zernio ya la dio al publicar. */
  post_url?: string | null;
  post_id?: string;
  scheduled_post_id?: string;
  error?: string;
}

interface PublishItemRow {
  id: string;
  title: string | null;
  body: string;
  image_url: string | null;
  hashtags: string[] | null;
  channel: string | null;
  status: string;
  content_type: string;
  slides: unknown;
  video_url: string | null;
  mux_playback_id: string | null;
  brand_id: string | null;
  [key: string]: unknown;
}

const ITEM_SELECT =
  'id, title, body, image_url, hashtags, channel, status, content_type, slides, video_url, mux_playback_id, brand_id, metadata';

// ─── Preparar lo que se manda a Zernio ───────────────────────────────────────
//
// Lo comparten publishContent (crear el post) y syncScheduledPosts (reenviar
// un contenido editado a sus posts programados): los dos tienen que mandar
// exactamente el mismo texto y media.

interface PreparedPublish {
  media: ResolvedPublishMedia;
  carouselSlides: CarouselSlide[];
  imageDeps: { orgId: string; prefix: string; brandFonts: { heading?: string | null; body?: string | null } };
  sourceImageBuffer: Buffer | null;
  /** Lo que se escribe sobre la imagen (lib/image-text.ts). */
  bakeText?: string | ImageOverlay;
}

/** El texto y el media de un contenido en un formato, listos para cada cuenta. */
async function preparePublish(
  item: PublishItemRow,
  format: ContentType,
  brandId: string | null,
  orgId: string,
  prefix: string,
  tag: string,
): Promise<PreparedPublish> {
  const db = createSupabaseServer();

  // El texto y el media a publicar: las columnas del propio contenido para su
  // formato principal, o la rendición correspondiente para otro formato.
  let source: PublishMediaSource;
  if (format === item.content_type) {
    source = {
      body: item.body, image_url: item.image_url, slides: item.slides,
      video_url: item.video_url, mux_playback_id: item.mux_playback_id, hashtags: item.hashtags ?? [],
    } as PublishMediaSource;
  } else {
    const { data: rendition } = await db
      .from('kefy_content_renditions')
      .select('body, image_url, slides, video_url, mux_playback_id, hashtags, status')
      .eq('content_item_id', item.id)
      .eq('format', format)
      .maybeSingle();
    if (!rendition || rendition.status !== 'ready') {
      throw new ServiceError('invalid_input', 422, `The ${format} version of this content hasn't been generated yet`);
    }
    source = rendition as PublishMediaSource;
  }

  // Se decide el media una sola vez, antes de tocar Zernio. Un reel sin video
  // renderizado falla aquí en vez de publicarse como su portada.
  const resolved = resolvePublishMedia(format, source);
  if (!resolved.ok) {
    console.warn(`${tag} REJECTED itemId=${item.id} format=${format}: ${resolved.error}`);
    throw new ServiceError('invalid_input', 422, resolved.error);
  }
  const media = resolved.media;

  const carouselSlides: CarouselSlide[] = format === 'carousel' && Array.isArray(source.slides)
    ? (source.slides as CarouselSlide[])
    : [];

  // El texto que se escribe dentro de la imagen usa la tipografía elegida por
  // la marca en su Brand Kit, no una genérica. El kit se lee por marca.
  let fontsQuery = db
    .from('kefy_brand_kits')
    .select('font_heading, font_body')
    .eq('org_id', orgId);
  if (brandId) fontsQuery = fontsQuery.eq('brand_id', brandId);
  const { data: brandFontsRow } = await fontsQuery.maybeSingle();

  const imageDeps = {
    orgId,
    prefix,
    brandFonts: { heading: brandFontsRow?.font_heading, body: brandFontsRow?.font_body },
  };

  // Se descarga la imagen de origen una sola vez: cada cuenta recibe una copia
  // ajustada a su red. Los posts de video no llevan imagen.
  let sourceImageBuffer: Buffer | null = null;
  if (media.image_url) {
    try {
      const resp = await fetch(media.image_url);
      if (resp.ok) {
        const ab = await resp.arrayBuffer();
        sourceImageBuffer = Buffer.from(ab);
      }
    } catch {
      console.warn(`${tag} Could not fetch source image for resize, using original URL`);
    }
  }

  // El modo de texto es de la pieza original: una versión convertida tiene su
  // propia imagen limpia y se publica como siempre.
  const bakeText = imageTextToBake(format, format === item.content_type ? item.metadata : null, media.text);

  return { media, carouselSlides, imageDeps, sourceImageBuffer, bakeText };
}

/** El payload de Zernio para una cuenta (sin fecha ni request id). */
async function buildAccountPayload(
  prep: PreparedPublish,
  account: { id: string; zernio_account_id: string | null; platform: string },
  format: ContentType,
  tag: string,
): Promise<ZernioPublishPayload> {
  const { STORY_CAPABLE_PLATFORMS } = await import('@/lib/zernio');
  const { media, carouselSlides, imageDeps, sourceImageBuffer, bakeText } = prep;
  const platform = (account.platform ?? 'generic') as ContentChannel;

  // Ajuste al formato de la red + texto quemado donde la red no lo muestra
  // (caption de story, y el título/cuerpo de cada slide del carrusel).
  let imageForAccount = media.image_url;
  if (media.image_url) {
    imageForAccount = await prepareSingleImage(
      media.image_url, sourceImageBuffer, platform, format,
      imageDeps,
      // Fuera de las redes con stories, la story sale como post y su texto va en el caption.
      format !== 'story' || (!media.is_video && STORY_CAPABLE_PLATFORMS.has(account.platform))
        ? bakeText
        : undefined,
    );
  }

  let mediaUrlsForAccount = media.media_urls;
  if (format === 'carousel' && carouselSlides.length > 0) {
    mediaUrlsForAccount = await prepareCarouselSlides(carouselSlides, platform, imageDeps);
  }

  console.log(
    `${tag} → account ${account.id} platform=${account.platform}` +
    ` zernio_account_id=${account.zernio_account_id}` +
    ` hasImage=${!!imageForAccount} mediaUrls=${mediaUrlsForAccount?.length ?? 0} hasVideo=${!!media.video_url}`,
  );

  return {
    account_id:   account.zernio_account_id!,
    platform:     account.platform,
    text:         media.text,
    image_url:    imageForAccount,
    media_urls:   mediaUrlsForAccount,
    video_url:    media.video_url,
    content_type: format,
    hashtags:     media.hashtags,
  };
}

export async function publishContent(
  ctx: ServiceContext,
  input: PublishContentInput,
): Promise<{ status: number; body: { results: PublishResultEntry[] } }> {
  const { mode } = input;
  const tag = mode === 'now' ? '[publish]' : '[schedule]';
  const route = mode === 'now' ? '/api/social/publish' : '/api/social/schedule';
  const orgId = ctx.auth.orgId;

  let scheduledAt: Date | null = null;
  if (mode === 'schedule') {
    scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (!scheduledAt || isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      throw new ServiceError('invalid_input', 422, 'scheduled_at must be a valid future datetime');
    }
  }

  const accountIds = [...new Set(input.accountIds.filter((id) => typeof id === 'string'))];
  if (accountIds.length === 0) {
    throw new ServiceError('invalid_input', 422, 'social_account_ids must contain valid IDs');
  }

  const db = createSupabaseServer();

  // Verificar el contenido (org_id siempre; brand_id con brandScope 'strict').
  const item = await loadOwnedItem<PublishItemRow>(ctx, input.itemId, ITEM_SELECT, 'Content item not found');

  const format = input.format ?? (item.content_type as ContentType);

  // Las cuentas tienen que ser de la misma marca que el contenido. Un contenido
  // antiguo sin brand_id, llamado desde una ruta (sin marca en el contexto),
  // mantiene el comportamiento de antes: cualquier cuenta activa de la org.
  const brandId = item.brand_id ?? (ctx.brandId || null);

  const prep = await preparePublish(item, format, brandId, orgId, mode === 'now' ? 'publish' : 'schedule', tag);
  let accountsQuery = db
    .from('kefy_social_accounts')
    .select('id, zernio_account_id, status, platform')
    .in('id', accountIds)
    .eq('org_id', orgId)
    .eq('status', 'active');
  if (brandId) accountsQuery = accountsQuery.eq('brand_id', brandId);

  const { data: accountRows } = await accountsQuery;
  const accounts = (accountRows ?? []) as Array<{
    id: string; zernio_account_id: string | null; status: string; platform: string;
  }>;

  if (accounts.length === 0) {
    throw new ServiceError('not_found', 404, 'No active social accounts found for the given IDs');
  }

  const { publishPost } = await import('@/lib/zernio');

  console.log(
    `${tag} START itemId=${item.id} format=${format}` +
    (scheduledAt ? ` scheduledAt=${scheduledAt.toISOString()}` : '') +
    ` accounts=[${accounts.map((a) => `${a.id}(${a.platform})`).join(', ')}]`,
  );

  const results: PublishResultEntry[] = [];

  // Cada cuenta por separado: un fallo parcial no aborta el resto.
  for (const account of accounts) {
    try {
      const payload = await buildAccountPayload(prep, account, format, tag);
      // Sin scheduled_at → publicación inmediata.
      if (scheduledAt) payload.scheduled_at = scheduledAt.toISOString();
      if (input.requestIdBase) payload.request_id = `${input.requestIdBase}:${account.id}`;

      const zernioResult = await publishPost(payload);

      if (mode === 'now') {
        console.log(
          `${tag} ✓ account ${account.id} zernio_post_id=${zernioResult.post_id}` +
          ` status=${zernioResult.status} platform_post_id=${zernioResult.platform_post_id}`,
        );

        await db.from('kefy_scheduled_posts').insert({
          org_id:            orgId,
          brand_id:          brandId,
          content_item_id:   item.id,
          social_account_id: account.id,
          zernio_post_id:    zernioResult.post_id,
          platform_post_id:  zernioResult.platform_post_id ?? null,
          platform_post_url: zernioResult.platform_post_url ?? null,
          published_at:      new Date().toISOString(),
          status:            'published',
          format,
          created_by:        ctx.auth.userId,
        });

        results.push({
          social_account_id: account.id,
          platform:          account.platform,
          status:            'published',
          zernio_post_id:    zernioResult.post_id,
          post_url:          zernioResult.platform_post_url ?? null,
        });
      } else {
        console.log(
          `${tag} ✓ account ${account.id} zernio_post_id=${zernioResult.post_id}` +
          ` status=${zernioResult.status} scheduledAt=${zernioResult.scheduled_at}`,
        );

        const { data: post, error: dbError } = await db
          .from('kefy_scheduled_posts')
          .insert({
            org_id:            orgId,
            brand_id:          brandId,
            content_item_id:   item.id,
            social_account_id: account.id,
            scheduled_at:      scheduledAt!.toISOString(),
            zernio_post_id:    zernioResult.post_id,
            status:            'scheduled',
            format,
            created_by:        ctx.auth.userId,
          })
          .select('id')
          .single();

        // El post ya está programado en Zernio: no se marca como fallido, pero
        // la fila que falta en Kefy tiene que verse en Sentry.
        if (dbError) {
          reportError(new Error(`schedule insert error: ${dbError.message}`), {
            route, auth: ctx.auth, service: 'supabase',
            extra: { itemId: item.id, accountId: account.id, zernioPostId: zernioResult.post_id },
          });
        }

        results.push({
          social_account_id: account.id,
          platform:          account.platform,
          status:            'scheduled',
          post_id:           zernioResult.post_id,
          scheduled_post_id: (post as { id?: string } | null)?.id,
        });
      }
    } catch (err) {
      const fallback = mode === 'now' ? 'Publish failed' : 'Zernio scheduling failed';
      const errorMessage = err instanceof Error ? err.message : fallback;
      console.error(`${tag} ✗ account ${account.id} platform=${account.platform} error:`, errorMessage);
      if (err instanceof Error && err.stack) console.error(`${tag} stack:`, err.stack);

      if (mode === 'now') {
        await db.from('kefy_scheduled_posts').insert({
          org_id:            orgId,
          brand_id:          brandId,
          content_item_id:   item.id,
          social_account_id: account.id,
          status:            'failed',
          error_message:     errorMessage,
          format,
          created_by:        ctx.auth.userId,
        });
      }

      results.push({
        social_account_id: account.id,
        platform:          account.platform,
        status:            'failed',
        error:             errorMessage,
      });
    }
  }

  // Cuentas pedidas que no existen, no están activas o son de otra marca: se
  // informan como fallidas en vez de ignorarse en silencio.
  const found = new Set(accounts.map((a) => a.id));
  for (const id of accountIds) {
    if (found.has(id)) continue;
    results.push({
      social_account_id: id,
      platform:          null,
      status:            'failed',
      error:             msg(ctx.language, 'Cuenta no encontrada en esta marca', 'Account not found for this brand'),
    });
  }

  const allFailed = results.every((r) => r.status === 'failed');

  // Un contenido que ya salió (o está programado) en otra red no retrocede
  // porque falle publicarlo en una red más, ni deja de estar publicado porque
  // se programe en otra: antes pasaba a 'approved' o a 'scheduled' y la ficha
  // volvía a dejar editar un post que ya estaba en la red.
  const alreadyOut = item.status === 'published' || item.status === 'scheduled';

  if (mode === 'now') {
    const anyPublished = results.some((r) => r.status === 'published');
    const nextStatus = !allFailed ? 'published' : alreadyOut ? item.status : 'approved';
    if (nextStatus !== item.status) {
      await db
        .from('kefy_content_items')
        .update({ status: nextStatus })
        .eq('id', item.id)
        .eq('org_id', orgId);
    }

    return { status: allFailed ? 502 : anyPublished ? 200 : 207, body: { results } };
  }

  if (!allFailed && item.status !== 'published') {
    await db
      .from('kefy_content_items')
      .update({ status: 'scheduled' })
      .eq('id', item.id)
      .eq('org_id', orgId);
  }

  return { status: allFailed ? 502 : 201, body: { results } };
}

// ─── Dónde más se puede publicar ─────────────────────────────────────────────

export interface PublishTargetsResult {
  item_id: string;
  /** Formato para el que se calculó (por defecto, el del propio contenido). */
  format: ContentType;
  primary_format: ContentType;
  /**
   * false si ese formato todavía no se puede publicar: su versión no está
   * generada (convert_content_format) o el reel no tiene video. La
   * compatibilidad se calcula entonces con lo que tendrá el formato.
   */
  media_ready: boolean;
  /** Una entrada por cuenta de la marca (ver buildPublishTargets). */
  targets: PublishTarget[];
  /** Cuentas compatibles donde el contenido todavía no está: las que se recomiendan. */
  suggested_account_ids: string[];
}

/**
 * Por cada cuenta de la marca del contenido: si ya está publicado o programado
 * ahí, si todavía se puede publicar o si la red no admite el formato. Sirve
 * para cualquier estado del contenido (borrador, programado o publicado): un
 * mismo contenido se puede llevar a todas las redes conectadas.
 */
export async function listPublishTargets(
  ctx: ServiceContext,
  itemId: string,
  input: { format?: ContentType } = {},
): Promise<PublishTargetsResult> {
  const db = createSupabaseServer();
  const item = await loadOwnedItem<PublishItemRow>(ctx, itemId, ITEM_SELECT, 'Content item not found');
  const primaryFormat = item.content_type as ContentType;
  const format = input.format ?? primaryFormat;

  // El media de ese formato: las columnas del contenido o su rendición lista.
  let source: PublishMediaSource | null = null;
  if (format === primaryFormat) {
    source = {
      body: item.body, image_url: item.image_url, slides: item.slides,
      video_url: item.video_url, mux_playback_id: item.mux_playback_id, hashtags: item.hashtags ?? [],
    };
  } else {
    const { data: rendition } = await db
      .from('kefy_content_renditions')
      .select('body, image_url, slides, video_url, mux_playback_id, hashtags, status')
      .eq('content_item_id', item.id)
      .eq('format', format)
      .maybeSingle();
    if (rendition && (rendition as { status?: string }).status === 'ready') source = rendition as PublishMediaSource;
  }
  const { shape, ready } = mediaShapeOf(format, source);

  // Mismas cuentas que acepta publishContent: las de la marca del contenido.
  const brandId = item.brand_id ?? (ctx.brandId || null);
  let accountsQuery = db
    .from('kefy_social_accounts')
    .select('id, platform, username, avatar_url, status')
    .eq('org_id', ctx.auth.orgId)
    .order('created_at', { ascending: true });
  if (brandId) accountsQuery = accountsQuery.eq('brand_id', brandId);

  const [{ data: accountRows, error: accountsError }, { data: postRows, error: postsError }] = await Promise.all([
    accountsQuery,
    db
      .from('kefy_scheduled_posts')
      .select('id, social_account_id, status, format, scheduled_at, published_at, platform_post_url')
      .eq('content_item_id', item.id)
      .eq('org_id', ctx.auth.orgId)
      .in('status', ['published', 'scheduled', 'pending']),
  ]);

  if (accountsError || postsError) {
    reportError(new Error((accountsError ?? postsError)!.message), {
      route: 'lib/services/publish', service: 'supabase', auth: ctx.auth, extra: { op: 'listPublishTargets', itemId },
    });
    throw new ServiceError('unavailable', 500, 'Failed to load publish targets').markReported();
  }

  const targets = buildPublishTargets({
    accounts: (accountRows ?? []) as TargetAccount[],
    posts: (postRows ?? []) as TargetPost[],
    format,
    primaryFormat,
    shape,
  });

  return {
    item_id: item.id,
    format,
    primary_format: primaryFormat,
    media_ready: ready,
    targets,
    suggested_account_ids: suggestedAccountIds(targets),
  };
}

// ─── Listado de publicaciones ────────────────────────────────────────────────

export const SCHEDULED_POST_STATUSES = ['pending', 'scheduled', 'published', 'failed', 'cancelled', 'deleted'] as const;
export type ScheduledPostStatus = (typeof SCHEDULED_POST_STATUSES)[number];

/**
 * Publicaciones programadas / publicadas / fallidas (GET /api/social/schedule).
 *
 * La ruta (el calendario) y las herramientas usan 'strict': solo se devuelven
 * las de la marca del contexto: filas con ese
 * brand_id, o filas antiguas sin brand_id cuyo contenido es de la marca. En
 * ese modo el contenido embebido trae también `metadata` (created_via), que la
 * herramienta usa para marcar el turno como contaminado.
 */
export async function listScheduledPosts(
  ctx: ServiceContext,
  q: { status?: string | null; limit: number; offset: number },
): Promise<{ posts: Record<string, unknown>[] }> {
  const db = createSupabaseServer();
  const strict = ctx.brandScope === 'strict';

  const itemEmbed = strict
    ? 'kefy_content_items!inner ( id, channel, title, body, image_url, content_type, brand_id, metadata )'
    : 'kefy_content_items ( id, channel, title, body, image_url )';

  let query = db
    .from('kefy_scheduled_posts')
    .select(`
      id, status, scheduled_at, published_at, error_message,
      zernio_post_id, platform_post_id, platform_post_url, created_at,
      ${itemEmbed},
      kefy_social_accounts ( id, platform, username, avatar_url )
    `)
    .eq('org_id', ctx.auth.orgId)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .range(q.offset, q.offset + q.limit - 1);

  if (strict) {
    query = query
      .or(`brand_id.eq.${ctx.brandId},brand_id.is.null`)
      .eq('kefy_content_items.brand_id', ctx.brandId);
  }

  if (q.status && (SCHEDULED_POST_STATUSES as readonly string[]).includes(q.status)) {
    query = query.eq('status', q.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('schedule GET error:', error.message);
    throw new ServiceError('unavailable', 500, 'Failed to fetch schedule');
  }

  const posts = await fillMissingPostUrls((data ?? []) as unknown as Array<Record<string, unknown> & PostUrlRow>);
  return { posts };
}

// ─── Editar una publicación programada ───────────────────────────────────────

/** Zernio no deja programar a más de un año. */
const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60_000;

/**
 * Cambia la fecha de una publicación programada, en Zernio y en Kefy. Solo
 * mientras no haya salido: una con la hora ya pasada se está publicando.
 */
export async function rescheduleScheduledPost(
  ctx: ServiceContext,
  postId: string,
  input: { scheduledAt: string },
): Promise<{ id: string; content_item_id: string; scheduled_at: string }> {
  const when = new Date(input.scheduledAt);
  if (isNaN(when.getTime()) || when.getTime() <= Date.now()) {
    throw new ServiceError('invalid_input', 422, 'scheduled_at must be a valid future datetime');
  }
  if (when.getTime() - Date.now() > MAX_SCHEDULE_AHEAD_MS) {
    throw new ServiceError('invalid_input', 422, 'scheduled_at must be within one year');
  }

  const post = await loadOwnedScheduledPost<{
    id: string; zernio_post_id: string | null; status: string; scheduled_at: string | null; content_item_id: string;
  }>(ctx, postId);

  assertEditable(ctx, post);

  const scheduledAt = when.toISOString();
  try {
    const { updatePost } = await import('@/lib/zernio');
    await updatePost(post.zernio_post_id!, { scheduled_at: scheduledAt });
  } catch (err) {
    reportError(err, {
      route: 'lib/services/publish', service: 'zernio', auth: ctx.auth, extra: { op: 'reschedule', postId },
    });
    throw new ServiceError('unavailable', 502, msg(ctx.language,
      'No se pudo cambiar la fecha en la red social. La publicación sigue en su fecha anterior.',
      'Could not change the date on the social network. The post keeps its previous date.',
    )).markReported();
  }

  await createSupabaseServer()
    .from('kefy_scheduled_posts')
    .update({ scheduled_at: scheduledAt })
    .eq('id', post.id)
    .eq('org_id', ctx.auth.orgId);

  return { id: post.id, content_item_id: post.content_item_id, scheduled_at: scheduledAt };
}

/** Solo se edita lo que sigue programado en Zernio y todavía no salió. */
function assertEditable(
  ctx: ServiceContext,
  post: { status: string; zernio_post_id: string | null; scheduled_at: string | null },
): void {
  if (post.status !== 'scheduled' || !post.zernio_post_id) {
    throw new ServiceError('conflict', 409, msg(ctx.language,
      'Solo se puede editar una publicación programada que todavía no sale.',
      'Only a scheduled post that has not gone out yet can be edited.',
    ));
  }
  if (post.scheduled_at && new Date(post.scheduled_at).getTime() <= Date.now()) {
    throw new ServiceError('conflict', 409, msg(ctx.language,
      'Esta publicación ya se está publicando y no se puede editar.',
      'This post is already being published and can no longer be edited.',
    ));
  }
}

/**
 * Reenvía un contenido editado a sus publicaciones programadas. Zernio guarda
 * una copia del texto y el media al programar: sin esto, editar el contenido
 * en Kefy no cambiaba lo que iba a salir.
 */
export async function syncScheduledPosts(ctx: ServiceContext, itemId: string): Promise<ScheduledSyncResult> {
  const tag = '[schedule-sync]';
  const out: ScheduledSyncResult = { updated: 0, failed: [] };

  const { data: rows } = await createSupabaseServer()
    .from('kefy_scheduled_posts')
    .select('id, zernio_post_id, scheduled_at, format, kefy_social_accounts ( id, zernio_account_id, platform )')
    .eq('content_item_id', itemId)
    .eq('org_id', ctx.auth.orgId)
    .eq('status', 'scheduled')
    .not('zernio_post_id', 'is', null)
    .gt('scheduled_at', new Date().toISOString());

  type Row = {
    id: string; zernio_post_id: string; scheduled_at: string; format: string | null;
    kefy_social_accounts: { id: string; zernio_account_id: string | null; platform: string } | null;
  };
  const posts = (rows ?? []) as unknown as Row[];
  if (posts.length === 0) return out;

  const item = await loadOwnedItem<PublishItemRow>(ctx, itemId, ITEM_SELECT, 'Content item not found');
  const brandId = item.brand_id ?? (ctx.brandId || null);
  const { updatePost } = await import('@/lib/zernio');

  const fail = (post: Row, err: unknown) => {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`${tag} ✗ scheduled_post ${post.id}:`, error);
    reportError(err, {
      route: 'lib/services/publish', service: 'zernio', auth: ctx.auth, extra: { op: 'syncScheduledPosts', postId: post.id },
    });
    out.failed.push({ scheduled_post_id: post.id, platform: post.kefy_social_accounts?.platform ?? null, error });
  };

  // Una preparación por formato: un contenido programado como post y como
  // story manda media distinto a cada uno.
  const byFormat = new Map<ContentType, Row[]>();
  for (const post of posts) {
    const format = (post.format ?? item.content_type) as ContentType;
    byFormat.set(format, [...(byFormat.get(format) ?? []), post]);
  }

  for (const [format, group] of byFormat) {
    let prep: PreparedPublish;
    try {
      prep = await preparePublish(item, format, brandId, ctx.auth.orgId, 'schedule', tag);
    } catch (err) {
      for (const post of group) fail(post, err);
      continue;
    }
    for (const post of group) {
      try {
        if (!post.kefy_social_accounts?.zernio_account_id) throw new Error('Social account not connected');
        const payload = await buildAccountPayload(prep, post.kefy_social_accounts, format, tag);
        await updatePost(post.zernio_post_id, { payload });
        out.updated += 1;
      } catch (err) {
        fail(post, err);
      }
    }
  }

  return out;
}

// ─── Cancelar ────────────────────────────────────────────────────────────────

/**
 * Cancela una publicación programada: en Zernio (best-effort) y en Kefy. Si
 * era la última programación del contenido, el contenido vuelve a 'approved'.
 */
export async function cancelScheduledPost(
  ctx: ServiceContext,
  postId: string,
): Promise<{ id: string; content_item_id: string; itemReverted: boolean }> {
  const db = createSupabaseServer();

  const post = await loadOwnedScheduledPost<{
    id: string; zernio_post_id: string | null; status: string; content_item_id: string; org_id: string;
  }>(ctx, postId);

  if (post.status === 'published') {
    throw new ServiceError('conflict', 409, 'Cannot cancel an already published post');
  }
  if (post.status === 'cancelled') {
    throw new ServiceError('conflict', 409, 'Post is already cancelled');
  }
  if (post.status === 'deleted') {
    throw new ServiceError('conflict', 409, 'Post was already deleted');
  }

  // Cancelar en Zernio (best-effort)
  if (post.zernio_post_id) {
    try {
      const { cancelPost } = await import('@/lib/zernio');
      await cancelPost(post.zernio_post_id);
    } catch (err) {
      console.warn('Zernio cancel warning:', err instanceof Error ? err.message : err);
    }
  }

  await db
    .from('kefy_scheduled_posts')
    .update({ status: 'cancelled' })
    .eq('id', post.id)
    .eq('org_id', ctx.auth.orgId);

  // Vuelve a 'approved' si nada más sale o salió; si otra red ya lo publicó, queda publicado.
  const itemReverted = (await syncContentItemStatus(db, post.content_item_id)) === 'approved';

  return { id: post.id, content_item_id: post.content_item_id, itemReverted };
}

// ─── Borrar una publicación ya publicada ─────────────────────────────────────

export interface DeletablePost {
  id: string;
  status: string;
  content_item_id: string;
  social_account_id: string;
  zernio_post_id: string | null;
  platform_post_url: string | null;
  published_at: string | null;
  platform: string | null;
  username: string | null;
  zernio_account_id: string | null;
}

/**
 * La publicación si se puede borrar. Si no, un error que lo explica; en las
 * redes sin borrado por API (Instagram, TikTok, Snapchat) trae el link directo
 * y los pasos para bajarla a mano. Se comprueba antes de pedir confirmación.
 */
export async function loadDeletablePost(ctx: ServiceContext, postId: string): Promise<DeletablePost> {
  const post = await loadOwnedScheduledPost<Omit<DeletablePost, 'platform' | 'username' | 'zernio_account_id'>>(ctx, postId);
  const lang = ctx.language;

  if (post.status === 'deleted') {
    throw new ServiceError('conflict', 409, msg(lang, 'Esta publicación ya se borró.', 'This post was already deleted.'));
  }
  if (post.status !== 'published') {
    throw new ServiceError('conflict', 409, msg(lang,
      'Solo se pueden borrar publicaciones ya publicadas. Si aún no sale, cancélala con cancel_scheduled_post.',
      'Only published posts can be deleted. If it has not gone out yet, cancel it with cancel_scheduled_post.'));
  }

  const { data: account } = await createSupabaseServer()
    .from('kefy_social_accounts')
    .select('platform, username, zernio_account_id')
    .eq('id', post.social_account_id)
    .eq('org_id', ctx.auth.orgId)
    .maybeSingle();
  const acc = account as { platform: string; username: string | null; zernio_account_id: string | null } | null;
  const platform = acc?.platform ?? null;

  const { UNPUBLISH_PLATFORMS } = await import('@/lib/zernio');
  if (!post.zernio_post_id || !platform || !UNPUBLISH_PLATFORMS.has(platform)) {
    await fillMissingPostUrls([post]);
    const label = platform ? getChannelLabel(platform as Channel) : msg(lang, 'la red', 'the network');
    const url = post.platform_post_url ?? null;
    const username = acc?.username ?? null;
    const steps = manualRemovalSteps(platform, lang, { username, postUrl: url });
    const reason = post.zernio_post_id && platform
      ? msg(lang, `${label} no permite borrar publicaciones por API.`, `${label} does not allow deleting posts through its API.`)
      : msg(lang, 'Esta publicación no se puede borrar desde Kefy.', 'This post cannot be deleted from Kefy.');
    const message = `${reason} ${msg(lang, 'Para bajarla a mano:', 'To take it down by hand:')} ${steps.join(' ')} ${msg(lang,
      'Kefy la seguirá mostrando como publicada.',
      'Kefy will keep showing it as published.')}`;
    throw new ServiceError('conflict', 409, message, {
      error: message, manual_removal_required: true, platform, account: username, post_url: url, removal_instructions: steps,
    });
  }

  return {
    ...post,
    platform,
    username: acc?.username ?? null,
    zernio_account_id: acc?.zernio_account_id ?? null,
  };
}

/**
 * Borra de la red una publicación ya publicada y la marca 'deleted' en Kefy. El
 * contenido no se toca, salvo su estado: sin otras publicaciones vuelve a
 * 'approved' y se puede republicar.
 */
export async function deletePublishedPost(
  ctx: ServiceContext,
  postId: string,
): Promise<{ id: string; content_item_id: string; platform: string; item_status: string | null }> {
  const post = await loadDeletablePost(ctx, postId);
  const platform = post.platform as string;
  const label = getChannelLabel(platform as Channel);
  const lang = ctx.language;

  try {
    const { unpublishPost } = await import('@/lib/zernio');
    await unpublishPost(post.zernio_post_id as string, platform, post.zernio_account_id);
  } catch (err) {
    reportError(err, {
      route: 'lib/services/publish', service: 'zernio', auth: ctx.auth, extra: { op: 'deletePublishedPost', postId: post.id, platform },
    });
    const detail = err instanceof Error ? err.message : '';
    const url = post.platform_post_url;
    const message = msg(lang,
      `${label} no dejó borrar la publicación${detail ? ` (${detail})` : ''}. Sigue publicada${url ? `: ${url}` : '.'}`,
      `${label} refused to delete the post${detail ? ` (${detail})` : ''}. It is still live${url ? `: ${url}` : '.'}`);
    throw new ServiceError('provider_error', 502, message, {
      error: message, platform, account: post.username, post_url: url,
      removal_instructions: manualRemovalSteps(platform, lang, { username: post.username, postUrl: url }),
    }).markReported();
  }

  const db = createSupabaseServer();
  const { error } = await db
    .from('kefy_scheduled_posts')
    .update({ status: 'deleted', platform_post_url: null, error_message: null })
    .eq('id', post.id)
    .eq('org_id', ctx.auth.orgId);
  if (error) {
    reportError(new Error(error.message), {
      route: 'lib/services/publish', service: 'supabase', auth: ctx.auth, extra: { op: 'deletePublishedPost', postId: post.id },
    });
    throw new ServiceError('unavailable', 500, msg(lang,
      `La publicación ya se borró de ${label}, pero Kefy no pudo registrarlo.`,
      `The post was deleted from ${label}, but Kefy could not record it.`)).markReported();
  }

  const item_status = await syncContentItemStatus(db, post.content_item_id);
  return { id: post.id, content_item_id: post.content_item_id, platform, item_status };
}
