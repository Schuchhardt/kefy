// ─── Servicio: assets del Brand Kit ───────────────────────────────────────────
//
// Biblioteca de logos, imágenes e íconos de una marca (kefy_brand_assets, bucket
// kefy-brand-assets). La comparten /api/brand-kit/assets/** y las herramientas
// list_brand_assets, add_brand_asset, update_brand_asset, create_brand_icon y
// delete_brand_asset.
//
// Una marca puede tener varios logos e íconos. Al subir uno (type 'logo',
// 'icon' o 'auto') se mide con sharp y se guarda su forma (variant) y el fondo
// para el que sirve (background); con 'auto' también se decide si es logo o
// ícono. No hay IA ni créditos: es una propuesta que la persona corrige con
// updateBrandAsset. createIconFromAsset recorta un ícono cuadrado de un logo.
// importBrandLogos trae los logos que encontró la lectura de la web
// (brand-enrich): recuerda la URL de origen para no duplicarlos.
//
// Todo va por el kit de la marca del contexto (ctx.brandId). Antes el listado
// buscaba el kit con `.eq('org_id').maybeSingle()`, que con más de una marca
// devuelve error y dejaba la biblioteca vacía.
//
// El control de rol (owner/admin para subir y borrar) vive en la ruta y en
// `roles` de la herramienta.

import { createSupabaseServer } from '@/lib/supabase';
import { STORAGE_BUCKET } from '@/lib/brand-kit';
import { reportError } from '@/lib/observability';
import type { AssetType, BrandAsset, LogoBackground, LogoVariant } from '@/types/brand-kit';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';
import { getOrCreateBrandKit } from '@/lib/services/brand-kit';
import { downloadExternalMedia } from '@/lib/services/media-ingest';
import { LOGO_BACKGROUNDS, LOGO_VARIANTS, validateCropRect, type CropRect } from '@/lib/brand-logos';
import { CropError, analyzeLogo, cropIcon } from '@/lib/brand-logo-image';

const ROUTE = 'lib/services/brand-assets';

export const ASSET_TYPES: readonly AssetType[] = ['logo', 'image', 'icon', 'other'];

/** Tipos que se miden al subir; 'auto' además decide entre logo e ícono. */
const MEASURED_TYPES = new Set<string>(['logo', 'icon', 'auto']);

/** Columnas que devuelven la ruta y las herramientas (sin storage_path). */
const ASSET_SELECT = 'id, type, label, public_url, file_size, mime_type, variant, background, width, height, source_asset_id, created_at';

export type BrandAssetView = Pick<
  BrandAsset,
  | 'id' | 'type' | 'label' | 'public_url' | 'file_size' | 'mime_type'
  | 'variant' | 'background' | 'width' | 'height' | 'source_asset_id' | 'created_at'
>;

