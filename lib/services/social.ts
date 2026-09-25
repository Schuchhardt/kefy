// ─── Servicio: cuentas sociales ──────────────────────────────────────────────
//
// Lógica de GET /api/social/accounts, compartida con la herramienta
// list_social_accounts del asistente. Las cuentas siempre se listan por marca
// (ctx.brandId), también desde la ruta: es lo que hace hoy.

import { createSupabaseServer } from '@/lib/supabase';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError } from '@/lib/services/errors';

/** Columnas que ve la UI (las mismas que devolvía la ruta). */
const ROUTE_SELECT =
  'id, platform, external_id, username, avatar_url, zernio_account_id, status, token_expires_at, created_at';

/**
 * Columnas para las herramientas: nunca tokens, zernio_account_id ni
 * external_id. Solo lo necesario para elegir a qué cuenta publicar.
 */
const TOOL_SELECT = 'id, platform, username, avatar_url, status';

export interface ToolSocialAccount {
  id: string;
  platform: string;
  username: string | null;
  avatar_url: string | null;
  status: string;
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

  return { accounts: (accounts ?? []) as unknown as Record<string, unknown>[] };
}
