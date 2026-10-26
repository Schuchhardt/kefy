// ─── Servicio: marcas ─────────────────────────────────────────────────────────
//
// Listado de GET /api/brands, compartido con get_workspace_context (nunca
// devuelve marcas archivadas), y alta, archivo y avatar de una marca.

import { createSupabaseServer } from '@/lib/supabase';
import { BRAND_LIMITS, slugifyBrand } from '@/lib/brands';
import { uploadBase64Image } from '@/lib/storage';
import { reportError } from '@/lib/observability';
import type { Brand } from '@/types/brands';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';

const ROUTE = 'lib/services/brands';

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
    reportError(new Error(error.message), { route: ROUTE, service: 'supabase', auth: ctx.auth });
    throw new ServiceError('unavailable', 500, 'Failed to fetch brands').markReported();
  }

  const rows = (brands ?? []) as Omit<BrandListItem, 'kit_logo_url'>[];

  // El plan sale de la organización y no de ctx.auth: el JWT puede tener hasta
  // 23h de vida (lib/auth-context.tsx) y quedar desactualizado si el plan
  // cambió — por Stripe o a mano en la base. Con el JWT viejo, canCreate podía
  // decir que no se podía crear (o al revés) aunque el plan ya hubiera cambiado.
  const { data: org } = await db
    .from('kefy_organizations')
    .select('plan')
    .eq('id', ctx.auth.orgId)
    .maybeSingle();
  const plan = (org?.plan as string | undefined) ?? ctx.auth.plan;

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

  const limit = BRAND_LIMITS[plan] ?? 1;

  return {
    brands: rows.map((b) => ({ ...b, kit_logo_url: kitLogos.get(b.id) ?? null })),
    count: rows.length,
    limit,
    canCreate: rows.length < limit,
  };
}

// ─── Crear, archivar y avatar ─────────────────────────────────────────────────
//
// Lógica de POST /api/brands, DELETE /api/brands/[id] y /api/brands/[id]/avatar,
// compartida con create_brand, archive_brand y set_brand_avatar. El control de
// rol vive en la ruta y en `roles` de la herramienta.

const BRAND_SELECT = 'id, org_id, name, slug, avatar_url, archived, created_at, updated_at';

/**
 * Lado del avatar tras normalizar. El selector lo pinta a 22–28 px, y en
 * pantallas densas se ve al doble: 256 basta de sobra y evita guardar la foto
 * original de varios megas para mostrarla del tamaño de una uña.
 */
const AVATAR_SIZE = 256;

/**
 * Crea una marca en la organización respetando el tope del plan y le crea un
 * Brand Kit vacío. No usa ctx.brandId: la marca nueva es otra.
 */
export async function createBrand(ctx: ServiceContext, input: { name: string }): Promise<{ brand: Brand }> {
  const name = input.name.trim().slice(0, 100);
  if (!name) throw new ServiceError('invalid_input', 422, 'name is required');

  const db = createSupabaseServer();

  // El plan sale de la organización, no del JWT: el token puede tener hasta
  // 23h de vida (ver lib/auth-context.tsx) y quedar desactualizado si el plan
  // cambió — por Stripe o a mano en la base para una cuenta de cortesía.
  const { data: org } = await db
    .from('kefy_organizations')
    .select('plan')
    .eq('id', ctx.auth.orgId)
    .maybeSingle();

  const limit = BRAND_LIMITS[(org?.plan as string | undefined) ?? ctx.auth.plan] ?? 1;
  const slug = `${slugifyBrand(name)}-${Math.random().toString(36).slice(2, 7)}`;

  // El chequeo del tope y el INSERT van en la misma función SQL (bloquea la
  // fila de la organización mientras dura): dos altas simultáneas al borde del
  // límite no pueden colar las dos, igual que kefy_credits_consume evita el
  // mismo problema con los créditos.
  const { data: rpcData, error: brandError } = await db
    .rpc('kefy_brand_create', { p_org_id: ctx.auth.orgId, p_name: name, p_slug: slug, p_limit: limit })
    .single();
  const brand = rpcData as unknown as Brand | null;

  if (brandError || !brand) {
    if (brandError?.message?.includes('BRAND_LIMIT_REACHED')) {
      throw new ServiceError(
        'forbidden',
        403,
        msg(ctx.language,
          `Tu plan permite hasta ${limit} marca(s). Mejora tu plan para añadir más.`,
          `Your plan allows up to ${limit} brand(s). Upgrade to add more.`),
        { error: `Your plan allows up to ${limit} brand(s). Upgrade to add more.`, limit },
      );
    }
    reportError(brandError ?? new Error('kefy_brand_create returned no row'), {
      route: ROUTE, service: 'supabase', auth: ctx.auth,
    });
    throw new ServiceError('unavailable', 500, 'Failed to create brand').markReported();
  }

  // Brand Kit vacío. No es fatal: getOrCreateBrandKit lo crea en el primer acceso.
  const { error: kitError } = await db
    .from('kefy_brand_kits')
    .insert({ org_id: ctx.auth.orgId, brand_id: brand.id, name });
  if (kitError) {
    reportError(new Error(kitError.message), { route: ROUTE, service: 'supabase', auth: ctx.auth, extra: { brandId: brand.id } });
  }

  return { brand };
}

