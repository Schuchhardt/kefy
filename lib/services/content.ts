// ─── Servicio de contenido ────────────────────────────────────────────────────
//
// Lógica de /api/content, /api/content/[itemId], /api/content/generate,
// /api/content/image y /api/content/carousel, extraída para que las rutas de
// la UI y las herramientas del asistente (chat, MCP, API) compartan el mismo
// código. Ver lib/services/context.ts para el significado de brandScope.
//
// Las rutas conservan sus estados y mensajes: cada ServiceError lleva el
// mismo status y texto que la ruta devolvía antes de la extracción.
//
// Las operaciones con IA cobran con chargeOrThrow en el mismo punto donde la
// ruta llamaba a guardAiRequest (regla de AGENTS.md: toda ruta que gasta pasa
// por la guardia). Ver docs/beta-abierta.md.

import { createSupabaseServer } from '@/lib/supabase';
import { generateCarouselSlides, generateContentImage, generateContentText } from '@/lib/ai';
import { consumeCredits, refundCredits } from '@/lib/usage';
import { uploadBase64Image } from '@/lib/storage';
import { reportError } from '@/lib/observability';
import { isAllowedMediaUrl, isKefyStorageUrl } from '@/lib/assistant/url-allowlist';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, chargeOrThrow, msg } from '@/lib/services/errors';
import { loadOwnedItem } from '@/lib/services/ownership';
import { brandPromptContext, getBrandKitForBrand } from '@/lib/services/brand-kit';
import { ingestExternalMedia } from '@/lib/services/media-ingest';
import type { AIModel, BrandImageContext, ContentChannel, GenerateTextResult } from '@/types/ai';
import type { CarouselSlide, ContentStatus, ContentType, SlideInput } from '@/types/content';
import type { BrandKit } from '@/types/brand-kit';

// ─── Valores válidos ──────────────────────────────────────────────────────────

export const CONTENT_CHANNELS = [
  'linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads', 'generic',
] as const satisfies readonly ContentChannel[];
export const CONTENT_STATUSES = [
  'draft', 'approved', 'scheduled', 'published', 'archived',
] as const satisfies readonly ContentStatus[];
export const CONTENT_TYPES = ['post', 'carousel', 'reel', 'story'] as const satisfies readonly ContentType[];
export const RENDER_STATUSES = ['not_rendered', 'rendering', 'ready', 'error'] as const;
export const IMAGE_SIZES = ['1024x1024', '1536x1024', '1024x1536', '1080x1080', '1024x1792', 'auto'] as const;
export const IMAGE_QUALITIES = ['low', 'medium', 'high', 'auto'] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

const VALID_CHANNELS = new Set<string>(CONTENT_CHANNELS);
const VALID_STATUSES = new Set<string>(CONTENT_STATUSES);
const VALID_CONTENT_TYPES = new Set<string>(CONTENT_TYPES);
const VALID_RENDER_STATUSES = new Set<string>(RENDER_STATUSES);

/** Columnas que devuelve el listado (las mismas que GET /api/content). */
const LIST_COLUMNS =
  'id, channel, content_type, status, title, body, image_url, image_status, hashtags, slides, video_url, render_status, created_by, created_at, updated_at';

/** Campos que PATCH /api/content/[itemId] deja escribir. */
export const UPDATABLE_FIELDS = [
  'title', 'body', 'image_url', 'image_prompt', 'hashtags', 'status', 'metadata', 'video_url', 'render_status',
] as const;

/** De dónde vino un contenido: la UI, el chat, la API o MCP. */
function createdVia(ctx: ServiceContext): 'ui' | 'chat' | 'api' | 'mcp' {
  return ctx.source === 'route' ? 'ui' : ctx.source;
}

/** Campos de texto de un contenido: los que el asistente le lee al modelo. */
const TEXT_FIELDS = ['title', 'body', 'hashtags', 'slides'] as const;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

// ─── Brand kit ────────────────────────────────────────────────────────────────

type KitRow = {
  id?: string | null;
  name?: string | null;
  tagline?: string | null;
  tone?: string[] | null;
  industry?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  logo_url?: string | null;
};

/**
 * Brand kit de una marca. Siempre por brand_id: el `.eq('org_id').maybeSingle()`
 * de antes fallaba en cuanto la organización tenía más de una marca.
 */
