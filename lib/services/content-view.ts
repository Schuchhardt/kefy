// ─── Vista 1 de MCP Apps: el revisor de contenido ────────────────────────────
//
// buildContentView arma lo que la tarjeta de revisión de Kefy pinta dentro del
// chat (Claude, y cualquier host MCP Apps): la pieza tal como se publicaría,
// su estado y qué botones ofrecer. Lo llaman review_content y, después de un
// resultado correcto, las herramientas que abren la vista (create_post,
// create_story, create_carousel, create_reel, get_content) — ver
// lib/assistant/mcp.ts y docs/mcp-apps.md.
//
// A diferencia de lo que ve el modelo, el texto va LIMPIO, sin el envoltorio
// <untrusted_content>: la vista lo pinta siempre como texto (React escapa), y
// structuredContent no entra en el contexto del modelo.
//
// Solo lee: nunca cobra créditos (recargar la tarjeta es gratis).

import { createSupabaseServer } from '@/lib/supabase';
import { getUsage, CREDIT_COSTS } from '@/lib/usage';
import { absoluteUrl } from '@/lib/app-url';
import { itemLink } from '@/lib/assistant/links';
import type { ServiceContext } from '@/lib/services/context';
import { msg } from '@/lib/services/errors';
import { getContent, IMAGE_SIZES } from '@/lib/services/content';
import { renditionCredits } from '@/lib/services/renditions';
import { scriptForTarget, type VideoTarget } from '@/lib/services/video';
import {
  CONTENT_TYPES, VIEW_VERSION,
  type BrandViewT, type ContentActions, type ContentItemView, type ContentType, type ContentView,
  type PublishBlock, type ScheduledPostView, type SlideView,
} from '@/lib/mcp-app/contract';

/** Lo que permite la conexión que abrió la vista (scopes de la key / OAuth). */
export interface ViewPermissions {
  write: boolean;
  publish: boolean;
}

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

function asContentType(v: unknown): ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(v as string) ? (v as ContentType) : 'post';
}

// ─── Marca y créditos (compartido con la Vista 2) ────────────────────────────

/** Nombre y avatar de la marca del contexto (avatar propio o, si no, el logo del Brand Kit). */
export async function loadViewBrand(ctx: ServiceContext): Promise<BrandViewT> {
  const db = createSupabaseServer();
  const [{ data: brand }, { data: kit }] = await Promise.all([
    db.from('kefy_brands').select('id, name, avatar_url')
      .eq('id', ctx.brandId).eq('org_id', ctx.auth.orgId).maybeSingle(),
    db.from('kefy_brand_kits').select('logo_url').eq('brand_id', ctx.brandId).maybeSingle(),
  ]);
  const b = (brand ?? null) as { id?: string; name?: string | null; avatar_url?: string | null } | null;
  return {
    id: ctx.brandId,
    name: b?.name ?? null,
    avatar_url: b?.avatar_url || str((kit as Row | null)?.logo_url) || null,
  };
}

/** Créditos que le quedan a la organización este mes; null si no se pudo leer. */
export async function viewCreditsRemaining(ctx: ServiceContext): Promise<number | null> {
  try {
    return (await getUsage(ctx.auth.orgId, ctx.auth.plan)).remaining;
  } catch {
    return null;
  }
}

// ─── Reglas de la tarjeta (puras, testeadas) ─────────────────────────────────

const EDITABLE = new Set(['draft', 'approved']);

/**
 * Qué botones ofrece la tarjeta según el estado, el tipo y los scopes. El
 * servidor es la fuente de verdad: la vista no recalcula reglas.
 *
 * - Aprobar / volver a borrador / archivar / editar / regenerar: borrador o aprobado.
 * - Producir video: reel sin video, o story (la vista pasa antes por
 *   prepare_story_video si no tiene guion).
 * - Publicar: aprobado y, en un reel, con el video listo. Exige el scope
 *   `publish` (las conexiones OAuth nunca lo tienen: ver docs/assistant.md).
 */
export function contentActions(
  item: { status: string; content_type: ContentType; video_url: string | null },
  perms: ViewPermissions,
): { actions: ContentActions; publish_blocked: PublishBlock | null } {
  const editable = perms.write && EDITABLE.has(item.status);
  const videoMissing = item.content_type === 'reel' && !item.video_url;

  let publish_blocked: PublishBlock | null = null;
  if (item.status === 'draft') publish_blocked = 'not_approved';
  else if (item.status !== 'approved') publish_blocked = 'status';
  else if (videoMissing) publish_blocked = 'video_missing';
  else if (!perms.publish) publish_blocked = 'no_publish_scope';

  return {
    actions: {
      approve: perms.write && item.status === 'draft',
      unapprove: perms.write && item.status === 'approved',
      archive: editable,
      edit: editable,
      regenerate_image: editable,
      convert: perms.write && item.status !== 'archived',
      produce_video: editable && (item.content_type === 'story' || videoMissing),
      publish: publish_blocked === null,
    },
    publish_blocked,
  };
}

/** Tamaño propuesto al regenerar la imagen: vertical 9:16 para story y reel. */
export function defaultImageSize(type: ContentType): string {
  return type === 'story' || type === 'reel' ? '1024x1792' : '1024x1024';
}