function pick(row: Record<string, unknown>): BrandAssetView {
  return {
    id: row.id as string,
    type: row.type as AssetType,
    label: (row.label as string | null) ?? null,
    public_url: row.public_url as string,
    file_size: (row.file_size as number | null) ?? null,
    mime_type: (row.mime_type as string | null) ?? null,
    variant: (row.variant as LogoVariant | null) ?? null,
    background: (row.background as LogoBackground | null) ?? null,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    source_asset_id: (row.source_asset_id as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

function dbFailure(ctx: ServiceContext, message: string, error: { message: string }): ServiceError {
  reportError(new Error(error.message), { route: ROUTE, service: 'supabase', auth: ctx.auth });
  return new ServiceError('unavailable', 500, message).markReported();
}

/** Assets de la marca del contexto, del más nuevo al más viejo. */
export async function listBrandAssets(ctx: ServiceContext): Promise<{ assets: BrandAssetView[] }> {
  const db = createSupabaseServer();

  const { data: kit, error: kitError } = await db
    .from('kefy_brand_kits')
    .select('id')
    .eq('brand_id', ctx.brandId)
    .eq('org_id', ctx.auth.orgId)
    .maybeSingle();
  if (kitError) throw dbFailure(ctx, 'Failed to fetch assets', kitError);
  if (!kit) return { assets: [] };

  const { data, error } = await db
    .from('kefy_brand_assets')
    .select(ASSET_SELECT)
    .eq('brand_kit_id', kit.id)
    .eq('org_id', ctx.auth.orgId)
    .order('created_at', { ascending: false });
  if (error) throw dbFailure(ctx, 'Failed to fetch assets', error);

  return { assets: ((data ?? []) as Record<string, unknown>[]).map(pick) };
}

export interface UploadBrandAssetInput {
  buffer: Buffer;
  contentType: string;
  /** Nombre original del archivo (solo para el path de Storage). */
  filename: string;
  /** 'auto': Kefy decide entre logo e ícono según la forma. */
  type?: AssetType | 'auto';
  label?: string | null;
}

/**
 * Sube un archivo ya validado (tipo y tamaño) al bucket de la marca y lo
 * registra. Si el registro falla, se borra el archivo subido.
 */
export async function uploadBrandAsset(ctx: ServiceContext, input: UploadBrandAssetInput): Promise<{ asset: BrandAssetView }> {
  const { kit } = await getOrCreateBrandKit(ctx);
  return storeAsset(ctx, { brandId: ctx.brandId, kitId: kit.id }, input);
}

async function storeAsset(
  ctx: ServiceContext,
  target: { brandId: string; kitId: string },
  input: UploadBrandAssetInput & {
    sourceAssetId?: string;
    /** URL externa de la que se descargó. */
    sourceUrl?: string;
    /** Clasificación ya conocida (un ícono recortado): no se vuelve a medir. */
    known?: { variant: LogoVariant; background: LogoBackground | null; width: number; height: number };
  },
): Promise<{ asset: BrandAssetView }> {
  const db = createSupabaseServer();

  const requested = input.type;
  const analysis = !input.known && requested && MEASURED_TYPES.has(requested)
    ? await analyzeLogo(input.buffer, input.contentType)
    : null;

  let type: AssetType;
  if (requested === 'auto') type = analysis?.type ?? 'logo';
  else type = requested && ASSET_TYPES.includes(requested) ? requested : 'other';

  const measured = input.known ?? (analysis && {
    variant: analysis.variant, background: analysis.background, width: analysis.width, height: analysis.height,
  });

  const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 100) : null;

  // brandId/kitId/timestamp-filename
  const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'asset';
  const storagePath = `${target.brandId}/${target.kitId}/${Date.now()}-${safeFilename}`;

  const { error: uploadError } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, input.buffer, { contentType: input.contentType, upsert: false });
  if (uploadError) throw dbFailure(ctx, 'Failed to upload file', uploadError);

  const { data: { publicUrl } } = db.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

  const { data: asset, error } = await db
    .from('kefy_brand_assets')
    .insert({
      brand_kit_id: target.kitId,
      org_id:       ctx.auth.orgId,
      type,
      label,
      storage_path: storagePath,
      public_url:   publicUrl,
      file_size:    input.buffer.byteLength,
      mime_type:    input.contentType,
      variant:      measured?.variant ?? null,
      background:   measured?.background ?? null,
      width:        measured?.width ?? null,
      height:       measured?.height ?? null,
      source_asset_id: input.sourceAssetId ?? null,
      source_url:      input.sourceUrl ?? null,
    })
    .select(ASSET_SELECT)
    .single();

  if (error || !asset) {
    await db.storage.from(STORAGE_BUCKET).remove([storagePath]);
    throw dbFailure(ctx, 'Failed to save asset', error ?? { message: 'brand asset insert returned no row' });
  }

  return { asset: pick(asset as Record<string, unknown>) };
}

/**
 * Descarga una imagen externa (con las protecciones de media-ingest) y la
 * guarda en la biblioteca de la marca.
 */
export async function addBrandAssetFromUrl(
  ctx: ServiceContext,
  input: { url: string; type?: AssetType | 'auto'; label?: string | null },
): Promise<{ asset: BrandAssetView }> {
  const { kit } = await getOrCreateBrandKit(ctx);
  return downloadAndStore(ctx, kit.id, input);
}

async function downloadAndStore(
  ctx: ServiceContext,
  kitId: string,
  input: { url: string; type?: AssetType | 'auto'; label?: string | null },
): Promise<{ asset: BrandAssetView }> {
  // Un logo puede venir en SVG; una imagen cualquiera, no.
  const kind = input.type && MEASURED_TYPES.has(input.type) ? 'logo' : 'image';
  const { buffer, contentType, ext } = await downloadExternalMedia(ctx, input.url, kind);
  return storeAsset(ctx, { brandId: ctx.brandId, kitId }, {
    buffer,
    contentType,
    filename: `import.${ext}`,
    type: input.type,
    label: input.label,
    sourceUrl: input.url,
  });
}

/** Tope de logos por lectura de una web. */
const MAX_WEB_LOGOS = 6;

export interface ImportBrandLogosResult {
  /** Cada URL que quedó en la biblioteca, con su asset (nuevo o el que ya estaba). */
  imported: { url: string; asset: BrandAssetView; existing: boolean }[];
  /** URLs que no se pudieron traer (tipo no admitido, host caído…). */
  failed: string[];
}

/**
 * Guarda en la biblioteca los logos e íconos de una web (los que encontró
 * enrichBrandFromUrl), clasificados con 'auto'. Una URL que la marca ya
 * importó no se vuelve a descargar: se devuelve el asset que ya tiene. Que
 * una falle no detiene las demás.
 */
export async function importBrandLogos(
  ctx: ServiceContext,
  input: { logos: { url: string; label?: string | null }[] },
): Promise<ImportBrandLogosResult> {
  const seen = new Set<string>();
  const logos = input.logos.filter((l) => {
    if (typeof l?.url !== 'string' || !l.url.startsWith('https://') || seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  }).slice(0, MAX_WEB_LOGOS);
  if (logos.length === 0) return { imported: [], failed: [] };

  const { kit } = await getOrCreateBrandKit(ctx);
  const db = createSupabaseServer();
  const { data: existing, error } = await db
    .from('kefy_brand_assets')
    .select(`${ASSET_SELECT}, source_url`)
    .eq('brand_kit_id', kit.id)
    .eq('org_id', ctx.auth.orgId)
    .in('source_url', logos.map((l) => l.url));
  if (error) throw dbFailure(ctx, 'Failed to fetch assets', error);
  const byUrl = new Map(((existing ?? []) as Record<string, unknown>[]).map((row) => [row.source_url as string, pick(row)]));

  const settled = await Promise.allSettled(logos.map(async (logo) => {
    const known = byUrl.get(logo.url);
    if (known) return { url: logo.url, asset: known, existing: true };
    const { asset } = await downloadAndStore(ctx, kit.id, { url: logo.url, type: 'auto', label: logo.label });
    return { url: logo.url, asset, existing: false };
  }));

  const result: ImportBrandLogosResult = { imported: [], failed: [] };
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') result.imported.push(r.value);
    else result.failed.push(logos[i].url);
  });
  return result;
}

