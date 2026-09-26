// ─── Servicio: Brand Kit ──────────────────────────────────────────────────────
//
// Lógica de GET/PATCH /api/brand-kit, compartida con las herramientas del
// asistente (get_brand_profile, update_brand_profile).
//
// El kit se lee SIEMPRE por brand_id con getBrandKitForBrand. Antes varias rutas
// hacían `.eq('org_id').maybeSingle()`, que con más de una marca devuelve error
// (varias filas) y deja la generación sin contexto de marca.

import { createSupabaseServer } from '@/lib/supabase';
import { normalizeWebsiteUrl, validateBrandKitUpdate } from '@/lib/brand-kit';
import { getActiveBrandById } from '@/lib/brands';
import { reportError } from '@/lib/observability';
import type { BrandKit, BrandKitUpdateInput } from '@/types/brand-kit';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError } from '@/lib/services/errors';

type Db = ReturnType<typeof createSupabaseServer>;

const ROUTE = 'lib/services/brand-kit';

/**
 * Kit de una marca. Devuelve el resultado de la consulta (`{ data, error }`)
 * para que el llamador decida si un error de base es fatal o no.
 */
export function getBrandKitForBrand(db: Db, brandId: string) {
  return db
    .from('kefy_brand_kits')
    .select('*')
    .eq('brand_id', brandId)
    .maybeSingle();
}

/** Nombre de la marca del contexto, para crear el kit por defecto. */
async function brandNameFor(ctx: ServiceContext, brandName?: string): Promise<string> {
  if (brandName) return brandName;
  const brand = await getActiveBrandById(ctx.brandId, ctx.auth.orgId);
  if (!brand) throw new ServiceError('not_found', 404, 'No brand found');
  return brand.name;
}

/**
 * Kit de la marca del contexto; si todavía no existe, crea uno por defecto.
 * `created` indica si se acaba de crear (la ruta responde 201).
 *
 * `brandName` evita una consulta extra cuando el llamador ya tiene la marca.
 */
export async function getOrCreateBrandKit(
  ctx: ServiceContext,
  opts: { brandName?: string } = {},
): Promise<{ kit: BrandKit; created: boolean }> {
  const db = createSupabaseServer();

  const { data: kit, error } = await getBrandKitForBrand(db, ctx.brandId);

  if (error) {
    reportError(new Error(error.message), { route: ROUTE, service: 'supabase', auth: ctx.auth });
    throw new ServiceError('unavailable', 500, 'Failed to fetch brand kit').markReported();
  }

  if (kit) return { kit: kit as BrandKit, created: false };

  // Primer acceso: se crea el kit por defecto con el nombre de la marca.
  const name = await brandNameFor(ctx, opts.brandName);
  const { data: newKit, error: createError } = await db
    .from('kefy_brand_kits')
    .insert({ org_id: ctx.auth.orgId, brand_id: ctx.brandId, name })
    .select('*')
    .single();

  if (createError || !newKit) {
    reportError(new Error(createError?.message ?? 'brand kit insert returned no row'), {
      route: ROUTE, service: 'supabase', auth: ctx.auth,
    });
    throw new ServiceError('unavailable', 500, 'Failed to initialize brand kit').markReported();
  }

  return { kit: newKit as BrandKit, created: true };
}

// ─── Actualización ────────────────────────────────────────────────────────────

/** Campos que se pueden actualizar. Cualquier otra clave del cuerpo se ignora. */
const ALLOWED_FIELDS: (keyof BrandKitUpdateInput)[] = [
  'name', 'tagline', 'industry', 'tone',
  'primary_color', 'secondary_color', 'accent_color',
  'font_heading', 'font_body', 'logo_url', 'notes',
  'website_url', 'social_urls', 'language', 'customer_locations',
  'uses_emojis', 'communication_style', 'mission',
  'company_size', 'differentiators', 'challenges',
  'niche', 'competitors', 'target_audience',
];

/**
 * Columnas NOT NULL del kit: un `null` en el cuerpo no puede llegar al UPDATE
 * (fallaría la restricción), así que se descarta la clave.
 */
const NOT_NULL_FIELDS = new Set<string>([
  'tone', 'customer_locations', 'differentiators', 'challenges',
  'competitors', 'language', 'social_urls',
]);

/**
 * Valida el cuerpo y construye el UPDATE con los campos permitidos. Lanza
 * 422 con el mismo mensaje que la ruta. La ruta la llama antes de resolver la
 * marca para conservar el orden de sus respuestas; updateBrandKit la vuelve a
 * aplicar (es idempotente) para que el camino de las herramientas también
 * valide.
 */
export function buildBrandKitUpdate(input: Record<string, unknown>): Record<string, unknown> {
  if (typeof input.website_url === 'string') {
    input.website_url = normalizeWebsiteUrl(input.website_url);
  }

  const validationError = validateBrandKitUpdate(input);
  if (validationError) throw new ServiceError('invalid_input', 422, validationError);

  const update: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (!(key in input)) continue;
    const value = input[key] ?? null;
    if (value === null && NOT_NULL_FIELDS.has(key)) continue;
    update[key] = value;
  }

  if (Object.keys(update).length === 0) {
    throw new ServiceError('invalid_input', 422, 'No valid fields to update');
  }
  return update;
}

