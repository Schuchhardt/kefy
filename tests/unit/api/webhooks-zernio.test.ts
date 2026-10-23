// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb } from '../helpers/fake-db';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/engagement-executor', () => ({ executeEngagementRules: vi.fn() }));

import { POST } from '@/app/api/webhooks/zernio/route';

function send(body: unknown) {
  return POST(new NextRequest('http://localhost/api/webhooks/zernio', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  }));
}

const post = () => db.rows('kefy_scheduled_posts')[0];

beforeEach(() => {
  db.reset();
  db.seed('kefy_scheduled_posts', [{
    id: 'sp1', zernio_post_id: 'zp1', status: 'scheduled', platform_post_id: null, platform_post_url: null,
  }]);
});

// Payloads según docs.zernio.com/webhooks/posts (ver docs/zernio.md).
describe('POST /api/webhooks/zernio — URL pública del post', () => {
  it('post.published guarda publishedUrl y el id nativo del target', async () => {
    await send({
      id: 'evt1', event: 'post.published', timestamp: '2026-10-22T10:00:00Z',
      post: {
        id: 'zp1', content: 'Hola', status: 'published', publishedAt: '2026-10-22T10:00:00Z',
        platforms: [{ platform: 'instagram', status: 'published', platformPostId: '1789', publishedUrl: 'https://www.instagram.com/p/AbC/' }],
      },
    });

    expect(post()).toMatchObject({
      status: 'published', platform_post_id: '1789', platform_post_url: 'https://www.instagram.com/p/AbC/',
    });
  });

  it('post.platform.published usa el bloque `platform`', async () => {
    await send({
      id: 'evt2', event: 'post.platform.published', timestamp: '2026-10-22T10:00:00Z',
      post: { id: 'zp1', content: 'Hola', status: 'publishing', platforms: [{ platform: 'linkedin', status: 'published' }] },
      platform: { name: 'linkedin', status: 'published', platformPostId: 'urn:li:share:1', publishedUrl: 'https://www.linkedin.com/feed/update/urn:li:share:1' },
      account: { accountId: 'acc', platform: 'linkedin', username: 'acme' },
    });

    expect(post().platform_post_url).toBe('https://www.linkedin.com/feed/update/urn:li:share:1');
    expect(post().platform_post_id).toBe('urn:li:share:1');
  });

  it('un post.published sin URL (TikTok) no borra la que ya hubiera', async () => {
    db.reset();
    db.seed('kefy_scheduled_posts', [{ id: 'sp1', zernio_post_id: 'zp1', status: 'published', platform_post_url: 'https://www.tiktok.com/@acme/video/1' }]);

    await send({
      id: 'evt3', event: 'post.published', timestamp: '2026-10-22T10:00:00Z',
      post: { id: 'zp1', content: '', status: 'published', platforms: [{ platform: 'tiktok', status: 'published' }] },
    });

    expect(post().platform_post_url).toBe('https://www.tiktok.com/@acme/video/1');
  });

  it('post.tiktok.url_resolved completa la URL después', async () => {
    db.reset();
    db.seed('kefy_scheduled_posts', [{ id: 'sp1', zernio_post_id: 'zp1', status: 'published', platform_post_url: null }]);

    await send({
      id: 'evt4', event: 'post.tiktok.url_resolved', timestamp: '2026-10-22T10:05:00Z',
      post: { id: 'zp1', content: '', status: 'published', platforms: [{ platform: 'tiktok', status: 'published' }] },
      platform: { name: 'tiktok', status: 'published', platformPostId: '7300', publishedUrl: 'https://www.tiktok.com/@acme/video/7300' },
      account: { accountId: 'acc', platform: 'tiktok', username: 'acme' },
    });

    expect(post()).toMatchObject({ status: 'published', platform_post_url: 'https://www.tiktok.com/@acme/video/7300', platform_post_id: '7300' });
  });

  it('descarta una URL que no es http(s)', async () => {
    await send({
      id: 'evt5', event: 'post.published', timestamp: '2026-10-22T10:00:00Z',
      post: { id: 'zp1', content: 'x', status: 'published', platforms: [{ platform: 'x', status: 'published', publishedUrl: 'javascript:alert(1)' }] },
    });

    expect(post().status).toBe('published');
    expect(post().platform_post_url).toBeNull();
  });
});