async function loadKit(brandId: string | null | undefined): Promise<KitRow | null> {
  if (!brandId) return null;
  // Como antes, un error al leer el kit no es fatal: se genera sin contexto.
  const { data } = await getBrandKitForBrand(createSupabaseServer(), brandId);
  return (data ?? null) as KitRow | null;
}

/** Contexto de marca para los prompts de texto (mismo mapeo que antes). */
function promptContext(kit: KitRow | null) {
  return brandPromptContext(kit as Pick<BrandKit, 'name' | 'tagline' | 'tone' | 'industry'> | null);
}

// ─── Slides ───────────────────────────────────────────────────────────────────

/**
 * Normaliza los slides de un contenido creado a mano. `null` si no es un array
 * no vacío de objetos. El orden se renumera 1..N para evitar duplicados.
 */
export function sanitizeSlides(raw: unknown): SlideInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: SlideInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (typeof r !== 'object' || r === null) return null;
    const s = r as Record<string, unknown>;
    const order = typeof s.slide_order === 'number' ? s.slide_order : i + 1;
    out.push({
      slide_order:      order,
      title:            typeof s.title === 'string' ? s.title.slice(0, 200) : null,
      body:             typeof s.body  === 'string' ? s.body.slice(0, 2000) : null,
      image_url:        typeof s.image_url === 'string' && s.image_url ? s.image_url : null,
      duration_seconds: typeof s.duration_seconds === 'number' ? s.duration_seconds : null,
    });
  }
  // Normalize order to 1..N to avoid duplicates
  out.sort((a, b) => a.slide_order - b.slide_order);
  out.forEach((s, i) => { s.slide_order = i + 1; });
  return out;
}

/** Igual que sanitizeSlides pero para una edición: descarta lo que no es objeto. */
function sanitizePatchSlides(raw: unknown[]): Array<Record<string, unknown>> {
  return raw
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map((s, i) => ({
      slide_order:      typeof s.slide_order === 'number' ? s.slide_order : i + 1,
      title:            typeof s.title === 'string' ? s.title.slice(0, 200) : null,
      body:             typeof s.body  === 'string' ? s.body.slice(0, 2000) : null,
      image_url:        typeof s.image_url === 'string' && s.image_url ? s.image_url : null,
      duration_seconds: typeof s.duration_seconds === 'number' ? s.duration_seconds : null,
    }))
    .sort((a, b) => (a.slide_order as number) - (b.slide_order as number))
    .map((s, i) => ({ ...s, slide_order: i + 1 }));
}

// ─── listContent ──────────────────────────────────────────────────────────────

export interface ListContentInput {
  channel?: string | null;
  status?: string | null;
  content_type?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
  /** Incluye `metadata` (las herramientas lo necesitan para saber el origen). */
  withMetadata?: boolean;
}

/**
 * Prepara el texto para `.or(title.ilike…)`: escapa los comodines de LIKE
 * (%, _ y la barra) y quita los caracteres que PostgREST usa para separar
 * condiciones (coma, paréntesis, comillas).
 */