export function mapSlides(slides: unknown): SlideView[] {
  if (!Array.isArray(slides)) return [];
  return slides.map((raw, i) => {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Row;
    return {
      slide_order: num(s.slide_order) ?? num(s.scene_order) ?? i + 1,
      title: str(s.title),
      body: str(s.body),
      image_url: str(s.image_url),
      duration_seconds: num(s.duration_seconds),
    };
  });
}

function mapScheduledPosts(posts: Row[] | undefined): ScheduledPostView[] {
  return (posts ?? []).map((p) => {
    const acc = one(p.kefy_social_accounts as Row | Row[] | null) as { platform?: string; username?: string } | null;
    return {
      id: String(p.id),
      status: String(p.status ?? ''),
      scheduled_at: str(p.scheduled_at),
      published_at: str(p.published_at),
      post_url: str(p.platform_post_url),
      platform: acc?.platform ?? null,
      username: acc?.username ?? null,
    };
  });
}

/** Si la pieza ya tiene guion de video (story: prepare_story_video; reel: escenas). */
function hasVideoScript(item: Row, type: ContentType, language: 'es' | 'en'): boolean {
  if (type !== 'reel' && type !== 'story') return false;
  const target: VideoTarget = {
    table: 'kefy_content_items',
    id: String(item.id),
    itemId: String(item.id),
    format: type,
    brandId: str(item.brand_id),
    slides: item.slides,
    metadata: (item.metadata && typeof item.metadata === 'object' ? item.metadata : {}) as Record<string, unknown>,
    videoUrl: str(item.video_url),
    renderStatus: str(item.render_status),
    title: str(item.title),
    hook: str(item.body),
    hashtags: Array.isArray(item.hashtags) ? (item.hashtags as string[]) : null,
  };
  try {
    return scriptForTarget(target, language) !== null;
  } catch {
    return false;
  }
}

// ─── buildContentView ────────────────────────────────────────────────────────

export interface ContentViewInput {
  /** Una pieza, o las variantes de create_reel (en orden). */
  itemIds: string[];
  variantGroupId?: string | null;
  /** Fallos de imagen que la herramienta devolvió en data.image_error (no se guardan). */
  imageErrors?: Record<string, { code: string; message: string } | undefined>;
  permissions: ViewPermissions;
}

export async function buildContentView(ctx: ServiceContext, input: ContentViewInput): Promise<ContentView> {
  const lang = ctx.language;
  const ids = [...new Set(input.itemIds)];

  // getContent aplica el mismo filtro que loadOwnedItem (org y, en strict,
  // marca): una pieza de otra marca es un 404, nunca se muestra.
  const details = await Promise.all(ids.map((id) => getContent(ctx, id, { withScheduled: true })));

  const db = createSupabaseServer();
  const [brand, remaining, { data: renditionRows }] = await Promise.all([
    loadViewBrand(ctx),
    viewCreditsRemaining(ctx),
    db.from('kefy_content_renditions').select('content_item_id, format, status').in('content_item_id', ids),
  ]);
  const renditions = new Map<string, ContentItemView['renditions']>();
  for (const r of (renditionRows ?? []) as Row[]) {
    const key = String(r.content_item_id);
    if (!(CONTENT_TYPES as readonly string[]).includes(r.format as string)) continue;
    const list = renditions.get(key) ?? [];
    list.push({ format: r.format as ContentType, status: str(r.status) });
    renditions.set(key, list);
  }

  const items: ContentItemView[] = details.map(({ item, scheduled_posts }) => {
    const id = String(item.id);
    const type = asContentType(item.content_type);
    const status = String(item.status ?? 'draft');
    const videoUrl = str(item.video_url);
    const imageStatus = str(item.image_status);
    const reported = input.imageErrors?.[id];
    const { actions, publish_blocked } = contentActions({ status, content_type: type, video_url: videoUrl }, input.permissions);

    return {
      id,
      content_type: type,
      channel: str(item.channel),
      status,
      title: str(item.title),
      body: str(item.body),
      hashtags: Array.isArray(item.hashtags) ? (item.hashtags as unknown[]).filter((h): h is string => typeof h === 'string') : [],
      image_url: str(item.image_url),
      image_status: imageStatus,
      image_error: reported
        ? { code: reported.code, message: reported.message }
        : imageStatus === 'error'
          ? { code: 'image_failed', message: msg(lang, 'La imagen no se pudo generar.', 'The image could not be generated.') }
          : null,
      video_url: videoUrl,
      render_status: str(item.render_status),
      slides: mapSlides(item.slides),
      scheduled_posts: mapScheduledPosts(scheduled_posts),
      renditions: renditions.get(id) ?? [],
      has_video_script: hasVideoScript(item, type, lang),
      created_at: str(item.created_at),
      updated_at: str(item.updated_at),
      actions,
      publish_blocked,
      default_image_size: defaultImageSize(type),
      link: absoluteUrl(itemLink(lang, id).href),
    };
  });

  return {
    kind: 'content',
    version: VIEW_VERSION,
    language: lang,
    brand,
    items,
    variant_group_id: input.variantGroupId ?? null,
    permissions: input.permissions,
    credits: {
      remaining,
      image: CREDIT_COSTS.image,
      story_script: CREDIT_COSTS.text,
      convert: {
        post: renditionCredits('post'),
        carousel: renditionCredits('carousel'),
        reel: renditionCredits('reel'),
        story: renditionCredits('story'),
      },
    },
    image_sizes: IMAGE_SIZES.filter((s) => s !== 'auto'),
  };
}
