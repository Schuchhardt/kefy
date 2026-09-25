// ─── Propiedad de los recursos ────────────────────────────────────────────────
//
// createSupabaseServer() es un cliente service-role sin RLS: si una consulta no
// filtra por org_id, lee datos de otras organizaciones. Estos helpers son el
// único sitio donde los servicios cargan un recurso por id, y siempre filtran
// por org_id. Con brandScope 'strict' (herramientas del asistente, MCP, API)
// además exigen que el recurso sea de la marca del contexto.
//
// Un recurso que no existe o no es del llamador es el mismo 404: no se revela
// que existe en otra organización o marca.

import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError } from '@/lib/services/errors';

type Row = Record<string, unknown>;

function notFound(message: string): ServiceError {
  return new ServiceError('not_found', 404, message);
}

/**
 * Carga un contenido de kefy_content_items. `select` debe incluir las columnas
 * que el llamador necesite; el mensaje 404 por defecto es el de
 * /api/content/[itemId].
 */
export async function loadOwnedItem<T extends Row = Row>(
  ctx: ServiceContext,
  itemId: string,
  select = '*',
  notFoundMessage = 'Not found',
): Promise<T> {
  const db = createSupabaseServer();
  let q = db
    .from('kefy_content_items')
    .select(select)
    .eq('id', itemId)
    .eq('org_id', ctx.auth.orgId);
  if (ctx.brandScope === 'strict') q = q.eq('brand_id', ctx.brandId);

  const { data } = await q.maybeSingle();
  if (!data) throw notFound(notFoundMessage);
  return data as unknown as T;
}

/** Carga una cuenta social. `activeOnly` exige status 'active'. */
export async function loadOwnedAccount<T extends Row = Row>(
  ctx: ServiceContext,
  accountId: string,
  opts: { activeOnly?: boolean; select?: string; notFoundMessage?: string } = {},
): Promise<T> {
  const db = createSupabaseServer();
  let q = db
    .from('kefy_social_accounts')
    .select(opts.select ?? '*')
    .eq('id', accountId)
    .eq('org_id', ctx.auth.orgId);
  if (opts.activeOnly) q = q.eq('status', 'active');
  if (ctx.brandScope === 'strict') q = q.eq('brand_id', ctx.brandId);

  const { data } = await q.maybeSingle();
  if (!data) {
    throw notFound(opts.notFoundMessage ?? (opts.activeOnly ? 'Account not found or inactive' : 'Account not found'));
  }
  return data as unknown as T;
}

/** Carga un comentario de kefy_comments. */
export async function loadOwnedComment<T extends Row = Row>(
  ctx: ServiceContext,
  commentId: string,
  select = '*',
): Promise<T> {
  const db = createSupabaseServer();
  let q = db
    .from('kefy_comments')
    .select(select)
    .eq('id', commentId)
    .eq('org_id', ctx.auth.orgId);
  if (ctx.brandScope === 'strict') q = q.eq('brand_id', ctx.brandId);

  const { data } = await q.maybeSingle();
  if (!data) throw notFound('Comment not found');
  return data as unknown as T;
}

/**
 * Carga una publicación programada con el brand_id de su contenido. En modo
 * 'strict' se acepta la fila si su brand_id es el del contexto, o si es una
 * fila antigua sin brand_id cuyo contenido sí es de la marca.
 */
export async function loadOwnedScheduledPost<T extends Row = Row>(
  ctx: ServiceContext,
  postId: string,
): Promise<T & { brand_id: string | null; kefy_content_items: { brand_id: string | null } | null }> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_scheduled_posts')
    .select('*, kefy_content_items(brand_id)')
    .eq('id', postId)
    .eq('org_id', ctx.auth.orgId)
    .maybeSingle();

  if (error) {
    reportError(new Error(error.message), {
      route: 'lib/services/ownership', service: 'supabase', auth: ctx.auth, extra: { postId },
    });
    throw new ServiceError('unavailable', 500, 'Failed to fetch post').markReported();
  }
  if (!data) throw notFound('Scheduled post not found');

  const row = data as unknown as T & {
    brand_id: string | null;
    kefy_content_items: { brand_id: string | null } | { brand_id: string | null }[] | null;
  };
  // PostgREST puede devolver la relación como objeto o como array de uno.
  const rel = Array.isArray(row.kefy_content_items) ? row.kefy_content_items[0] ?? null : row.kefy_content_items;

  if (ctx.brandScope === 'strict') {
    const owned = row.brand_id
      ? row.brand_id === ctx.brandId
      : rel?.brand_id === ctx.brandId;
    if (!owned) throw notFound('Scheduled post not found');
  }

  return { ...row, kefy_content_items: rel } as T & {
    brand_id: string | null;
    kefy_content_items: { brand_id: string | null } | null;
  };
}