/** Un asset de la marca del contexto (o de la org, con brandScope 'org'). */
export async function getBrandAsset(
  ctx: ServiceContext,
  assetId: string,
): Promise<BrandAssetView & { storage_path: string; brand_kit_id: string; brand_id: string }> {
  const db = createSupabaseServer();
  const { data: asset, error } = await db
    .from('kefy_brand_assets')
    .select(`${ASSET_SELECT}, storage_path, brand_kit_id`)
    .eq('id', assetId)
    .eq('org_id', ctx.auth.orgId)
    .maybeSingle();
  if (error) throw dbFailure(ctx, 'Failed to fetch asset', error);

  const notFound = new ServiceError('not_found', 404, msg(ctx.language, 'Asset no encontrado', 'Asset not found'));
  if (!asset) throw notFound;

  // El kit dice de qué marca es: en modo 'strict' tiene que ser la del
  // contexto (que el registro ya comprobó que existe y no está archivada).
  const { data: kit } = await db
    .from('kefy_brand_kits')
    .select('brand_id')
    .eq('id', asset.brand_kit_id as string)
    .eq('org_id', ctx.auth.orgId)
    .maybeSingle();
  if (!kit) throw notFound;
  if (ctx.brandScope === 'strict' && kit.brand_id !== ctx.brandId) throw notFound;

  return {
    ...pick(asset as Record<string, unknown>),
    storage_path: asset.storage_path as string,
    brand_kit_id: asset.brand_kit_id as string,
    brand_id: kit.brand_id as string,
  };
}

export interface UpdateBrandAssetInput {
  type?: AssetType;
  variant?: LogoVariant | null;
  background?: LogoBackground | null;
  label?: string | null;
}

