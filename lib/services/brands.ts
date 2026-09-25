// ─── Servicio: marcas ─────────────────────────────────────────────────────────
//
// Listado de GET /api/brands, compartido con get_workspace_context. Nunca
// devuelve marcas archivadas.

import { createSupabaseServer } from '@/lib/supabase';
import { BRAND_LIMITS } from '@/lib/brands';
import { reportError } from '@/lib/observability';
import type { Brand } from '@/types/brands';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError } from '@/lib/services/errors';

export type BrandListItem = Pick<
  Brand, 'id' | 'org_id' | 'name' | 'slug' | 'avatar_url' | 'archived' | 'created_at' | 'updated_at'
> & { kit_logo_url: string | null };

export interface BrandList {
  brands: BrandListItem[];
  count: number;
  limit: number;
  canCreate: boolean;
}

/**
 * Marcas no archivadas de la organización, con el logo de su Brand Kit.
 *
 * `onlyBrandId` limita el listado a esa marca: una API key atada a una marca
 * no ve las demás. `count`/`canCreate` siguen reflejando la organización
 * entera solo cuando no se filtra.
 */
export async function listBrands(
  ctx: ServiceContext,
  opts: { onlyBrandId?: string | null } = {},
): Promise<BrandList> {
  const db = createSupabaseServer();

  let q = db
    .from('kefy_brands')
    .select('id, org_id, name, slug, avatar_url, archived, created_at, updated_at')
    .eq('org_id', ctx.auth.orgId)
    .eq('archived', false);
  if (opts.onlyBrandId) q = q.eq('id', opts.onlyBrandId);

  const { data: brands, error } = await q.order('created_at', { ascending: true });

  if (error) {
    reportError(new Error(error.message), { route: 'lib/services/brands', service: 'supabase', auth: ctx.auth });
    throw new ServiceError('unavailable', 500, 'Failed to fetch brands').markReported();
  }

  const rows = (brands ?? []) as Omit<BrandListItem, 'kit_logo_url'>[];

  // Logo del Brand Kit de cada marca, para que el selector pueda usarlo cuando
  // la marca no tiene una imagen propia. Cada marca ya subió su logo al definir
  // su identidad: pedir la misma imagen otra vez solo para el selector sería
  // trabajo repetido para el usuario.
  const kitLogos = new Map<string, string>();
  if (rows.length > 0) {
    const { data: kits } = await db
      .from('kefy_brand_kits')
      .select('brand_id, logo_url')
      .in('brand_id', rows.map((b) => b.id));

    for (const kit of (kits ?? []) as Array<{ brand_id: string | null; logo_url: string | null }>) {
      if (kit.brand_id && kit.logo_url) kitLogos.set(kit.brand_id, kit.logo_url);
    }
  }

  const limit = BRAND_LIMITS[ctx.auth.plan] ?? 1;

  return {
    brands: rows.map((b) => ({ ...b, kit_logo_url: kitLogos.get(b.id) ?? null })),
    count: rows.length,
    limit,
    canCreate: rows.length < limit,
  };
}
