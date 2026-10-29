// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { createFakeDb } from '../../helpers/fake-db';
import { resetQuotaState, resetSubscriptionState } from '../../helpers/quota';
import { IDS, AUTH, seedWorkspace, apiCtx } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

// La descarga real (y su protección contra SSRF) se prueba en media-ingest.test.ts.
const media = vi.hoisted(() => ({ download: vi.fn(), ingest: vi.fn() }));
vi.mock('@/lib/services/media-ingest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/media-ingest')>()),
  downloadExternalMedia: media.download,
  ingestExternalMedia: media.ingest,
}));

import { executeTool, getTool, toolJsonSchema } from '@/lib/assistant/registry';
import { ensureToolsRegistered } from '@/lib/assistant/tools';
import { chatToolContext } from '@/lib/assistant/context';

// Herramientas de marca: identidad (logo), biblioteca de assets y marcas
// (crear, archivar, avatar) por el chat, la API y MCP.

const KIT = IDS.uuid(300);
const KIT_2 = IDS.uuid(301);
const ASSET_2 = IDS.uuid(311);
const KEFY_URL = 'https://test.supabase.co/storage/v1/object/public/kefy-brand-assets/logo.png';

const kit = (id = KIT) => db.find('kefy_brand_kits', (k) => k.id === id)!;
const brand = (id: string) => db.find('kefy_brands', (b) => b.id === id)!;

function ok(r: Awaited<ReturnType<typeof executeTool>>) {
  if (r.ok !== true) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r.data as Record<string, unknown>;
}

function err(r: Awaited<ReturnType<typeof executeTool>>) {
  if (r.ok !== false) throw new Error(`expected error, got ${JSON.stringify(r)}`);
  return r.error;
}

beforeEach(() => {
  db.reset();
  resetQuotaState();
  resetSubscriptionState();
  vi.clearAllMocks();
  seedWorkspace(db);
  ensureToolsRegistered();
  db.seed('kefy_brand_kits', [
    { id: KIT, org_id: IDS.ORG, brand_id: IDS.BRAND, name: 'Acme Café', logo_url: null, tone: [], social_urls: {} },
    { id: KIT_2, org_id: IDS.ORG, brand_id: IDS.BRAND_2, name: 'Acme Bar', logo_url: null, tone: [], social_urls: {} },
  ]);
  db.seed('kefy_brand_assets', [
    { id: ASSET_2, brand_kit_id: KIT_2, org_id: IDS.ORG, type: 'image', label: 'Barra', storage_path: 'b/k/2.png', public_url: KEFY_URL, file_size: 1, mime_type: 'image/png' },
  ]);
  db.rpcHandlers.kefy_brand_create = (args) => {
    const [row] = db.seed('kefy_brands', [{ org_id: args.p_org_id, name: args.p_name, slug: args.p_slug, archived: false, avatar_url: null }]);
    return { data: row, error: null };
  };
  media.ingest.mockResolvedValue('https://test.supabase.co/storage/v1/object/public/kefy-content-media/org/imports/x.png');
  media.download.mockImplementation(async () => ({
    buffer: await sharp({ create: { width: 40, height: 20, channels: 3, background: '#00ff00' } }).png().toBuffer(),
    contentType: 'image/png',
    ext: 'png',
  }));
});

describe('update_brand_profile: logo', () => {
  it('un logo alojado fuera de Kefy se copia al Storage antes de guardarlo', async () => {
    const data = ok(await executeTool('update_brand_profile', { brand_id: IDS.BRAND, logo_url: 'https://cdn.example.com/logo.png' }, apiCtx()));
    expect(media.ingest).toHaveBeenCalledWith(expect.anything(), 'https://cdn.example.com/logo.png', 'image');
    expect(kit().logo_url).toBe('https://test.supabase.co/storage/v1/object/public/kefy-content-media/org/imports/x.png');
    expect((data.kit as Record<string, unknown>).logo_url).toBe(kit().logo_url);
  });

  it('un logo que ya está en Kefy (p. ej. un asset) se usa tal cual', async () => {
    ok(await executeTool('update_brand_profile', { brand_id: IDS.BRAND, logo_url: KEFY_URL }, apiCtx()));
    expect(media.ingest).not.toHaveBeenCalled();
    expect(kit().logo_url).toBe(KEFY_URL);
  });
});