/**
 * Actualiza (o crea) el kit de la marca del contexto.
 *
 * El nombre de `kefy_brands` (lo que muestra toda la navegación — switcher,
 * sidebar, avatar) nunca debe divergir del nombre del kit: por eso, cada vez
 * que `name` cambia, se sincroniza siempre a `kefy_brands`, tenga o no
 * `syncOrg`. Antes solo se sincronizaba con `syncOrg: true` (el wizard de
 * onboarding) — la página permanente de Brand (`/dashboard/brand/identity`)
 * no lo pasaba, así que corregir el nombre ahí guardaba el kit pero la
 * navegación seguía mostrando el nombre viejo (o uno mal extraído del sitio
 * web) para siempre, sin ningún otro lugar donde corregirlo.
 *
 * `syncOrg` renombra además la organización — pero solo cuando esta marca es,
 * en la práctica, la organización entera (0 o 1 marca). Antes renombraba la
 * organización sin condición, así que completar el wizard para una marca
 * nueva en una org multi-marca le cambiaba el nombre a toda la organización.
 * Toca datos de toda la organización, así que las herramientas lo rechazan
 * con una key atada a una marca antes de llegar aquí.
 *
 * El control de rol (owner/admin) vive en la ruta y en `roles` de la
 * herramienta.
 */
export async function updateBrandKit(
  ctx: ServiceContext,
  input: Record<string, unknown>,
  opts: { syncOrg?: boolean; brandName?: string } = {},
): Promise<{ kit: BrandKit }> {
  const update = buildBrandKitUpdate(input);
  const db = createSupabaseServer();

  if (typeof input.name === 'string' && input.name.trim()) {
    const syncedName = input.name.trim().slice(0, 100);

    const { error: brandUpdateError } = await db
      .from('kefy_brands')
      .update({ name: syncedName })
      .eq('id', ctx.brandId)
      .eq('org_id', ctx.auth.orgId);

    if (brandUpdateError) {
      reportError(new Error(brandUpdateError.message), {
        route: ROUTE, service: 'supabase', auth: ctx.auth,
      });
      throw new ServiceError('unavailable', 500, 'Failed to sync brand name').markReported();
    }

    if (opts.syncOrg) {
      const { count, error: countError } = await db
        .from('kefy_brands')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.auth.orgId)
        .eq('archived', false);

      if (countError) {
        reportError(new Error(countError.message), { route: ROUTE, service: 'supabase', auth: ctx.auth });
        throw new ServiceError('unavailable', 500, 'Failed to sync organization name').markReported();
      }

      if ((count ?? 0) <= 1) {
        const { error: orgUpdateError } = await db
          .from('kefy_organizations')
          .update({ name: syncedName })
          .eq('id', ctx.auth.orgId);

        if (orgUpdateError) {
          reportError(new Error(orgUpdateError.message), { route: ROUTE, service: 'supabase', auth: ctx.auth });
          throw new ServiceError('unavailable', 500, 'Failed to sync organization name').markReported();
        }
      }
    }
  }

  // Upsert: se actualiza si existe, se crea si no.
  const { data: existing } = await db
    .from('kefy_brand_kits')
    .select('id')
    .eq('brand_id', ctx.brandId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await db
      .from('kefy_brand_kits')
      .update(update)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error || !data) {
      reportError(new Error(error?.message ?? 'brand kit update returned no row'), {
        route: ROUTE, service: 'supabase', auth: ctx.auth,
      });
      throw new ServiceError('unavailable', 500, 'Failed to update brand kit').markReported();
    }
    return { kit: data as BrandKit };
  }

  const name = await brandNameFor(ctx, opts.brandName);
  const { data, error } = await db
    .from('kefy_brand_kits')
    .insert({ org_id: ctx.auth.orgId, brand_id: ctx.brandId, name, ...update })
    .select('*')
    .single();

  if (error || !data) {
    reportError(new Error(error?.message ?? 'brand kit insert returned no row'), {
      route: ROUTE, service: 'supabase', auth: ctx.auth,
    });
    throw new ServiceError('unavailable', 500, 'Failed to create brand kit').markReported();
  }
  return { kit: data as BrandKit };
}

// ─── Contexto de marca para los prompts ──────────────────────────────────────

export interface BrandPromptContext {
  brandName?: string;
  tagline?: string;
  tone: string[];
  extraCtx?: string;
}

/**
 * Lo que las generaciones de texto reciben de la marca. Es el mismo mapeo que
 * hacía /api/content/generate a mano; `brandName` es el respaldo cuando el kit
 * no existe o no tiene nombre.
 */
export function brandPromptContext(
  kit: Pick<BrandKit, 'name' | 'tagline' | 'tone' | 'industry'> | null | undefined,
  brandName?: string,
): BrandPromptContext {
  return {
    brandName: kit?.name ?? brandName ?? undefined,
    tagline: kit?.tagline ?? undefined,
    tone: kit?.tone ?? [],
    extraCtx: kit?.industry ? `Industry: ${kit.industry}.` : undefined,
  };
}
