// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';
import { IDS, AUTH, seedWorkspace } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

// La descarga (y sus protecciones contra SSRF) se prueba en media-ingest.test.ts.
const media = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('@/lib/services/media-ingest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/media-ingest')>()),
  downloadExternalMedia: media.download,
}));

import {
  addBrandAssetFromUrl, deleteBrandAsset, listBrandAssets, uploadBrandAsset,
} from '@/lib/services/brand-assets';
import { serviceContext } from '@/lib/services/context';
import { ServiceError } from '@/lib/services/errors';

// La biblioteca de assets va siempre por el kit de la marca del contexto. Antes
// el listado buscaba el kit por org_id con maybeSingle(), que con dos marcas
// fallaba y dejaba la biblioteca vacía.

const KIT = IDS.uuid(300);
const KIT_2 = IDS.uuid(301);
const ASSET = IDS.uuid(310);
const ASSET_2 = IDS.uuid(311);

const strict = (brandId: string = IDS.BRAND) => serviceContext(AUTH, brandId, 'en', { brandScope: 'strict', source: 'api' });
const org = () => serviceContext(AUTH, '', 'en', { brandScope: 'org', source: 'route' });

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  seedWorkspace(db);
  db.seed('kefy_brand_kits', [
    { id: KIT, org_id: IDS.ORG, brand_id: IDS.BRAND, name: 'Acme Café' },
    { id: KIT_2, org_id: IDS.ORG, brand_id: IDS.BRAND_2, name: 'Acme Bar' },
  ]);
  db.seed('kefy_brand_assets', [
    { id: ASSET, brand_kit_id: KIT, org_id: IDS.ORG, type: 'logo', label: 'Logo', storage_path: `${IDS.BRAND}/${KIT}/1-logo.png`, public_url: 'https://test.supabase.co/storage/v1/object/public/kefy-brand-assets/a.png', file_size: 10, mime_type: 'image/png' },
    { id: ASSET_2, brand_kit_id: KIT_2, org_id: IDS.ORG, type: 'image', label: 'Barra', storage_path: `${IDS.BRAND_2}/${KIT_2}/2-barra.png`, public_url: 'https://test.supabase.co/storage/v1/object/public/kefy-brand-assets/b.png', file_size: 10, mime_type: 'image/png' },
  ]);
});

describe('listBrandAssets', () => {
  it('con dos marcas, cada una ve solo los assets de su kit', async () => {
    expect((await listBrandAssets(strict())).assets.map((a) => a.id)).toEqual([ASSET]);
    expect((await listBrandAssets(strict(IDS.BRAND_2))).assets.map((a) => a.id)).toEqual([ASSET_2]);
  });

  it('no expone storage_path', async () => {
    const { assets } = await listBrandAssets(strict());
    expect(assets[0]).not.toHaveProperty('storage_path');
  });

  it('una marca sin kit devuelve una lista vacía', async () => {
    db.rows('kefy_brand_kits').splice(0);
    expect((await listBrandAssets(strict())).assets).toEqual([]);
  });
});

describe('uploadBrandAsset / addBrandAssetFromUrl', () => {
  it('sube al bucket de la marca bajo brandId/kitId y registra el asset', async () => {
    const { asset } = await uploadBrandAsset(strict(), {
      buffer: Buffer.from('png'), contentType: 'image/png', filename: 'mi logo!.png', type: 'logo', label: '  Principal  ',
    });
    const up = db.storage.uploads[0];
    expect(up.bucket).toBe('kefy-brand-assets');
    expect(up.path).toMatch(new RegExp(`^${IDS.BRAND}/${KIT}/\\d+-mi_logo_.png$`));
    expect(asset).toMatchObject({ type: 'logo', label: 'Principal', mime_type: 'image/png' });
    expect(db.find('kefy_brand_assets', (r) => r.id === asset.id)).toMatchObject({ brand_kit_id: KIT, org_id: IDS.ORG });
  });

  it('un tipo desconocido se guarda como other', async () => {
    const { asset } = await uploadBrandAsset(strict(), {
      buffer: Buffer.from('x'), contentType: 'image/png', filename: 'a.png', type: 'banner' as never,
    });
    expect(asset.type).toBe('other');
  });

  it('si el registro falla, borra el archivo subido', async () => {
    db.failNext('kefy_brand_assets', 'insert');
    await expect(uploadBrandAsset(strict(), { buffer: Buffer.from('x'), contentType: 'image/png', filename: 'a.png' }))
      .rejects.toBeInstanceOf(ServiceError);
    expect(db.storage.removed).toEqual([{ bucket: 'kefy-brand-assets', path: db.storage.uploads[0].path }]);
  });

  it('desde una URL descarga con media-ingest y guarda en la biblioteca', async () => {
    media.download.mockResolvedValue({ buffer: Buffer.from('webp'), contentType: 'image/webp', ext: 'webp' });
    const { asset } = await addBrandAssetFromUrl(strict(), { url: 'https://cdn.example.com/x.webp', type: 'icon' });
    expect(media.download).toHaveBeenCalledWith(expect.anything(), 'https://cdn.example.com/x.webp', 'image');
    expect(asset).toMatchObject({ type: 'icon', mime_type: 'image/webp' });
    expect(db.storage.uploads[0].path).toMatch(/import\.webp$/);
  });
});

describe('deleteBrandAsset', () => {
  it('borra el archivo y la fila', async () => {
    await deleteBrandAsset(strict(), ASSET);
    expect(db.storage.removed).toEqual([{ bucket: 'kefy-brand-assets', path: `${IDS.BRAND}/${KIT}/1-logo.png` }]);
    expect(db.find('kefy_brand_assets', (r) => r.id === ASSET)).toBeUndefined();
  });

  it('en modo strict, el asset de otra marca es 404', async () => {
    const err = await deleteBrandAsset(strict(), ASSET_2).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).status).toBe(404);
    expect(db.find('kefy_brand_assets', (r) => r.id === ASSET_2)).toBeDefined();
  });

  it('la ruta (modo org) puede borrar el de cualquier marca de la organización', async () => {
    await deleteBrandAsset(org(), ASSET_2);
    expect(db.find('kefy_brand_assets', (r) => r.id === ASSET_2)).toBeUndefined();
  });

  it('el asset de otra organización es 404', async () => {
    const other = serviceContext({ ...AUTH, orgId: IDS.OTHER_ORG }, '', 'en', { brandScope: 'org', source: 'route' });
    await expect(deleteBrandAsset(other, ASSET)).rejects.toMatchObject({ status: 404 });
  });
});
