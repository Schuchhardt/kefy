// ─── Servicio: analítica de publicaciones ────────────────────────────────────
//
// Lógica de GET /api/analytics, GET /api/analytics/posts y POST
// /api/analytics/sync, compartida con las herramientas get_analytics_overview,
// list_post_performance y sync_social_data del asistente.
//
// Las rutas de la UI consultan toda la organización (scope 'org'), como hoy.
// Las herramientas usan scope 'brand': solo las publicaciones hechas desde
// cuentas sociales de la marca del contexto.

import { createSupabaseServer } from '@/lib/supabase';
import { getPostAnalytics, ZernioError } from '@/lib/zernio';
import { reportError } from '@/lib/observability';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError } from '@/lib/services/errors';
import { pLimit } from '@/lib/services/concurrency';

export type AnalyticsScope = 'org' | 'brand';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rango por defecto: los últimos 30 días. */
function defaultRange(from?: string | null, to?: string | null): { from: string; to: string } {
  return {
    to:   to   ?? new Date().toISOString(),
    from: from ?? new Date(Date.now() - 30 * DAY_MS).toISOString(),
  };
}

function scopeOf(ctx: ServiceContext, scope?: AnalyticsScope): AnalyticsScope {
  return scope ?? (ctx.brandScope === 'strict' ? 'brand' : 'org');
}

/** PostgREST puede devolver una relación como objeto o como array de uno. */
function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

// ─── Resumen ──────────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  period: { from: string; to: string };
  totals: {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
    saves: number;
    posts: number;
    avg_engagement_rate: number;
  };
  by_platform: Record<string, { posts: number; impressions: number; engagement_rate: number }>;
  top_posts: Array<{
    scheduled_post_id: string;
    platform: string;
    content_id: string | null;
    body_preview: string;
    impressions: number;
    engagement_rate: number;
    likes: number;
    comments: number;
    shares: number;
  }>;
}

/**
 * Totales, desglose por red y top 5 publicaciones del periodo. Se queda con la
 * última medición de cada publicación y agrega en JS (el cliente de Supabase no
 * tiene funciones de ventana).
 */
