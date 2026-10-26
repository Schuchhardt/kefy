// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { createFakeDb } from '../../helpers/fake-db';
import { IDS, AUTH, seedWorkspace } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

import { archiveBrand, clearBrandAvatar, createBrand, setBrandAvatar } from '@/lib/services/brands';
import { serviceContext } from '@/lib/services/context';
import { ServiceError } from '@/lib/services/errors';

// Alta, archivo y avatar de una marca: lo que hacían inline POST /api/brands,
// DELETE /api/brands/[id] y /api/brands/[id]/avatar, ahora compartido con
// create_brand, archive_brand y set_brand_avatar.

const ctx = (lang: 'es' | 'en' = 'en') => serviceContext(AUTH, IDS.BRAND, lang, { brandScope: 'org', source: 'route' });
const brand = (id: string) => db.find('kefy_brands', (b) => b.id === id)!;

/** kefy_brand_create: el tope y el INSERT en una sola función SQL. */
function brandCreateRpc() {
  const calls: Record<string, unknown>[] = [];
  db.rpcHandlers.kefy_brand_create = (args) => {
    calls.push(args);
    const active = db.rows('kefy_brands').filter((b) => b.org_id === args.p_org_id && !b.archived).length;
    if (active >= Number(args.p_limit)) return { data: null, error: { message: 'BRAND_LIMIT_REACHED' } };
    const [row] = db.seed('kefy_brands', [{ org_id: args.p_org_id, name: args.p_name, slug: args.p_slug, archived: false, avatar_url: null }]);
    return { data: row, error: null };
  };
  return calls;
}

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#ff0000' } }).png().toBuffer();
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  seedWorkspace(db);
});

describe('createBrand', () => {
  it('crea la marca con el tope del plan de la organización y un Brand Kit vacío', async () => {
    db.find('kefy_organizations', (o) => o.id === IDS.ORG)!.plan = 'pro';
    const calls = brandCreateRpc();

    const { brand: created } = await createBrand(ctx(), { name: '  Acme Panadería  ' });

    expect(created.name).toBe('Acme Panadería');
    expect(calls[0]).toMatchObject({ p_org_id: IDS.ORG, p_name: 'Acme Panadería' });
    expect(String(calls[0].p_slug)).toMatch(/^acme-panaderia-[a-z0-9]+$/);
    expect(Number(calls[0].p_limit)).toBeGreaterThan(1);
    expect(db.find('kefy_brand_kits', (k) => k.brand_id === created.id)).toMatchObject({ org_id: IDS.ORG, name: 'Acme Panadería' });
  });

  it('al llegar al tope responde 403 con el mensaje de siempre', async () => {
    brandCreateRpc();
    db.rpcHandlers.kefy_brand_create = () => ({ data: null, error: { message: 'BRAND_LIMIT_REACHED' } });
    const err = await createBrand(ctx('es'), { name: 'Otra' }).catch((e) => e) as ServiceError;
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/Tu plan permite/);
    expect(err.body?.error).toMatch(/Your plan allows up to/);
  });

  it('un nombre vacío es 422', async () => {
    await expect(createBrand(ctx(), { name: '   ' })).rejects.toMatchObject({ status: 422 });
  });
});

describe('archiveBrand', () => {
  it('archiva una marca cuando quedan otras activas', async () => {
    await archiveBrand(ctx(), IDS.BRAND_2);
    expect(brand(IDS.BRAND_2).archived).toBe(true);
  });

  it('no archiva la única marca activa', async () => {
    await archiveBrand(ctx(), IDS.BRAND_2);
    await expect(archiveBrand(ctx(), IDS.BRAND)).rejects.toMatchObject({ status: 409 });
    expect(brand(IDS.BRAND).archived).toBe(false);
  });

  it('una marca ya archivada es 409 y una de otra organización 404', async () => {
    await expect(archiveBrand(ctx(), IDS.ARCHIVED_BRAND)).rejects.toMatchObject({ status: 409 });
    await expect(archiveBrand(ctx(), IDS.OTHER_BRAND)).rejects.toMatchObject({ status: 404 });
    expect(brand(IDS.OTHER_BRAND).archived).toBe(false);
  });
});

describe('setBrandAvatar / clearBrandAvatar', () => {
  it('normaliza la imagen a un cuadrado WebP de 256 px y la deja como avatar', async () => {
    const { brand: updated } = await setBrandAvatar(ctx(), IDS.BRAND, await png(800, 300));
    const up = db.storage.uploads[0];
    expect(up.contentType).toBe('image/webp');
    expect(updated.avatar_url).toContain(up.path);
    expect(brand(IDS.BRAND).avatar_url).toBe(updated.avatar_url);
  });

  it('una imagen ilegible es 500 y no toca la marca', async () => {
    await expect(setBrandAvatar(ctx(), IDS.BRAND, Buffer.from('no es una imagen'))).rejects.toMatchObject({ status: 500 });
    expect(brand(IDS.BRAND).avatar_url).toBeNull();
  });

  it('no cambia el avatar de una marca de otra organización', async () => {
    await expect(setBrandAvatar(ctx(), IDS.OTHER_BRAND, await png(10, 10))).rejects.toMatchObject({ status: 404 });
    expect(db.storage.uploads).toHaveLength(0);
    await expect(clearBrandAvatar(ctx(), IDS.OTHER_BRAND)).rejects.toMatchObject({ status: 404 });
  });

  it('quitar el avatar lo deja en null', async () => {
    brand(IDS.BRAND).avatar_url = 'https://test.supabase.co/x.webp';
    await clearBrandAvatar(ctx(), IDS.BRAND);
    expect(brand(IDS.BRAND).avatar_url).toBeNull();
  });
});
