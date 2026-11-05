// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb } from '../helpers/fake-db';
import { IDS, AUTH, seedWorkspace } from '../helpers/assistant';

// GET /api/content/[itemId]/publish-targets: la ruta solo adapta HTTP al
// servicio listPublishTargets (lib/services/publish.ts).

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getAuthFromRequest: vi.fn() };
});

import { getAuthFromRequest } from '@/lib/auth';
import { GET } from '@/app/api/content/[itemId]/publish-targets/route';

const ITEM = IDS.uuid(200);
const ACC_IG = IDS.uuid(300);
const ACC_LI = IDS.uuid(301);

const call = (query = '', itemId = ITEM) => GET(
  new NextRequest(`http://localhost/api/content/${itemId}/publish-targets${query}`),
  { params: Promise.resolve({ itemId }) },
);

beforeEach(() => {
  db.reset();
  vi.mocked(getAuthFromRequest).mockResolvedValue(AUTH as never);
  seedWorkspace(db);
  db.seed('kefy_content_items', [{
    id: ITEM, org_id: IDS.ORG, brand_id: IDS.BRAND, title: 'Lanzamiento', body: 'Hola', image_url: 'https://cdn.test/a.jpg',
    hashtags: [], channel: 'instagram', status: 'published', content_type: 'post', slides: null, video_url: null,
  }]);
  db.seed('kefy_social_accounts', [
    { id: ACC_IG, org_id: IDS.ORG, brand_id: IDS.BRAND, status: 'active', platform: 'instagram', username: 'acme' },
    { id: ACC_LI, org_id: IDS.ORG, brand_id: IDS.BRAND, status: 'active', platform: 'linkedin', username: 'acme' },
  ]);
  db.seed('kefy_scheduled_posts', [{
    id: IDS.uuid(500), org_id: IDS.ORG, brand_id: IDS.BRAND, content_item_id: ITEM, social_account_id: ACC_IG,
    status: 'published', format: 'post', published_at: '2026-11-01T10:00:00Z', platform_post_url: null,
  }]);
});

describe('GET /api/content/[itemId]/publish-targets', () => {
  it('sin sesión → 401', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it('un post publicado en Instagram recomienda LinkedIn', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.format).toBe('post');
    expect(body.suggested_account_ids).toEqual([ACC_LI]);
    expect(body.targets.map((t: { state: string }) => t.state)).toEqual(['published', 'available']);
  });

  it('acepta ?format y rechaza uno inválido', async () => {
    expect((await call('?format=reel')).status).toBe(200);
    expect((await call('?format=gif')).status).toBe(422);
  });

  it('un contenido de otra organización → 404', async () => {
    db.seed('kefy_content_items', [{ id: IDS.uuid(201), org_id: IDS.OTHER_ORG, brand_id: IDS.OTHER_BRAND, content_type: 'post', status: 'draft' }]);
    expect((await call('', IDS.uuid(201))).status).toBe(404);
  });
});
