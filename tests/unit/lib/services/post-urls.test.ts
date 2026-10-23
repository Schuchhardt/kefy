// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));

const zernio = vi.hoisted(() => ({ getPublishedPostUrl: vi.fn() }));
vi.mock('@/lib/zernio', () => ({ getPublishedPostUrl: zernio.getPublishedPostUrl }));

import { fillMissingPostUrls } from '@/lib/services/post-urls';

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  db.seed('kefy_scheduled_posts', [
    { id: 'p1', status: 'published', zernio_post_id: 'z1', platform_post_url: null, platform_post_id: 'z1' },
    { id: 'p2', status: 'published', zernio_post_id: 'z2', platform_post_url: 'https://x.com/acme/status/2' },
    { id: 'p3', status: 'scheduled', zernio_post_id: 'z3', platform_post_url: null },
    { id: 'p4', status: 'published', zernio_post_id: null, platform_post_url: null },
  ]);
});

const row = (id: string) => db.rows('kefy_scheduled_posts').find((r) => r.id === id)!;

describe('fillMissingPostUrls', () => {
  it('solo consulta Zernio por las publicadas sin URL, y la guarda junto al id nativo', async () => {
    zernio.getPublishedPostUrl.mockResolvedValue({ url: 'https://www.instagram.com/p/AbC/', platform_post_id: '1789' });
    const rows = db.rows('kefy_scheduled_posts').map((r) => ({ ...r })) as Array<{
      id: string; status: string; zernio_post_id: string | null; platform_post_url: string | null;
    }>;

    const out = await fillMissingPostUrls(rows);

    expect(zernio.getPublishedPostUrl).toHaveBeenCalledTimes(1);
    expect(zernio.getPublishedPostUrl).toHaveBeenCalledWith('z1');
    expect(out.find((r) => r.id === 'p1')!.platform_post_url).toBe('https://www.instagram.com/p/AbC/');
    expect(row('p1').platform_post_url).toBe('https://www.instagram.com/p/AbC/');
    expect(row('p1').platform_post_id).toBe('1789');
    expect(out.find((r) => r.id === 'p3')!.platform_post_url).toBeNull();
  });

  it('un fallo de Zernio no rompe el listado: la fila queda sin URL', async () => {
    zernio.getPublishedPostUrl.mockRejectedValue(new Error('Zernio 500'));
    const rows = [{ id: 'p1', status: 'published', zernio_post_id: 'z1', platform_post_url: null }];

    await expect(fillMissingPostUrls(rows)).resolves.toEqual(rows);
    expect(row('p1').platform_post_url).toBeNull();
  });

  it('si Zernio aún no tiene URL no escribe nada', async () => {
    zernio.getPublishedPostUrl.mockResolvedValue({ url: null, platform_post_id: null });
    await fillMissingPostUrls([{ id: 'p1', status: 'published', zernio_post_id: 'z1', platform_post_url: null }]);
    expect(row('p1').platform_post_url).toBeNull();
    expect(row('p1').platform_post_id).toBe('z1');
  });
});