describe('biblioteca de assets', () => {
  it('list_brand_assets solo devuelve los de la marca de la llamada', async () => {
    expect((ok(await executeTool('list_brand_assets', { brand_id: IDS.BRAND }, apiCtx())).assets as unknown[])).toHaveLength(0);
    const assets = ok(await executeTool('list_brand_assets', { brand_id: IDS.BRAND_2 }, apiCtx())).assets as Array<Record<string, unknown>>;
    expect(assets.map((a) => a.id)).toEqual([ASSET_2]);
    expect(assets[0].url).toBe(KEFY_URL);
  });

  it('add_brand_asset con set_as_logo guarda el asset y lo deja como logo del kit', async () => {
    const data = ok(await executeTool('add_brand_asset', {
      brand_id: IDS.BRAND, image_url: 'https://cdn.example.com/logo.png', type: 'logo', label: 'Logo', set_as_logo: true,
    }, apiCtx()));
    const asset = data.asset as Record<string, unknown>;
    expect(asset.type).toBe('logo');
    expect(data.logo_set).toBe(true);
    expect(kit().logo_url).toBe(asset.url);
    expect(db.storage.uploads[0].bucket).toBe('kefy-brand-assets');
  });

  it('add_brand_asset exige owner o admin', async () => {
    const e = err(await executeTool('add_brand_asset', { brand_id: IDS.BRAND, image_url: 'https://cdn.example.com/a.png' }, apiCtx({ role: 'member' })));
    expect(e.code).toBe('forbidden');
  });

  it('delete_brand_asset no borra el asset de otra marca', async () => {
    expect(err(await executeTool('delete_brand_asset', { brand_id: IDS.BRAND, asset_id: ASSET_2 }, apiCtx())).code).toBe('not_found');
    ok(await executeTool('delete_brand_asset', { brand_id: IDS.BRAND_2, asset_id: ASSET_2 }, apiCtx()));
    expect(db.find('kefy_brand_assets', (a) => a.id === ASSET_2)).toBeUndefined();
  });

  it('delete_brand_asset siempre pide confirmación en el chat', async () => {
    const chat = chatToolContext({ auth: AUTH, brandId: IDS.BRAND_2, language: 'es', conversationId: IDS.uuid(100), turnId: IDS.uuid(101), tainted: false });
    const r = await executeTool('delete_brand_asset', { asset_id: ASSET_2 }, chat);
    expect(r.ok).toBe('pending');
    expect(db.find('kefy_brand_assets', (a) => a.id === ASSET_2)).toBeDefined();
  });

  it('update_brand_asset reclasifica solo assets de la marca indicada', async () => {
    expect(err(await executeTool('update_brand_asset', { brand_id: IDS.BRAND, asset_id: ASSET_2, type: 'logo' }, apiCtx())).code).toBe('not_found');
    const data = ok(await executeTool('update_brand_asset', { brand_id: IDS.BRAND_2, asset_id: ASSET_2, type: 'logo', background: 'dark' }, apiCtx()));
    expect(data.asset).toMatchObject({ type: 'logo', background: 'dark' });
  });

  it('create_brand_icon recorta un ícono del logo de la marca y no cruza marcas', async () => {
    const png = await sharp({ create: { width: 800, height: 200, channels: 4, background: '#123456' } }).png().toBuffer();
    db.storage.files.set('kefy-brand-assets/b/k/2.png', png);
    expect(err(await executeTool('create_brand_icon', { brand_id: IDS.BRAND, asset_id: ASSET_2 }, apiCtx())).code).toBe('not_found');
    const data = ok(await executeTool('create_brand_icon', {
      brand_id: IDS.BRAND_2, asset_id: ASSET_2, crop: { x: 0, y: 0, width: 0.25, height: 1 },
    }, apiCtx()));
    expect(data.asset).toMatchObject({ type: 'icon', variant: 'square', width: 200, height: 200, source_asset_id: ASSET_2 });
  });

  it('create_brand_icon exige owner o admin', async () => {
    expect(err(await executeTool('create_brand_icon', { brand_id: IDS.BRAND_2, asset_id: ASSET_2 }, apiCtx({ role: 'member' }))).code).toBe('forbidden');
  });
});