/** Corrige la clasificación o el nombre de un asset. */
export async function updateBrandAsset(
  ctx: ServiceContext,
  assetId: string,
  input: UpdateBrandAssetInput,
): Promise<{ asset: BrandAssetView }> {
  const invalid = (field: string) => new ServiceError(
    'invalid_input', 422, msg(ctx.language, `Valor no válido para ${field}`, `Invalid value for ${field}`),
  );
  const changes: Record<string, unknown> = {};
  if (input.type !== undefined) {
    if (!ASSET_TYPES.includes(input.type)) throw invalid('type');
    changes.type = input.type;
  }
  if (input.variant !== undefined) {
    if (input.variant !== null && !LOGO_VARIANTS.includes(input.variant)) throw invalid('variant');
    changes.variant = input.variant;
  }
  if (input.background !== undefined) {
    if (input.background !== null && !LOGO_BACKGROUNDS.includes(input.background)) throw invalid('background');
    changes.background = input.background;
  }
  if (input.label !== undefined) {
    if (input.label !== null && typeof input.label !== 'string') throw invalid('label');
    changes.label = input.label?.trim() ? input.label.trim().slice(0, 100) : null;
  }

  const current = await getBrandAsset(ctx, assetId);
  if (Object.keys(changes).length === 0) return { asset: pick(current as unknown as Record<string, unknown>) };

  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_brand_assets')
    .update(changes)
    .eq('id', current.id)
    .eq('org_id', ctx.auth.orgId)
    .select(ASSET_SELECT)
    .single();
  if (error || !data) throw dbFailure(ctx, 'Failed to update asset', error ?? { message: 'brand asset update returned no row' });
  return { asset: pick(data as Record<string, unknown>) };
}

/**
 * Recorta un ícono cuadrado de un logo (o de cualquier imagen de la
 * biblioteca) y lo guarda como asset nuevo de la misma marca, enlazado a su
 * origen. `crop` son fracciones de la imagen (0–1); sin él se usa el recorte
 * propuesto (el isotipo a la izquierda de un logo horizontal, arriba en uno
 * vertical, el centro en uno cuadrado).
 */
export async function createIconFromAsset(
  ctx: ServiceContext,
  assetId: string,
  input: { crop?: CropRect | null; label?: string | null } = {},
): Promise<{ asset: BrandAssetView }> {
  if (input.crop != null) {
    const cropError = validateCropRect(input.crop);
    if (cropError) throw new ServiceError('invalid_input', 422, cropError);
  }

  const source = await getBrandAsset(ctx, assetId);
  if (!source.mime_type?.startsWith('image/')) {
    throw new ServiceError('invalid_input', 422, msg(ctx.language, 'Ese asset no es una imagen', 'That asset is not an image'));
  }

  const db = createSupabaseServer();
  const { data: file, error: downloadError } = await db.storage.from(STORAGE_BUCKET).download(source.storage_path);
  if (downloadError || !file) throw dbFailure(ctx, 'Failed to read asset', downloadError ?? { message: 'empty download' });

  let icon: Awaited<ReturnType<typeof cropIcon>>;
  try {
    icon = await cropIcon(Buffer.from(await file.arrayBuffer()), source.mime_type, input.crop ?? null);
  } catch (err) {
    if (err instanceof CropError) {
      throw new ServiceError('invalid_input', 422, msg(ctx.language, 'No se pudo recortar: ' + err.message, 'Could not crop: ' + err.message));
    }
    throw err;
  }

  const label = input.label?.trim()
    || msg(ctx.language, `Ícono de ${source.label ?? 'logo'}`, `Icon from ${source.label ?? 'logo'}`);

  return storeAsset(ctx, { brandId: source.brand_id, kitId: source.brand_kit_id }, {
    buffer: icon.buffer,
    contentType: 'image/png',
    filename: 'icon.png',
    type: 'icon',
    label,
    sourceAssetId: source.id,
    known: {
      variant: 'square',
      background: source.background,
      width: icon.size,
      height: icon.size,
    },
  });
}

/** Borra el asset y su archivo. Un fallo al borrar el archivo no es fatal. */
export async function deleteBrandAsset(ctx: ServiceContext, assetId: string): Promise<void> {
  const asset = await getBrandAsset(ctx, assetId);
  const db = createSupabaseServer();

  const { error: storageError } = await db.storage.from(STORAGE_BUCKET).remove([asset.storage_path]);
  if (storageError) {
    // El archivo puede no existir ya: se sigue y se borra la fila igual.
    reportError(new Error(storageError.message), { route: ROUTE, service: 'supabase', auth: ctx.auth, extra: { assetId } });
  }

  const { error } = await db
    .from('kefy_brand_assets')
    .delete()
    .eq('id', asset.id)
    .eq('org_id', ctx.auth.orgId);
  if (error) throw dbFailure(ctx, 'Failed to delete asset', error);
}