function escapeSearch(s: string): string {
  return s.replace(/[,()"']/g, ' ').replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Contenidos de la marca del contexto, del más nuevo al más viejo. Los filtros
 * con valores no válidos se ignoran, como hacía GET /api/content.
 */
export async function listContent(
  ctx: ServiceContext,
  input: ListContentInput = {},
): Promise<{ items: Record<string, unknown>[]; total: number }> {
  const limit = Math.min(Math.max(Number.isFinite(input.limit) ? Number(input.limit) : 20, 1), 100);
  const offset = Math.max(Number.isFinite(input.offset) ? Number(input.offset) : 0, 0);

  const db = createSupabaseServer();
  let query = db
    .from('kefy_content_items')
    .select(input.withMetadata ? `${LIST_COLUMNS}, metadata` : LIST_COLUMNS, { count: 'exact' })
    .eq('org_id', ctx.auth.orgId)
    .eq('brand_id', ctx.brandId);

  if (input.channel && VALID_CHANNELS.has(input.channel)) query = query.eq('channel', input.channel);
  if (input.status && VALID_STATUSES.has(input.status)) query = query.eq('status', input.status);
  if (input.content_type && VALID_CONTENT_TYPES.has(input.content_type)) {
    query = query.eq('content_type', input.content_type);
  }
  const search = input.search?.trim().slice(0, 100);
  if (search) {
    const esc = escapeSearch(search);
    query = query.or(`title.ilike.%${esc}%,body.ilike.%${esc}%`);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    reportError(new Error(error.message), {
      route: 'lib/services/content', service: 'supabase', auth: ctx.auth, extra: { op: 'listContent' },
    });
    throw new ServiceError('unavailable', 500, 'Failed to fetch content').markReported();
  }

  return { items: (data ?? []) as unknown as Record<string, unknown>[], total: count ?? 0 };
}

// ─── getContent ───────────────────────────────────────────────────────────────

export interface ContentDetail {
  item: Record<string, unknown>;
  drafts: Record<string, unknown>[];
  scheduled_posts?: Record<string, unknown>[];
}

/**
 * Un contenido con sus borradores. Con `withScheduled` añade sus publicaciones
 * (programadas, publicadas o fallidas) con la cuenta de destino.
 */
export async function getContent(
  ctx: ServiceContext,
  itemId: string,
  opts: { withScheduled?: boolean } = {},
): Promise<ContentDetail> {
  const db = createSupabaseServer();

  // Misma regla que loadOwnedItem (org_id y, en 'strict', brand_id), pero un
  // error de base sigue siendo 500 y no 404, como en GET /api/content/[itemId].
  let q = db
    .from('kefy_content_items')
    .select('*')
    .eq('id', itemId)
    .eq('org_id', ctx.auth.orgId);
  if (ctx.brandScope === 'strict') q = q.eq('brand_id', ctx.brandId);
  const { data: item, error } = await q.maybeSingle();

  if (error) {
    reportError(new Error(error.message), {
      route: 'lib/services/content', service: 'supabase', auth: ctx.auth, extra: { op: 'getContent', itemId },
    });
    throw new ServiceError('unavailable', 500, 'Failed to fetch item').markReported();
  }
  if (!item) throw new ServiceError('not_found', 404, 'Not found');

  const { data: drafts } = await db
    .from('kefy_content_drafts')
    .select('id, body, model, tokens_used, selected, created_at')
    .eq('content_item_id', itemId)
    .eq('org_id', ctx.auth.orgId)
    .order('created_at', { ascending: false });

  const out: ContentDetail = { item: item as Record<string, unknown>, drafts: (drafts ?? []) as Record<string, unknown>[] };

  if (opts.withScheduled) {
    const { data: posts } = await db
      .from('kefy_scheduled_posts')
      .select('id, status, scheduled_at, published_at, kefy_social_accounts(platform, username)')
      .eq('content_item_id', itemId)
      .eq('org_id', ctx.auth.orgId)
      .order('scheduled_at', { ascending: false });
    out.scheduled_posts = (posts ?? []) as Record<string, unknown>[];
  }

  return out;
}

// ─── createManualContent ──────────────────────────────────────────────────────

/**
 * Crea un borrador sin IA (no gasta créditos). La entrada es el cuerpo de
 * POST /api/content; las validaciones y sus mensajes son los de la ruta.
 *
 * Desde la API o MCP, toda media que no esté ya en el Storage de Kefy se
 * descarga y se re-aloja (ingestExternalMedia): a Zernio solo le llegan
 * archivos nuestros.
 */
export async function createManualContent(
  ctx: ServiceContext,
  input: Record<string, unknown>,
): Promise<{ item: Record<string, unknown> }> {
  if (!input.channel || !VALID_CHANNELS.has(input.channel as string)) {
    throw new ServiceError('invalid_input', 422, `channel must be one of: ${CONTENT_CHANNELS.join(', ')}`);
  }

  const contentType = typeof input.content_type === 'string' && VALID_CONTENT_TYPES.has(input.content_type)
    ? input.content_type
    : 'post';

  // Carousel/reel require at least one slide
  let slides: SlideInput[] | null = null;
  if (contentType === 'carousel' || contentType === 'reel') {
    slides = sanitizeSlides(input.slides);
    if (!slides || slides.length === 0) {
      throw new ServiceError('invalid_input', 422, `${contentType} requires a non-empty 'slides' array`);
    }
  }

  let videoUrl = (contentType === 'reel' || contentType === 'story') && typeof input.video_url === 'string' && input.video_url
    ? input.video_url
    : null;
  let explicitImage = typeof input.image_url === 'string' && input.image_url ? input.image_url : null;

  // Media externa → Storage de Kefy (solo API/MCP; la UI ya sube a Storage).
  if (ctx.source === 'api' || ctx.source === 'mcp') {
    const rehost = async (url: string | null | undefined, kind: 'image' | 'video') =>
      url && !isKefyStorageUrl(url) ? ingestExternalMedia(ctx, url, kind) : (url ?? null);

    explicitImage = await rehost(explicitImage, 'image');
    videoUrl = await rehost(videoUrl, 'video');
    if (slides) {
      for (const s of slides) s.image_url = await rehost(s.image_url, 'image');
    }
  }

  // For carousel/reel, derive cover image from first slide if not explicitly provided
  const coverImage = explicitImage
    ?? (slides ? slides.find((s) => !!s.image_url)?.image_url ?? null : null);

  const kit = await loadKit(ctx.brandId);

  const db = createSupabaseServer();
  const { data: item, error } = await db
    .from('kefy_content_items')
    .insert({
      org_id:       ctx.auth.orgId,
      brand_id:     ctx.brandId,
      brand_kit_id: kit?.id ?? null,
      created_by:   ctx.auth.userId,
      channel:      input.channel,
      content_type: contentType,
      title:        typeof input.title === 'string'  ? input.title.trim().slice(0, 200)  : null,
      body:         typeof input.body  === 'string'  ? input.body.trim()                  : null,
      image_url:    coverImage,
      slides:       slides,
      video_url:    videoUrl,
      hashtags:     Array.isArray(input.hashtags) ? input.hashtags.filter((h) => typeof h === 'string') : [],
      status:       'draft',
      metadata:     { created_via: createdVia(ctx) },
    })
    .select('*')
    .single();

  if (error || !item) {
    reportError(new Error(error?.message ?? 'insert returned no row'), {
      route: 'lib/services/content', service: 'supabase', auth: ctx.auth, extra: { op: 'createManualContent' },
    });
    throw new ServiceError('unavailable', 500, 'Failed to create content item').markReported();
  }

  return { item: item as Record<string, unknown> };
}

// ─── updateContent ────────────────────────────────────────────────────────────

export interface UpdateContentOptions {
  /** Estados a los que se puede mover el contenido. Por defecto, todos. */
  allowedStatuses?: readonly string[];
  /** Campos editables. Por defecto, los de PATCH /api/content/[itemId]. */
  fields?: readonly string[];
}

/**
 * Edita un contenido. La entrada es el cuerpo de PATCH /api/content/[itemId];
 * validaciones y mensajes son los de la ruta. El UPDATE filtra por org_id (y
 * por brand_id con brandScope 'strict'): un id ajeno da el mismo 404 que uno
 * que no existe.
 */
export async function updateContent(
  ctx: ServiceContext,
  itemId: string,
  input: Record<string, unknown>,
  opts: UpdateContentOptions = {},
): Promise<{ item: Record<string, unknown> }> {
  const allowedStatuses = new Set(opts.allowedStatuses ?? CONTENT_STATUSES);

  if (input.status !== undefined && !(VALID_STATUSES.has(input.status as string) && allowedStatuses.has(input.status as string))) {
    throw new ServiceError('invalid_input', 422, 'Invalid status');
  }
  if (input.render_status !== undefined && input.render_status !== null && !VALID_RENDER_STATUSES.has(input.render_status as string)) {
    throw new ServiceError('invalid_input', 422, 'Invalid render_status');
  }

  // Sanitize slides if provided
  let sanitizedSlides: Array<Record<string, unknown>> | undefined;
  if ('slides' in input) {
    if (!Array.isArray(input.slides)) {
      throw new ServiceError('invalid_input', 422, 'slides must be an array');
    }
    sanitizedSlides = sanitizePatchSlides(input.slides);
  }

  const fields = new Set<string>(opts.fields ?? UPDATABLE_FIELDS);
  const update: Record<string, unknown> = {};
  for (const key of UPDATABLE_FIELDS) {
    if (fields.has(key) && key in input) update[key] = input[key] ?? null;
  }
  if (sanitizedSlides !== undefined && (opts.fields === undefined || fields.has('slides'))) {
    update.slides = sanitizedSlides;
  }

  if (Object.keys(update).length === 0) {
    throw new ServiceError('invalid_input', 422, 'No valid fields to update');
  }

  const db = createSupabaseServer();

  // Procedencia por edición, no solo por creación: si la API o MCP reescriben
  // el texto, metadata.externally_modified queda en true para siempre y las
  // herramientas del chat que lo leen contaminan el turno (created_via no
  // cambia al editar). Un PATCH de la UI que reemplaza metadata no la borra.
  const externalEdit = (ctx.source === 'api' || ctx.source === 'mcp') && TEXT_FIELDS.some((k) => k in update);
  if (externalEdit || 'metadata' in update) {
    let mq = db.from('kefy_content_items').select('metadata').eq('id', itemId).eq('org_id', ctx.auth.orgId);
    if (ctx.brandScope === 'strict') mq = mq.eq('brand_id', ctx.brandId);
    const { data: cur } = await mq.maybeSingle();
    const currentMeta = asRecord((cur as { metadata?: unknown } | null)?.metadata) ?? {};
    const base = 'metadata' in update ? (asRecord(update.metadata) ?? {}) : currentMeta;
    if (externalEdit) {
      update.metadata = { ...base, externally_modified: true, last_modified_via: ctx.source };
    } else if (currentMeta.externally_modified === true) {
      update.metadata = {
        ...base,
        externally_modified: true,
        last_modified_via: currentMeta.last_modified_via ?? null,
      };
    }
  }

  let q = db
    .from('kefy_content_items')
    .update(update)
    .eq('id', itemId)
    .eq('org_id', ctx.auth.orgId);
  if (ctx.brandScope === 'strict') q = q.eq('brand_id', ctx.brandId);

  const { data: item, error } = await q.select('*').maybeSingle();

  if (error) {
    reportError(new Error(error.message), {
      route: 'lib/services/content', service: 'supabase', auth: ctx.auth, extra: { op: 'updateContent', itemId },
    });
    throw new ServiceError('unavailable', 500, 'Failed to update item').markReported();
  }
  if (!item) throw new ServiceError('not_found', 404, 'Not found');

  return { item: item as Record<string, unknown> };
}

// ─── generateTextPost ─────────────────────────────────────────────────────────

export interface GenerateTextPostInput {
  topic: string;
  channel?: ContentChannel;
  model?: AIModel;
  /** Contenido existente al que se adjunta el borrador. */
  itemId?: string | null;
  /** false → solo genera, no guarda. Por defecto, true. */
  save?: boolean;
}

export interface GenerateTextPostResult {
  result: GenerateTextResult;
  itemId?: string;
  draft?: Record<string, unknown> | null;
}

const TEXT_ROUTE = 'POST /api/content/generate';

/**
 * Genera el texto de un post (1 crédito) y, salvo `save: false`, lo guarda:
 * como borrador de `itemId` o como contenido nuevo. Devuelve lo mismo que
 * POST /api/content/generate: `{ result }` o `{ itemId, result, draft }`.
 */
export async function generateTextPost(
  ctx: ServiceContext,
  input: GenerateTextPostInput,
): Promise<GenerateTextPostResult> {
  const channel: ContentChannel = input.channel ?? 'generic';
  const shouldSave = input.save !== false;
  const db = createSupabaseServer();

  // Brand kit context if available
  const kit = await loadKit(ctx.brandId);

  // El contenido al que se adjunta se comprueba antes de cobrar: un id ajeno
  // no debe costarle un crédito a nadie.
  let existingItemId: string | null = null;
  if (shouldSave && input.itemId) {
    const existing = await loadOwnedItem<{ id: string }>(ctx, input.itemId, 'id', 'Content item not found');
    existingItemId = existing.id;
  }

  const refund = await chargeOrThrow(ctx, 'text', TEXT_ROUTE);

  let result: GenerateTextResult;
  try {
    result = await generateContentText({
      channel,
      topic:    input.topic.trim().slice(0, 500),
      model:    input.model ?? 'claude',
      language: ctx.language,
      ...promptContext(kit),
    });
  } catch (err) {
    // El fallo es nuestro o del proveedor: se devuelve la cuota consumida.
    await refund();
    reportError(err, { route: TEXT_ROUTE, auth: ctx.auth, service: 'ai', extra: { channel, source: ctx.source } });
    const message = err instanceof Error ? err.message : 'AI generation failed';
    throw new ServiceError('provider_error', 502, message).markReported();
  }

  if (!shouldSave) return { result };

  // Resolve or create content item
  let itemId: string;
  if (existingItemId) {
    itemId = existingItemId;
  } else {
    const { data: newItem, error: itemError } = await db
      .from('kefy_content_items')
      .insert({
        org_id:       ctx.auth.orgId,
        brand_id:     ctx.brandId || null,
        brand_kit_id: kit?.id ?? null,
        created_by:   ctx.auth.userId,
        channel,
        body:         result.body,
        hashtags:     result.hashtags,
        status:       'draft',
        metadata:     { created_via: createdVia(ctx) },
      })
      .select('id')
      .single();

    if (itemError || !newItem) {
      reportError(new Error(itemError?.message ?? 'insert returned no row'), {
        route: TEXT_ROUTE, service: 'supabase', auth: ctx.auth,
      });
      throw new ServiceError('unavailable', 500, 'Failed to save content item').markReported();
    }
    itemId = (newItem as { id: string }).id;
  }

  // Deselect previous drafts for this item
  await db
    .from('kefy_content_drafts')
    .update({ selected: false })
    .eq('content_item_id', itemId)
    .eq('org_id', ctx.auth.orgId);

  // Insert draft
  const { data: draft, error: draftError } = await db
    .from('kefy_content_drafts')
    .insert({
      content_item_id: itemId,
      org_id:          ctx.auth.orgId,
      body:            result.body,
      model:           result.model,
      tokens_used:     result.tokensUsed,
      selected:        true,
    })
    .select('id, body, model, tokens_used, selected, created_at')
    .single();

  if (draftError || !draft) {
    // Non-fatal — item was created, just log
    console.error('draft insert error:', draftError?.message);
  }

  // Update item body + hashtags with latest generation
  await db
    .from('kefy_content_items')
    .update({ body: result.body, hashtags: result.hashtags })
    .eq('id', itemId)
    .eq('org_id', ctx.auth.orgId);

  return { itemId, result, draft: (draft ?? null) as Record<string, unknown> | null };
}

// ─── generateImageForItem ─────────────────────────────────────────────────────

export interface GenerateImageInput {
  /** Si se da, la imagen pasa a ser la principal de ese contenido. */
  itemId?: string | null;
  prompt: string;
  size?: ImageSize;
  quality?: ImageQuality;
  /** URLs de imágenes de referencia (máx. 3), solo del Storage de Kefy. */
  referenceImageUrls?: string[];
}

const IMAGE_ROUTE = 'POST /api/content/image';

/** Descarga el logo del brand kit en base64. Si falla, se sigue sin logo. */
async function fetchLogo(logoUrl: string | null | undefined): Promise<{ logoB64?: string; logoMimeType?: string }> {
  if (!logoUrl) return {};
  try {
    const logoRes = await fetch(logoUrl);
    if (!logoRes.ok) return {};
    const buf = await logoRes.arrayBuffer();
    return {
      logoB64:      Buffer.from(buf).toString('base64'),
      logoMimeType: logoRes.headers.get('content-type') ?? 'image/png',
    };
  } catch {
    // Non-fatal: proceed without logo reference
    return {};
  }
}

/**
 * Genera una imagen con gpt-image (3 créditos), la sube al Storage y, con
 * `itemId`, la enlaza al contenido. Devuelve `{ image: { url, revisedPrompt } }`,
 * lo mismo que POST /api/content/image.
 *
 * image_status pasa a 'generating' solo después de cobrar: si la guardia
 * bloquea, el contenido no queda marcado como en curso.
 */
export async function generateImageForItem(
  ctx: ServiceContext,
  input: GenerateImageInput,
): Promise<{ image: { url: string; revisedPrompt: string | null } }> {
  const lang = ctx.language;
  const prompt = input.prompt.trim().slice(0, 1000);
  const itemId = input.itemId || null;
  const db = createSupabaseServer();

  // 1. Propiedad del contenido. En 'org' (la ruta) el UPDATE ya filtra por
  //    org_id, como antes; con 'strict' se comprueba también la marca.
  let itemBrandId: string | null = null;
  if (itemId && ctx.brandScope === 'strict') {
    const item = await loadOwnedItem<{ id: string; brand_id: string | null }>(ctx, itemId, 'id, brand_id');
    itemBrandId = item.brand_id;
  }

  // 2. Referencias: solo imágenes del Storage de Kefy (nada de URLs arbitrarias
  //    que el proveedor de IA tenga que ir a buscar).
  const referenceImages = input.referenceImageUrls?.slice(0, 3);
  if (referenceImages?.some((u) => !isAllowedMediaUrl(u, { referenceOnly: true }))) {
    throw new ServiceError(
      'invalid_input', 422,
      msg(lang, 'Las imágenes de referencia deben estar subidas a Kefy', 'Reference images must be uploaded to Kefy'),
    );
  }

  // 3. Cobro.
  const refund = await chargeOrThrow(ctx, 'image', IMAGE_ROUTE);

  const markItem = async (patch: Record<string, unknown>) => {
    if (!itemId) return;
    await db.from('kefy_content_items').update(patch).eq('id', itemId).eq('org_id', ctx.auth.orgId);
  };

  // 4. Marca el contenido como en curso para que una recarga (o abrirlo a
  //    mitad de la generación) muestre el estado pendiente y no un hueco vacío.
  await markItem({ image_status: 'generating' });

  // 5. Contexto de marca (colores, tono, logo).
  const kit = await loadKit(itemBrandId ?? ctx.brandId);
  const logo = await fetchLogo(kit?.logo_url);
  const brand: BrandImageContext | undefined = kit ? {
    name:           kit.name            ?? undefined,
    primaryColor:   kit.primary_color   ?? undefined,
    secondaryColor: kit.secondary_color ?? undefined,
    accentColor:    kit.accent_color    ?? undefined,
    tone:           kit.tone            ?? undefined,
    ...logo,
  } : undefined;

  let result;
  try {
    result = await generateContentImage({
      prompt,
      size:    input.size ?? '1024x1024',
      quality: input.quality ?? 'medium',
      brand,
      referenceImages,
    });
  } catch (err) {
    await refund();
    reportError(err, { route: IMAGE_ROUTE, auth: ctx.auth, service: 'ai', extra: { source: ctx.source } });
    await markItem({ image_status: 'error' });
    const message = err instanceof Error ? err.message : 'Image generation failed';
    throw new ServiceError('provider_error', 502, message).markReported();
  }

  // La imagen se guarda limpia. El texto del slide se dibuja como overlay HTML
  // en la vista previa y se quema sobre los píxeles al publicar, con la zona
  // segura de la red destino (ver lib/image-processor y lib/preview-layout).
  let publicUrl: string;
  try {
    publicUrl = await uploadBase64Image(result.b64, ctx.auth.orgId, `generated-${Date.now()}.jpeg`);
  } catch (err) {
    // La imagen se generó pero no se pudo guardar: fallo nuestro, no se cobra.
    await refund();
    reportError(err, { route: IMAGE_ROUTE, auth: ctx.auth, service: 'supabase', extra: { fase: 'upload' } });
    await markItem({ image_status: 'error' });
    const message = err instanceof Error ? err.message : 'Storage upload failed';
    throw new ServiceError('unavailable', 500, message).markReported();
  }

  // Optionally link to a content item
  if (itemId) {
    const { error } = await db
      .from('kefy_content_items')
      .update({ image_url: publicUrl, image_prompt: prompt, image_status: 'ready' })
      .eq('id', itemId)
      .eq('org_id', ctx.auth.orgId);

    if (error) {
      // Non-fatal: return result anyway
      console.error('image link to item error:', error.message);
    }
  }

  return { image: { url: publicUrl, revisedPrompt: result.revisedPrompt ?? null } };
}

// ─── generateCarousel ─────────────────────────────────────────────────────────

export interface GenerateCarouselInput {
  topic: string;
  channel?: ContentChannel;
  /** 3–10; por defecto 5. */
  slideCount?: number;
  /** Una imagen por slide (3 créditos cada una). Por defecto, true. */
  generateImages?: boolean;
  imageQuality?: 'low' | 'medium' | 'high';
  /** false → no persiste. Por defecto, true. */
  save?: boolean;
}

export interface GenerateCarouselServiceResult {
  itemId?: string;
  slides: Array<CarouselSlide & { image_url: string | null; text_baked: boolean }>;
  description: string;
  hashtags: string[];
  model: string;
  tokensUsed: number;
}

const CAROUSEL_ROUTE = 'POST /api/content/carousel';

/**
 * Genera un carrusel: Claude escribe los slides (1 crédito) y, si se piden,
 * gpt-image genera una imagen por slide, cada una cobrada aparte (3 créditos).
 * Si los créditos se acaban a mitad, los slides restantes salen sin imagen.
 */
export async function generateCarousel(
  ctx: ServiceContext,
  input: GenerateCarouselInput,
): Promise<GenerateCarouselServiceResult> {
  const channel: ContentChannel = input.channel ?? 'generic';
  const rawCount = typeof input.slideCount === 'number' ? input.slideCount : 5;
  const slideCount = Math.min(10, Math.max(3, Math.floor(rawCount)));
  const genImages = input.generateImages !== false;
  const imageQuality = input.imageQuality ?? 'medium';
  const { auth } = ctx;

  const kit = await loadKit(ctx.brandId);

  const refund = await chargeOrThrow(ctx, 'text', CAROUSEL_ROUTE);

  // 1. Generate slide copy with Claude
  let generated;
  try {
    generated = await generateCarouselSlides({
      channel,
      topic:       input.topic.trim().slice(0, 500),
      slide_count: slideCount,
      language:    ctx.language,
      ...promptContext(kit),
    });
  } catch (err) {
    await refund();
    reportError(err, { route: CAROUSEL_ROUTE, auth, service: 'ai', extra: { slideCount, source: ctx.source } });
    const message = err instanceof Error ? err.message : 'Carousel text generation failed';
    throw new ServiceError('provider_error', 502, message).markReported();
  }

  // 2. Optionally generate one image per slide in parallel (imagen limpia, sin texto)
  const slides = await Promise.all(
    generated.slides.map(async (slide) => {
      if (!genImages || !slide.image_prompt) return { ...slide, image_url: null, text_baked: false };

      // Cada slide es una imagen generada aparte, así que cada una consume su
      // unidad de cuota. Si se agota a mitad del carrusel, los slides restantes
      // salen sin imagen en lugar de fallar: el texto ya está generado y es
      // preferible entregarlo a perderlo entero.
      const slideCredits = await consumeCredits(auth.orgId, auth.plan, 'image').catch(() => null);
      if (!slideCredits?.allowed) return { ...slide, image_url: null, text_baked: false };

      try {
        const imgResult = await generateContentImage({
          prompt:  slide.image_prompt,
          size:    '1024x1024',
          quality: imageQuality,
        });

        // La imagen se guarda LIMPIA, sin el texto quemado: en la app el
        // título/cuerpo van como overlay HTML (nítidos y editables) y sólo se
        // componen sobre los píxeles al publicar, ya con la zona segura de la
        // red destino. Quemarlos acá además duplicaba el texto en la preview.
        const imageUrl = await uploadBase64Image(
          imgResult.b64,
          auth.orgId,
          `carousel-slide-${slide.slide_order}-${Date.now()}.jpeg`,
        );
        return { ...slide, image_url: imageUrl, text_baked: false };
      } catch (imgErr) {
        // La imagen se cobró al empezar: si no salió, se devuelve.
        await refundCredits(auth.orgId, 'image');
        reportError(imgErr, {
          route: CAROUSEL_ROUTE, auth, service: 'ai',
          extra: { slide: slide.slide_order, fase: 'imagen' },
        });
        return { ...slide, image_url: null, text_baked: false };
      }
    }),
  );

  const base = {
    slides,
    description: generated.description,
    hashtags:    generated.hashtags,
    model:       generated.model,
    tokensUsed:  generated.tokensUsed,
  };

  if (input.save === false) return base;

  // 3. Persist as a content item with content_type='carousel'
  const firstSlide = slides[0];
  const db = createSupabaseServer();
  const { data: item, error: itemError } = await db
    .from('kefy_content_items')
    .insert({
      org_id:       auth.orgId,
      brand_id:     ctx.brandId || null,
      brand_kit_id: kit?.id ?? null,
      created_by:   auth.userId,
      channel,
      content_type: 'carousel',
      title:        firstSlide?.title ?? null,
      body:         generated.description,
      image_url:    firstSlide?.image_url ?? null,
      slides:       slides,
      hashtags:     generated.hashtags,
      status:       'draft',
      metadata:     { slide_count: slides.length, model: generated.model, created_via: createdVia(ctx) },
    })
    .select('id, content_type, channel, status, created_at')
    .single();

  if (itemError || !item) {
    reportError(new Error(itemError?.message ?? 'insert returned no row'), {
      route: CAROUSEL_ROUTE, service: 'supabase', auth,
    });
    throw new ServiceError('unavailable', 500, 'Failed to save carousel').markReported();
  }

  return { itemId: (item as { id: string }).id, ...base };
}
