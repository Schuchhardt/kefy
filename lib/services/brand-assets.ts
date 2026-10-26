// ─── Servicio: assets del Brand Kit ───────────────────────────────────────────
//
// Biblioteca de logos, imágenes e íconos de una marca (kefy_brand_assets, bucket
// kefy-brand-assets). La comparten /api/brand-kit/assets/** y las herramientas
// list_brand_assets, add_brand_asset y delete_brand_asset.
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
import type { AssetType, BrandAsset } from '@/types/brand-kit';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';
import { getOrCreateBrandKit } from '@/lib/services/brand-kit';
import { downloadExternalMedia } from '@/lib/services/media-ingest';

const ROUTE = 'lib/services/brand-assets';

export const ASSET_TYPES: readonly AssetType[] = ['logo', 'image', 'icon', 'other'];

/** Columnas que devuelven la ruta y las herramientas (sin storage_path). */
const ASSET_SELECT = 'id, type, label, public_url, file_size, mime_type, created_at';

export type BrandAssetView = Pick<BrandAsset, 'id' | 'type' | 'label' | 'public_url' | 'file_size' | 'mime_type' | 'created_at'>;

function pick(row: Record<string, unknown>): BrandAssetView {
  return {
    id: row.id as string,
    type: row.type as AssetType,
    label: (row.label as string | null) ?? null,
    public_url: row.public_url as string,
    file_size: (row.file_size as number | null) ?? null,
    mime_type: (row.mime_type as string | null) ?? null,
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
  type?: AssetType;
  label?: string | null;
}

/**
 * Sube un archivo ya validado (tipo y tamaño) al bucket de la marca y lo
 * registra. Si el registro falla, se borra el archivo subido.
 */
export async function uploadBrandAsset(ctx: ServiceContext, input: UploadBrandAssetInput): Promise<{ asset: BrandAssetView }> {
  const db = createSupabaseServer();
  const { kit } = await getOrCreateBrandKit(ctx);

  const type: AssetType = input.type && ASSET_TYPES.includes(input.type) ? input.type : 'other';
  const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 100) : null;

  // brandId/kitId/timestamp-filename
  const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'asset';
  const storagePath = `${ctx.brandId}/${kit.id}/${Date.now()}-${safeFilename}`;

  const { error: uploadError } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, input.buffer, { contentType: input.contentType, upsert: false });
  if (uploadError) throw dbFailure(ctx, 'Failed to upload file', uploadError);

  const { data: { publicUrl } } = db.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

  const { data: asset, error } = await db
    .from('kefy_brand_assets')
    .insert({
      brand_kit_id: kit.id,
      org_id:       ctx.auth.orgId,
      type,
      label,
      storage_path: storagePath,
      public_url:   publicUrl,
      file_size:    input.buffer.byteLength,
      mime_type:    input.contentType,
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
  input: { url: string; type?: AssetType; label?: string | null },
): Promise<{ asset: BrandAssetView }> {
  const { buffer, contentType, ext } = await downloadExternalMedia(ctx, input.url, 'image');
  return uploadBrandAsset(ctx, {
    buffer,
    contentType,
    filename: `import.${ext}`,
    type: input.type,
    label: input.label,
  });
}

/** Un asset de la marca del contexto (o de la org, con brandScope 'org'). */
export async function getBrandAsset(
  ctx: ServiceContext,
  assetId: string,
): Promise<BrandAssetView & { storage_path: string }> {
  const db = createSupabaseServer();
  const { data: asset, error } = await db
    .from('kefy_brand_assets')
    .select('id, type, label, public_url, file_size, mime_type, created_at, storage_path, brand_kit_id')
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

  return { ...pick(asset as Record<string, unknown>), storage_path: asset.storage_path as string };
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
