// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
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
  addBrandAssetFromUrl, createIconFromAsset, deleteBrandAsset, importBrandLogos, listBrandAssets, updateBrandAsset,
  uploadBrandAsset,
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
    // Un logo o ícono se descarga con los tipos de logo (SVG incluido).
    expect(media.download).toHaveBeenCalledWith(expect.anything(), 'https://cdn.example.com/x.webp', 'logo');
    expect(asset).toMatchObject({ type: 'icon', mime_type: 'image/webp' });
    expect(db.storage.uploads[0].path).toMatch(/import\.webp$/);
    expect(db.rows('kefy_brand_assets').at(-1)?.source_url).toBe('https://cdn.example.com/x.webp');
  });

  it('una imagen de contenido desde una URL no admite SVG', async () => {
    media.download.mockResolvedValue({ buffer: Buffer.from('jpg'), contentType: 'image/jpeg', ext: 'jpg' });
    await addBrandAssetFromUrl(strict(), { url: 'https://cdn.example.com/x.jpg', type: 'image' });
    expect(media.download).toHaveBeenCalledWith(expect.anything(), 'https://cdn.example.com/x.jpg', 'image');
  });
});

describe('importBrandLogos (logos de la web)', () => {
  const LOGO = 'https://acme.cl/logo.svg';
  const FAVICON = 'https://acme.cl/favicon.png';

  beforeEach(async () => {
    const files: Record<string, { buffer: Buffer; contentType: string; ext: string }> = {
      [LOGO]: { buffer: await logoPng(800, 200, { left: 0, top: 0, width: 800, height: 200 }), contentType: 'image/png', ext: 'png' },
      [FAVICON]: { buffer: await logoPng(64, 64, { left: 0, top: 0, width: 64, height: 64 }), contentType: 'image/png', ext: 'png' },
    };
    media.download.mockImplementation(async (_ctx: unknown, url: string) => {
      if (!files[url]) throw new ServiceError('invalid_input', 422, 'Unsupported image type');
      return files[url];
    });
  });

  it('guarda cada logo clasificado en el kit de la marca y recuerda de dónde vino', async () => {
    const out = await importBrandLogos(strict(), {
      logos: [{ url: LOGO, label: 'Logo (acme.cl)' }, { url: FAVICON, label: 'Ícono (acme.cl)' }, { url: LOGO }],
    });
    expect(out.failed).toEqual([]);
    expect(out.imported.map((i) => [i.url, i.asset.type, i.existing])).toEqual([[LOGO, 'logo', false], [FAVICON, 'icon', false]]);
    const rows = db.rows('kefy_brand_assets').filter((r) => r.source_url);
    // Se descargan en paralelo: el orden de inserción no importa.
    expect(rows.map((r) => [r.brand_kit_id, r.source_url, r.label])).toEqual(expect.arrayContaining([
      [KIT, LOGO, 'Logo (acme.cl)'], [KIT, FAVICON, 'Ícono (acme.cl)'],
    ]));
    expect(rows).toHaveLength(2);
  });

  it('leer la misma web otra vez no duplica: devuelve los que ya estaban', async () => {
    await importBrandLogos(strict(), { logos: [{ url: LOGO }] });
    vi.clearAllMocks();
    const out = await importBrandLogos(strict(), { logos: [{ url: LOGO }] });
    expect(out.imported).toMatchObject([{ url: LOGO, existing: true }]);
    expect(media.download).not.toHaveBeenCalled();
    expect(db.rows('kefy_brand_assets').filter((r) => r.source_url === LOGO)).toHaveLength(1);
  });

  it('el mismo logo en otra marca sí se importa (cada marca tiene su biblioteca)', async () => {
    await importBrandLogos(strict(), { logos: [{ url: LOGO }] });
    const out = await importBrandLogos(strict(IDS.BRAND_2), { logos: [{ url: LOGO }] });
    expect(out.imported).toMatchObject([{ existing: false }]);
    expect(db.rows('kefy_brand_assets').filter((r) => r.source_url === LOGO).map((r) => r.brand_kit_id)).toEqual([KIT, KIT_2]);
  });

  it('uno que falla no detiene los demás; http y repetidos se ignoran', async () => {
    const out = await importBrandLogos(strict(), {
      logos: [{ url: 'https://acme.cl/roto.bmp' }, { url: 'http://acme.cl/logo.png' }, { url: FAVICON }],
    });
    expect(out.failed).toEqual(['https://acme.cl/roto.bmp']);
    expect(out.imported.map((i) => i.url)).toEqual([FAVICON]);
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

// ─── Varios logos e íconos: clasificación y recorte ─────────────────────────

/** PNG transparente w×h con un bloque oscuro en `box`. */
async function logoPng(w: number, h: number, box: { left: number; top: number; width: number; height: number }) {
  const block = await sharp({ create: { width: box.width, height: box.height, channels: 4, background: '#202020' } }).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: block, left: box.left, top: box.top }]).png().toBuffer();
}

describe('clasificación al subir', () => {
  it("type 'auto' guarda un logo horizontal con su forma, fondo y tamaño", async () => {
    const { asset } = await uploadBrandAsset(strict(), {
      buffer: await logoPng(900, 300, { left: 50, top: 100, width: 800, height: 100 }),
      contentType: 'image/png', filename: 'logo.png', type: 'auto',
    });
    expect(asset).toMatchObject({ type: 'logo', variant: 'horizontal', background: 'light', width: 900, height: 300 });
  });

  it("type 'auto' con contenido cuadrado lo guarda como ícono", async () => {
    const { asset } = await uploadBrandAsset(strict(), {
      buffer: await logoPng(500, 500, { left: 100, top: 100, width: 300, height: 300 }),
      contentType: 'image/png', filename: 'isotipo.png', type: 'auto',
    });
    expect(asset).toMatchObject({ type: 'icon', variant: 'square' });
  });

  it("type 'auto' con un archivo ilegible cae en logo sin clasificación", async () => {
    const { asset } = await uploadBrandAsset(strict(), {
      buffer: Buffer.from('roto'), contentType: 'image/png', filename: 'x.png', type: 'auto',
    });
    expect(asset).toMatchObject({ type: 'logo', variant: null, background: null });
  });

  it('una imagen de contenido (type image) no se mide', async () => {
    const { asset } = await uploadBrandAsset(strict(), {
      buffer: await logoPng(500, 500, { left: 0, top: 0, width: 500, height: 500 }),
      contentType: 'image/png', filename: 'foto.png', type: 'image',
    });
    expect(asset).toMatchObject({ type: 'image', variant: null, width: null });
  });
});

describe('updateBrandAsset', () => {
  it('corrige tipo, forma, fondo y nombre', async () => {
    const { asset } = await updateBrandAsset(strict(), ASSET, { type: 'icon', variant: 'square', background: 'dark', label: '  Isotipo ' });
    expect(asset).toMatchObject({ type: 'icon', variant: 'square', background: 'dark', label: 'Isotipo' });
  });

  it('rechaza valores fuera del catálogo', async () => {
    await expect(updateBrandAsset(strict(), ASSET, { variant: 'diagonal' as never })).rejects.toMatchObject({ status: 422 });
    await expect(updateBrandAsset(strict(), ASSET, { background: 'gris' as never })).rejects.toMatchObject({ status: 422 });
  });

  it('en modo strict, el asset de otra marca es 404', async () => {
    await expect(updateBrandAsset(strict(), ASSET_2, { type: 'icon' })).rejects.toMatchObject({ status: 404 });
    expect(db.find('kefy_brand_assets', (r) => r.id === ASSET_2)!.type).toBe('image');
  });
});

describe('createIconFromAsset', () => {
  const PATH_2 = `${IDS.BRAND_2}/${KIT_2}/2-barra.png`;

  beforeEach(async () => {
    db.storage.files.set(`kefy-brand-assets/${PATH_2}`, await logoPng(1000, 250, { left: 0, top: 0, width: 1000, height: 250 }));
    Object.assign(db.find('kefy_brand_assets', (r) => r.id === ASSET_2)!, { type: 'logo', background: 'light' });
  });

  it('recorta un ícono cuadrado y lo guarda en el kit de la marca del logo, enlazado a él', async () => {
    // La ruta usa modo org sin marca: el ícono va a la marca del logo, no a otra.
    const { asset } = await createIconFromAsset(org(), ASSET_2, { crop: { x: 0, y: 0, width: 0.25, height: 1 } });
    expect(asset).toMatchObject({
      type: 'icon', variant: 'square', background: 'light', width: 250, height: 250,
      source_asset_id: ASSET_2, mime_type: 'image/png', label: 'Icon from Barra',
    });
    expect(db.find('kefy_brand_assets', (r) => r.id === asset.id)).toMatchObject({ brand_kit_id: KIT_2 });
    const up = db.storage.uploads[0];
    expect(up.path).toMatch(new RegExp(`^${IDS.BRAND_2}/${KIT_2}/\\d+-icon.png$`));
    const meta = await sharp(db.storage.files.get(`kefy-brand-assets/${up.path}`)!).metadata();
    expect(meta).toMatchObject({ width: 250, height: 250, format: 'png' });
  });

  it('sin recorte usa el propuesto', async () => {
    const { asset } = await createIconFromAsset(strict(IDS.BRAND_2), ASSET_2);
    expect(asset).toMatchObject({ type: 'icon', width: 250, height: 250 });
  });

  it('valida el recorte antes de tocar nada', async () => {
    await expect(createIconFromAsset(strict(IDS.BRAND_2), ASSET_2, { crop: { x: 0.9, y: 0, width: 0.5, height: 1 } }))
      .rejects.toMatchObject({ status: 422 });
    expect(db.storage.uploads).toEqual([]);
  });

  it('en modo strict, el logo de otra marca es 404', async () => {
    await expect(createIconFromAsset(strict(), ASSET_2)).rejects.toMatchObject({ status: 404 });
  });
});