/**
 * Archiva (soft delete) una marca de la organización. No se puede archivar la
 * única marca activa. Solo el dueño (ruta y herramienta).
 */
export async function archiveBrand(ctx: ServiceContext, brandId: string): Promise<void> {
  const db = createSupabaseServer();

  const { data: brand } = await db
    .from('kefy_brands')
    .select('id, archived')
    .eq('id', brandId)
    .eq('org_id', ctx.auth.orgId)
    .maybeSingle();
  if (!brand) throw new ServiceError('not_found', 404, 'Brand not found');
  if (brand.archived) throw new ServiceError('conflict', 409, 'Brand is already archived');

  const { count } = await db
    .from('kefy_brands')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', ctx.auth.orgId)
    .eq('archived', false);

  if ((count ?? 0) <= 1) {
    throw new ServiceError('conflict', 409, 'Cannot archive the only active brand');
  }

  const { error } = await db
    .from('kefy_brands')
    .update({ archived: true })
    .eq('id', brandId)
    .eq('org_id', ctx.auth.orgId);
  if (error) {
    reportError(new Error(error.message), { route: ROUTE, service: 'supabase', auth: ctx.auth, extra: { brandId } });
    throw new ServiceError('unavailable', 500, 'Failed to archive brand').markReported();
  }
}

async function updateAvatar(ctx: ServiceContext, brandId: string, avatarUrl: string | null, failMessage: string) {
  const db = createSupabaseServer();
  // El filtro por org_id es lo que impide cambiarle el avatar a la marca de
  // otra organización conociendo su id.
  const { data: updated, error } = await db
    .from('kefy_brands')
    .update({ avatar_url: avatarUrl })
    .eq('id', brandId)
    .eq('org_id', ctx.auth.orgId)
    .select(BRAND_SELECT)
    .maybeSingle();

  if (error) {
    reportError(new Error(error.message), { route: ROUTE, service: 'supabase', auth: ctx.auth, extra: { brandId } });
    throw new ServiceError('unavailable', 500, failMessage).markReported();
  }
  if (!updated) throw new ServiceError('not_found', 404, 'Marca no encontrada');
  return { brand: updated as BrandListItemBase };
}

type BrandListItemBase = Omit<BrandListItem, 'kit_logo_url'>;

/**
 * Normaliza la imagen a un cuadrado WebP de 256 px, la sube y la deja como
 * avatar de la marca. Es lo que la identifica en el selector.
 */
export async function setBrandAvatar(
  ctx: ServiceContext,
  brandId: string,
  image: Buffer,
): Promise<{ brand: BrandListItemBase }> {
  const db = createSupabaseServer();
  const { data: brand } = await db
    .from('kefy_brands')
    .select('id')
    .eq('id', brandId)
    .eq('org_id', ctx.auth.orgId)
    .maybeSingle();
  if (!brand) throw new ServiceError('not_found', 404, 'Marca no encontrada');

  let publicUrl: string;
  try {
    // Se normaliza a un cuadrado: el selector la pinta redondeada y una imagen
    // muy alargada saldría recortada de forma impredecible. `rotate()` aplica
    // la orientación EXIF antes de recortar — las fotos de móvil vienen
    // giradas con un tag y si no, el recorte se calcula sobre el eje erróneo.
    const { default: sharp } = await import('sharp');
    const normalized = await sharp(image)
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: 88 })
      .toBuffer();

    publicUrl = await uploadBase64Image(
      normalized.toString('base64'),
      ctx.auth.orgId,
      `brand-${brandId}-${Date.now()}.webp`,
    );
  } catch (err) {
    reportError(err, { route: ROUTE, auth: ctx.auth, extra: { brandId } });
    throw new ServiceError('unavailable', 500, 'No se pudo procesar la imagen').markReported();
  }

  return updateAvatar(ctx, brandId, publicUrl, 'No se pudo guardar la imagen');
}

/**
 * Quita la imagen. La marca vuelve a mostrarse con el logo de su Brand Kit, y
 * si tampoco lo tiene, con su inicial.
 */
export async function clearBrandAvatar(ctx: ServiceContext, brandId: string): Promise<{ brand: BrandListItemBase }> {
  return updateAvatar(ctx, brandId, null, 'No se pudo quitar la imagen');
}