export async function getAnalyticsOverview(
  ctx: ServiceContext,
  input: { from?: string | null; to?: string | null; scope?: AnalyticsScope } = {},
): Promise<AnalyticsOverview> {
  const { from, to } = defaultRange(input.from, input.to);
  const scope = scopeOf(ctx, input.scope);
  const db = createSupabaseServer();

  let query = db
    .from('kefy_post_metrics')
    .select(`
      id,
      scheduled_post_id,
      measured_at,
      impressions,
      reach,
      likes,
      comments,
      shares,
      clicks,
      saves,
      engagement_rate,
      kefy_scheduled_posts!inner (
        id,
        status,
        kefy_social_accounts!inner ( id, platform, brand_id ),
        kefy_content_items!inner ( id, channel, body )
      )
    `)
    .eq('org_id', ctx.auth.orgId)
    .gte('measured_at', from)
    .lte('measured_at', to)
    .order('measured_at', { ascending: false });

  if (scope === 'brand') {
    query = query.eq('kefy_scheduled_posts.kefy_social_accounts.brand_id', ctx.brandId);
  }

  const { data: metrics, error } = await query;

  if (error) {
    reportError(new Error(error.message), {
      route: 'lib/services/analytics', service: 'supabase', auth: ctx.auth, extra: { op: 'overview' },
    });
    throw new ServiceError('unavailable', 500, 'Failed to fetch analytics').markReported();
  }

  // Solo la última medición de cada publicación.
  const latestByPost = new Map<string, NonNullable<typeof metrics>[number]>();
  for (const row of metrics ?? []) {
    if (!latestByPost.has(row.scheduled_post_id)) {
      latestByPost.set(row.scheduled_post_id, row);
    }
  }

  const rows = Array.from(latestByPost.values());

  const totals = rows.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      reach:       acc.reach       + r.reach,
      likes:       acc.likes       + r.likes,
      comments:    acc.comments    + r.comments,
      shares:      acc.shares      + r.shares,
      clicks:      acc.clicks      + r.clicks,
      saves:       acc.saves       + r.saves,
      posts:       acc.posts       + 1,
    }),
    { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, clicks: 0, saves: 0, posts: 0 },
  );

  const avgEngagement =
    totals.posts > 0
      ? rows.reduce((sum, r) => sum + Number(r.engagement_rate ?? 0), 0) / totals.posts
      : 0;

  type Account = { platform: string };
  type Content = { id: string; channel: string; body: string };
  type PostRow = {
    id: string;
    kefy_social_accounts: Account | Account[] | null;
    kefy_content_items: Content | Content[] | null;
  };
  const postOf = (r: (typeof rows)[number]) => one(r.kefy_scheduled_posts as unknown as PostRow | PostRow[] | null);

  // Desglose por red.
  const byPlatform: AnalyticsOverview['by_platform'] = {};
  for (const r of rows) {
    const platform = one(postOf(r)?.kefy_social_accounts)?.platform ?? 'unknown';
    if (!byPlatform[platform]) byPlatform[platform] = { posts: 0, impressions: 0, engagement_rate: 0 };
    byPlatform[platform].posts           += 1;
    byPlatform[platform].impressions     += r.impressions;
    byPlatform[platform].engagement_rate += Number(r.engagement_rate ?? 0);
  }
  for (const p of Object.values(byPlatform)) {
    p.engagement_rate = p.posts > 0 ? p.engagement_rate / p.posts : 0;
  }

  // Top 5 por tasa de interacción.
  const top5 = [...rows]
    .sort((a, b) => Number(b.engagement_rate ?? 0) - Number(a.engagement_rate ?? 0))
    .slice(0, 5)
    .map((r) => {
      const post = postOf(r);
      // La ruta original solo leía el contenido si PostgREST lo devolvía como
      // array (en una relación N:1 llega como objeto) y el preview salía vacío.
      const content = one(post?.kefy_content_items);
      return {
        scheduled_post_id: r.scheduled_post_id,
        platform:          one(post?.kefy_social_accounts)?.platform ?? 'unknown',
        content_id:        content?.id ?? null,
        body_preview:      (content?.body ?? '').slice(0, 80),
        impressions:       r.impressions,
        engagement_rate:   Number(r.engagement_rate ?? 0),
        likes:             r.likes,
        comments:          r.comments,
        shares:            r.shares,
      };
    });

  return {
    period: { from, to },
    totals: { ...totals, avg_engagement_rate: Number(avgEngagement.toFixed(4)) },
    by_platform: byPlatform,
    top_posts: top5,
  };
}

// ─── Rendimiento por publicación ─────────────────────────────────────────────

export type PostPerformanceSort = 'engagement_rate' | 'impressions' | 'published_at';

export interface PostPerformanceItem {
  scheduled_post_id: string;
  platform: string | null;
  published_at: string | null;
  zernio_post_id: string | null;
  content: {
    id: string | null;
    channel: string | null;
    body_preview: string;
    has_image: boolean;
  };
  latest_metrics: {
    measured_at: string;
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
    saves: number;
    engagement_rate: number;
  } | null;
  snapshots_count: number;
}

/** Con un orden distinto a la fecha se ordena en memoria sobre, como mucho, esta ventana. */
const MAX_SORT_WINDOW = 500;

/**
 * Publicaciones publicadas en el rango con su última medición. La red sale de
 * la cuenta social (kefy_scheduled_posts no tiene columna `platform`).
 */
