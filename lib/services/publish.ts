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
import { resolvePublishMedia, type PublishMediaSource } from '@/lib/publish-media';
import type { CarouselSlide, ContentType } from '@/types/content';
import type { ContentChannel } from '@/types/ai';
import type { ZernioPublishPayload } from '@/types/social';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';
import { loadOwnedItem, loadOwnedScheduledPost } from '@/lib/services/ownership';

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
  'id, title, body, image_url, hashtags, channel, status, content_type, slides, video_url, mux_playback_id, brand_id';

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

  // Las cuentas tienen que ser de la misma marca que el contenido. Un contenido
  // antiguo sin brand_id, llamado desde una ruta (sin marca en el contexto),
  // mantiene el comportamiento de antes: cualquier cuenta activa de la org.
  const brandId = item.brand_id ?? (ctx.brandId || null);

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

  const { publishPost, STORY_CAPABLE_PLATFORMS } = await import('@/lib/zernio');

  console.log(
    `${tag} START itemId=${item.id} format=${format}` +
    (scheduledAt ? ` scheduledAt=${scheduledAt.toISOString()}` : '') +
    ` accounts=[${accounts.map((a) => `${a.id}(${a.platform})`).join(', ')}]`,
  );

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
    prefix:     mode === 'now' ? 'publish' : 'schedule',
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

  const results: PublishResultEntry[] = [];

  // Cada cuenta por separado: un fallo parcial no aborta el resto.
  for (const account of accounts) {
    try {
      const platform = (account.platform ?? 'generic') as ContentChannel;

      // Ajuste al formato de la red + texto quemado donde la red no lo muestra
      // (caption de story, y el título/cuerpo de cada slide del carrusel).
      let imageForAccount = media.image_url;
      if (media.image_url) {
        imageForAccount = await prepareSingleImage(
          media.image_url, sourceImageBuffer, platform, format,
          imageDeps,
          format === 'story' && !media.is_video && STORY_CAPABLE_PLATFORMS.has(account.platform)
            ? media.text
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
        (scheduledAt ? ` scheduledAt=${scheduledAt.toISOString()}` : '') +
        ` hasImage=${!!imageForAccount} mediaUrls=${mediaUrlsForAccount?.length ?? 0} hasVideo=${!!media.video_url}`,
      );

      const payload: ZernioPublishPayload = {
        account_id:   account.zernio_account_id!,
        platform:     account.platform,
        text:         media.text,
        image_url:    imageForAccount,
        media_urls:   mediaUrlsForAccount,
        video_url:    media.video_url,
        content_type: format,
        hashtags:     media.hashtags,
      };
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

  if (mode === 'now') {
    const anyPublished = results.some((r) => r.status === 'published');
    await db
      .from('kefy_content_items')
      .update({ status: allFailed ? 'approved' : 'published' })
      .eq('id', item.id)
      .eq('org_id', orgId);

    return { status: allFailed ? 502 : anyPublished ? 200 : 207, body: { results } };
  }

  if (!allFailed) {
    await db
      .from('kefy_content_items')
      .update({ status: 'scheduled' })
      .eq('id', item.id)
      .eq('org_id', orgId);
  }

  return { status: allFailed ? 502 : 201, body: { results } };
}

// ─── Listado de publicaciones ────────────────────────────────────────────────

export const SCHEDULED_POST_STATUSES = ['pending', 'scheduled', 'published', 'failed', 'cancelled'] as const;
export type ScheduledPostStatus = (typeof SCHEDULED_POST_STATUSES)[number];

/**
 * Publicaciones programadas / publicadas / fallidas (GET /api/social/schedule).
 *
 * La ruta es de toda la organización (brandScope 'org'), como hoy. Con
 * 'strict' solo se devuelven las de la marca del contexto: filas con ese
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
      zernio_post_id, platform_post_id, created_at,
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

  return { posts: (data ?? []) as unknown as Record<string, unknown>[] };
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

  // El contenido vuelve a 'approved' si solo estaba programado por esta fila.
  const { count } = await db
    .from('kefy_scheduled_posts')
    .select('id', { count: 'exact', head: true })
    .eq('content_item_id', post.content_item_id)
    .eq('org_id', ctx.auth.orgId)
    .eq('status', 'scheduled');

  const itemReverted = (count ?? 0) === 0;
  if (itemReverted) {
    await db
      .from('kefy_content_items')
      .update({ status: 'approved' })
      .eq('id', post.content_item_id)
      .eq('org_id', ctx.auth.orgId);
  }

  return { id: post.id, content_item_id: post.content_item_id, itemReverted };
}