describe('create_brand', () => {
  it('por la API no exige brand_id aunque la organización tenga varias marcas', async () => {
    const data = ok(await executeTool('create_brand', { name: 'Acme Panadería' }, apiCtx()));
    const created = data.brand as { id: string; name: string };
    expect(created.name).toBe('Acme Panadería');
    expect(db.find('kefy_brand_kits', (k) => k.brand_id === created.id)).toBeDefined();
  });

  it('su JSON Schema no anuncia brand_id', () => {
    const schema = toolJsonSchema(getTool('create_brand')!, { source: 'mcp', boundBrandId: null });
    expect(Object.keys(schema.properties as object)).toEqual(['name']);
  });

  it('una key atada a una marca no puede crear marcas', async () => {
    const e = err(await executeTool('create_brand', { name: 'X' }, apiCtx({ boundBrandId: IDS.BRAND })));
    expect(e.code).toBe('bound_key_org_write');
  });

  it('en el chat pide confirmación', async () => {
    const chat = chatToolContext({ auth: AUTH, brandId: IDS.BRAND, language: 'es', conversationId: IDS.uuid(100), turnId: IDS.uuid(101), tainted: false });
    expect((await executeTool('create_brand', { name: 'X' }, chat)).ok).toBe('pending');
  });
});

describe('archive_brand', () => {
  it('archiva la marca de la llamada', async () => {
    ok(await executeTool('archive_brand', { brand_id: IDS.BRAND_2 }, apiCtx()));
    expect(brand(IDS.BRAND_2).archived).toBe(true);
    expect(brand(IDS.BRAND).archived).toBe(false);
  });

  it('solo el dueño', async () => {
    expect(err(await executeTool('archive_brand', { brand_id: IDS.BRAND_2 }, apiCtx({ role: 'admin' }))).code).toBe('forbidden');
  });

  it('no archiva la única marca activa', async () => {
    ok(await executeTool('archive_brand', { brand_id: IDS.BRAND_2 }, apiCtx()));
    expect(err(await executeTool('archive_brand', { brand_id: IDS.BRAND }, apiCtx())).status).toBe(409);
  });
});

describe('set_brand_avatar', () => {
  it('descarga la imagen y la deja como avatar de la marca de la llamada', async () => {
    const data = ok(await executeTool('set_brand_avatar', { brand_id: IDS.BRAND_2, image_url: 'https://cdn.example.com/a.png' }, apiCtx()));
    expect(media.download).toHaveBeenCalledWith(expect.anything(), 'https://cdn.example.com/a.png', 'image');
    expect((data.brand as Record<string, unknown>).avatar_url).toBe(brand(IDS.BRAND_2).avatar_url);
    expect(brand(IDS.BRAND_2).avatar_url).toMatch(/\.webp$/);
    expect(brand(IDS.BRAND).avatar_url).toBeNull();
  });

  it('con null la quita', async () => {
    brand(IDS.BRAND).avatar_url = KEFY_URL;
    ok(await executeTool('set_brand_avatar', { brand_id: IDS.BRAND, image_url: null }, apiCtx()));
    expect(brand(IDS.BRAND).avatar_url).toBeNull();
  });
});