export async function listPostPerformance(
  ctx: ServiceContext,
  input: {
    from?: string | null;
    to?: string | null;
    platform?: string | null;
    sort?: PostPerformanceSort;
    limit?: number;
    page?: number;
    scope?: AnalyticsScope;
  } = {},
): Promise<{ data: PostPerformanceItem[]; total: number; page: number; limit: number }> {
  const { from, to } = defaultRange(input.from, input.to);
  const scope = scopeOf(ctx, input.scope);
  const sort = input.sort ?? 'published_at';
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  const db = createSupabaseServer();

  let query = db
    .from('kefy_scheduled_posts')
    .select(`
      id,
      published_at,
      zernio_post_id,
      kefy_social_accounts!inner ( platform, brand_id ),
      kefy_content_items!inner ( id, channel, body, image_url ),
      kefy_post_metrics ( id, measured_at, impressions, reach, likes, comments, shares, clicks, saves, engagement_rate )
    `, { count: 'exact' })
    .eq('org_id', ctx.auth.orgId)
    .eq('status', 'published')
    .gte('published_at', from)
    .lte('published_at', to)
    .order('published_at', { ascending: false });

  if (input.platform) query = query.eq('kefy_social_accounts.platform', input.platform);
  if (scope === 'brand') query = query.eq('kefy_social_accounts.brand_id', ctx.brandId);

  // Por fecha se pagina en la base de datos. Por métricas hay que ver la última
  // medición de cada publicación antes de ordenar: se trae una ventana acotada.
  const offset = (page - 1) * limit;
  query = sort === 'published_at'
    ? query.range(offset, offset + limit - 1)
    : query.range(0, MAX_SORT_WINDOW - 1);

  const { data: posts, error, count } = await query;

  if (error) {
    reportError(new Error(error.message), {
      route: 'lib/services/analytics', service: 'supabase', auth: ctx.auth, extra: { op: 'posts' },
    });
    throw new ServiceError('unavailable', 500, 'Failed to fetch post analytics').markReported();
  }

  type MetricRow = {
    id: string;
    measured_at: string;
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
    saves: number;
    engagement_rate: string | number | null;
  };
  type Content = { id: string; channel: string; body: string; image_url: string | null };

  let items: PostPerformanceItem[] = (posts ?? []).map((post) => {
    const snapshots: MetricRow[] = Array.isArray(post.kefy_post_metrics)
      ? (post.kefy_post_metrics as MetricRow[])
      : [];

    const latest = [...snapshots].sort(
      (a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime(),
    )[0] ?? null;

    const content = one(post.kefy_content_items as unknown as Content | Content[] | null);
    const account = one(post.kefy_social_accounts as unknown as { platform: string } | { platform: string }[] | null);

    return {
      scheduled_post_id: post.id,
      platform:          account?.platform ?? null,
      published_at:      post.published_at,
      zernio_post_id:    post.zernio_post_id,
      content: {
        id:           content?.id ?? null,
        channel:      content?.channel ?? null,
        body_preview: (content?.body ?? '').slice(0, 120),
        has_image:    Boolean(content?.image_url),
      },
      latest_metrics: latest
        ? {
            measured_at:     latest.measured_at,
            impressions:     latest.impressions,
            reach:           latest.reach,
            likes:           latest.likes,
            comments:        latest.comments,
            shares:          latest.shares,
            clicks:          latest.clicks,
            saves:           latest.saves,
            engagement_rate: Number(latest.engagement_rate ?? 0),
          }
        : null,
      snapshots_count: snapshots.length,
    };
  });

  if (sort !== 'published_at') {
    const value = (i: PostPerformanceItem): number =>
      sort === 'impressions' ? i.latest_metrics?.impressions ?? -1 : i.latest_metrics?.engagement_rate ?? -1;
    items = items.sort((a, b) => value(b) - value(a)).slice(offset, offset + limit);
  }

  return {
    data:  items,
    total: count ?? items.length,
    page,
    limit,
  };
}

// ─── Sincronización de métricas ──────────────────────────────────────────────

const SYNC_CONCURRENCY = 5;

export interface SyncPostMetricsResult {
  status: number;
  body: {
    synced: number;
    failed: number;
    results: Array<{ scheduled_post_id: string; status: 'synced' | 'failed'; error?: string }>;
    /** Solo con skipFreshMinutes: publicaciones medidas hace poco que no se volvieron a pedir. */
    skipped?: number;
  };
}

/**
 * Pide a Zernio las métricas de las publicaciones publicadas y guarda una
 * nueva medición por cada una. La ruta sincroniza todo (o los ids que pida);
 * la herramienta acota con `limit` y se salta las medidas hace poco.
 *
 * Estado 502 si todas fallaron, 200 en cualquier otro caso (como la ruta).
 */
export async function syncPostMetrics(
  ctx: ServiceContext,
  input: { ids?: string[] | null; limit?: number; skipFreshMinutes?: number } = {},
): Promise<SyncPostMetricsResult> {
  const db = createSupabaseServer();
  const strict = ctx.brandScope === 'strict';

  let query = db
    .from('kefy_scheduled_posts')
    .select(
      strict
        ? 'id, zernio_post_id, brand_id, published_at, kefy_social_accounts!inner ( brand_id )'
        : 'id, zernio_post_id, brand_id, published_at, kefy_social_accounts ( brand_id )',
    )
    .eq('org_id', ctx.auth.orgId)
    .eq('status', 'published')
    .not('zernio_post_id', 'is', null)
    .order('published_at', { ascending: false });

  if (input.ids && input.ids.length > 0) query = query.in('id', input.ids);
  if (strict) query = query.eq('kefy_social_accounts.brand_id', ctx.brandId);
  // Con skipFreshMinutes se descartan filas después: se trae algo de margen.
  if (input.limit !== undefined) {
    query = query.limit(input.skipFreshMinutes ? Math.max(input.limit * 4, input.limit) : input.limit);
  }

  const { data, error: listError } = await query;

  if (listError) {
    reportError(new Error(listError.message), {
      route: 'lib/services/analytics', service: 'supabase', auth: ctx.auth, extra: { op: 'sync-list' },
    });
    throw new ServiceError('unavailable', 500, 'Failed to list posts').markReported();
  }

  type Candidate = {
    id: string;
    zernio_post_id: string | null;
    brand_id: string | null;
    kefy_social_accounts: { brand_id: string | null } | { brand_id: string | null }[] | null;
  };
  let posts = (data ?? []) as unknown as Candidate[];
  let skipped: number | undefined;

  // Se salta lo medido en los últimos N minutos: una consulta con todas las
  // mediciones recientes de los candidatos.
  if (input.skipFreshMinutes && posts.length > 0) {
    const cutoff = new Date(Date.now() - input.skipFreshMinutes * 60_000).toISOString();
    const { data: fresh, error: freshError } = await db
      .from('kefy_post_metrics')
      .select('scheduled_post_id, measured_at')
      .eq('org_id', ctx.auth.orgId)
      .in('scheduled_post_id', posts.map((p) => p.id))
      .gte('measured_at', cutoff);

    if (freshError) {
      // No bloquea: en el peor caso se vuelve a medir algo reciente.
      reportError(new Error(freshError.message), {
        route: 'lib/services/analytics', service: 'supabase', auth: ctx.auth, extra: { op: 'sync-fresh' },
      });
    } else {
      const freshIds = new Set((fresh ?? []).map((m) => m.scheduled_post_id as string));
      const before = posts.length;
      posts = posts.filter((p) => !freshIds.has(p.id));
      skipped = before - posts.length;
    }
  }
  if (input.limit !== undefined) posts = posts.slice(0, input.limit);

  if (posts.length === 0) {
    return {
      status: 200,
      body: { synced: 0, failed: 0, results: [], ...(skipped !== undefined ? { skipped } : {}) },
    };
  }

  const now = new Date().toISOString();
  const limiter = pLimit(SYNC_CONCURRENCY);

  // Resultados en el mismo orden que las publicaciones, aunque terminen en otro.
  const results = await Promise.all(
    posts.map((post) =>
      limiter.run(async (): Promise<SyncPostMetricsResult['body']['results'][number]> => {
        try {
          const analytics = await getPostAnalytics(post.zernio_post_id!);

          const { error: insertError } = await db.from('kefy_post_metrics').insert({
            org_id:            ctx.auth.orgId,
            brand_id:          one(post.kefy_social_accounts)?.brand_id ?? post.brand_id ?? null,
            scheduled_post_id: post.id,
            measured_at:       now,
            impressions:       analytics.impressions ?? 0,
            reach:             analytics.reach       ?? 0,
            likes:             analytics.likes       ?? 0,
            comments:          analytics.comments    ?? 0,
            shares:            analytics.shares      ?? 0,
            clicks:            analytics.clicks      ?? 0,
            saves:             analytics.saves       ?? 0,
          });

          if (insertError) throw new Error(insertError.message);

          return { scheduled_post_id: post.id, status: 'synced' };
        } catch (err) {
          // 202 = Zernio aún está calculando las métricas: no es un fallo real.
          const isPending = err instanceof ZernioError && err.statusCode === 202;
          const message = isPending ? 'Analytics pending' : (err instanceof Error ? err.message : 'Unknown error');
          if (!isPending) console.warn(`Metrics sync failed for post ${post.id}:`, message);
          return { scheduled_post_id: post.id, status: 'failed', error: message };
        }
      }),
    ),
  );

  const synced = results.filter((r) => r.status === 'synced').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  return {
    status: failed > 0 && synced === 0 ? 502 : 200,
    body: { synced, failed, results, ...(skipped !== undefined ? { skipped } : {}) },
  };
}
