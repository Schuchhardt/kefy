// ─── Servicio: cuentas sociales ──────────────────────────────────────────────
//
// Lógica de GET /api/social/accounts y DELETE /api/social/accounts/[id],
// compartida con las herramientas list_social_accounts y
// disconnect_social_account del asistente. Las cuentas siempre se listan por
// marca (ctx.brandId), también desde la ruta: es lo que hace hoy.

import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError } from '@/lib/services/errors';
import { loadOwnedAccount } from '@/lib/services/ownership';
import { detachAccountFromRules } from '@/lib/services/social-integrity';

/** Columnas que ve la UI (las mismas que devolvía la ruta). */
const ROUTE_SELECT =
  'id, platform, external_id, username, avatar_url, zernio_account_id, status, status_reason, token_expires_at, created_at';

/**
 * Columnas para las herramientas: nunca tokens, zernio_account_id ni
 * external_id. Solo lo necesario para elegir a qué cuenta publicar.
 */
const TOOL_SELECT = 'id, platform, username, avatar_url, status, status_reason';

export interface ToolSocialAccount {
  id: string;
  platform: string;
  username: string | null;
  avatar_url: string | null;
  status: string;
  /** Por qué se revocó al compararla con Zernio; hay que reconectarla. */
  status_reason: string | null;
}

/** Una fila revocada por la comparación no se muestra si ya se reconectó esa cuenta. */
function withoutSuperseded(rows: Array<Record<string, unknown>>) {
  const key = (r: Record<string, unknown>) => `${r.platform}:${String(r.username ?? '').toLowerCase()}`;
  const active = new Set(rows.filter((r) => r.status === 'active').map(key));
  return rows.filter((r) => !r.status_reason || !active.has(key(r)));
}

export async function listSocialAccounts(
  ctx: ServiceContext,
  opts: { forTool?: boolean } = {},
): Promise<{ accounts: Record<string, unknown>[] }> {
  const db = createSupabaseServer();

  const { data: accounts, error } = await db
    .from('kefy_social_accounts')
    .select(opts.forTool ? TOOL_SELECT : ROUTE_SELECT)
    .eq('org_id', ctx.auth.orgId)
    .eq('brand_id', ctx.brandId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('social accounts GET error:', error.message);
    throw new ServiceError('unavailable', 500, 'Failed to fetch accounts');
  }

  return { accounts: withoutSuperseded((accounts ?? []) as unknown as Record<string, unknown>[]) };
}

// ─── Desconectar ──────────────────────────────────────────────────────────────

export interface DisconnectResult {
  id: string;
  platform: string | null;
  username: string | null;
  /** Publicaciones pendientes o programadas que se borraron con la cuenta. */
  scheduled_posts_removed: number;
  /** Reglas de autopilot de las que se quitó la cuenta. */
  autopilot_rules_updated: number;
}

/**
 * Desconecta una cuenta: la revoca en Zernio (best-effort: si Zernio falla se
 * reporta y se sigue) y borra la fila. Las claves foráneas borran en cascada
 * sus publicaciones (también el historial de publicadas), DMs, comentarios y
 * snapshots de seguidores en Kefy. Las reglas de autopilot guardan los ids en
 * un array sin clave foránea: se quita la cuenta de ellas, y la recuperan si se
 * reconecta. Si otra fila usa el mismo id de Zernio no se revoca allí: se le
 * cortaría la cuenta a esa otra marca.
 */
export async function disconnectSocialAccount(ctx: ServiceContext, accountId: string): Promise<DisconnectResult> {
  const db = createSupabaseServer();
  const account = await loadOwnedAccount<{
    id: string; brand_id: string | null; platform: string | null; username: string | null; zernio_account_id: string | null;
  }>(ctx, accountId, { select: 'id, brand_id, platform, username, zernio_account_id' });

  const { count: pending } = await db
    .from('kefy_scheduled_posts')
    .select('id', { count: 'exact', head: true })
    .eq('social_account_id', account.id)
    .eq('org_id', ctx.auth.orgId)
    .in('status', ['pending', 'scheduled']);

  const { count: sharing } = account.zernio_account_id
    ? await db
      .from('kefy_social_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('zernio_account_id', account.zernio_account_id)
      .neq('id', account.id)
    : { count: 0 };

  if (account.zernio_account_id && (sharing ?? 0) === 0) {
    try {
      const { disconnectAccount } = await import('@/lib/zernio');
      await disconnectAccount(account.zernio_account_id);
    } catch (err) {
      reportError(err, {
        route: 'lib/services/social', service: 'zernio', auth: ctx.auth, extra: { accountId: account.id },
      });
    }
  }

  const { error: deleteError } = await db
    .from('kefy_social_accounts')
    .delete()
    .eq('id', account.id)
    .eq('org_id', ctx.auth.orgId);

  if (deleteError) {
    reportError(new Error(deleteError.message), { route: 'lib/services/social', service: 'supabase', auth: ctx.auth });
    throw new ServiceError('unavailable', 500, 'Failed to disconnect account').markReported();
  }

  const rulesUpdated = await detachAccountFromRules(db, { ...account, org_id: ctx.auth.orgId }, ctx.language);

  return {
    id: account.id,
    platform: account.platform,
    username: account.username,
    scheduled_posts_removed: pending ?? 0,
    autopilot_rules_updated: rulesUpdated,
  };
}
