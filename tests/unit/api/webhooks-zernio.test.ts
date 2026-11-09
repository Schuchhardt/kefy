// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';
import { createFakeDb } from '../helpers/fake-db';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/engagement-executor', () => ({ executeEngagementRules: vi.fn() }));

// `after()` necesita el contexto de una petición de Next: aquí se guardan las
// tareas y el test decide cuándo correrlas, igual que tras enviar la respuesta.
const pendingAfter: Array<() => unknown> = [];
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => unknown) => { pendingAfter.push(task); },
}));
async function flushAfter() {
  while (pendingAfter.length) await pendingAfter.shift()!();
}

import { POST } from '@/app/api/webhooks/zernio/route';
import { executeEngagementRules } from '@/lib/engagement-executor';

const SECRET = 'test-webhook-secret';
process.env.ZERNIO_WEBHOOK_SECRET = SECRET;

function sign(raw: string, secret = SECRET) {
  return `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
}

function send(body: unknown, signature?: string | null) {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const sig = signature === undefined ? sign(raw) : signature;
  if (sig) headers['x-zernio-signature'] = sig;
  return POST(new NextRequest('http://localhost/api/webhooks/zernio', { method: 'POST', body: raw, headers }));
}

describe('POST /api/webhooks/zernio — firma', () => {
  const evt = { event: 'post.failed', post: { id: 'zp1' } };
  beforeEach(() => {
    db.reset();
    db.seed('kefy_scheduled_posts', [{ id: 'sp1', zernio_post_id: 'zp1', status: 'scheduled' }]);
  });

  it('rechaza sin firma, con firma errónea o firmada con otro secreto', async () => {
    for (const sig of [null, 'sha256=deadbeef', sign(JSON.stringify(evt), 'otro')]) {
      expect((await send(evt, sig)).status).toBe(401);
    }
    expect(db.rows('kefy_scheduled_posts')[0].status).toBe('scheduled');
  });

  it('rechaza todo si no hay secreto configurado', async () => {
    delete process.env.ZERNIO_WEBHOOK_SECRET;
    try {
      expect((await send(evt, sign(JSON.stringify(evt)))).status).toBe(401);
    } finally { process.env.ZERNIO_WEBHOOK_SECRET = SECRET; }
  });

  it('acepta una firma válida', async () => {
    expect((await send(evt)).status).toBe(200);
    expect(db.rows('kefy_scheduled_posts')[0].status).toBe('failed');
  });
});

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

  it('sin publishedAt, la fecha de publicación es el timestamp del evento (no la hora de una reentrega)', async () => {
    // Forma real de un post.published de Zernio: ni el post ni el target traen publishedAt.
    await send({
      id: 'evt3', event: 'post.published', timestamp: '2026-11-05T22:02:55.000Z',
      post: {
        id: 'zp1', status: 'published', scheduledFor: '2026-11-05T22:00:00.000Z',
        platforms: [{ platform: 'instagram', status: 'published', platformPostId: '1789', publishedUrl: 'https://www.instagram.com/p/AbC/' }],
      },
    });
    expect(post().published_at).toBe('2026-11-05T22:02:55.000Z');
  });

  it('prefiere el publishedAt del target al timestamp del evento', async () => {
    await send({
      id: 'evt4', event: 'post.published', timestamp: '2026-11-08T22:05:00.000Z',
      post: { id: 'zp1', status: 'published', platforms: [{ platform: 'instagram', status: 'published', publishedAt: '2026-11-08T22:01:55.829Z' }] },
    });
    expect(post().published_at).toBe('2026-11-08T22:01:55.829Z');
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

// post.scheduled no traía la fecha al normalizar (Zernio la manda como
// `scheduledFor`) y dejaba scheduled_at en NULL: la publicación desaparecía del
// calendario.
describe('POST /api/webhooks/zernio — fecha programada', () => {
  beforeEach(() => {
    db.reset();
    db.seed('kefy_scheduled_posts', [{ id: 'sp1', zernio_post_id: 'zp1', status: 'pending', scheduled_at: '2026-11-05T15:00:00.000Z' }]);
  });

  it('post.scheduled guarda scheduledFor', async () => {
    await send({
      id: 'evt-s1', event: 'post.scheduled', timestamp: '2026-11-02T10:00:00Z',
      post: { id: 'zp1', content: 'Hola', status: 'scheduled', scheduledFor: '2026-11-06T12:00:00.000Z', platforms: [] },
    });
    expect(post()).toMatchObject({ status: 'scheduled', scheduled_at: '2026-11-06T12:00:00.000Z' });
  });

  it('post.scheduled sin fecha conserva la que guardó Kefy', async () => {
    await send({
      id: 'evt-s2', event: 'post.scheduled', timestamp: '2026-11-02T10:00:00Z',
      post: { id: 'zp1', content: 'Hola', status: 'scheduled', platforms: [] },
    });
    expect(post()).toMatchObject({ status: 'scheduled', scheduled_at: '2026-11-05T15:00:00.000Z' });
  });

  it('un post.scheduled que llega después de post.published no lo devuelve a programado', async () => {
    db.reset();
    db.seed('kefy_scheduled_posts', [{ id: 'sp1', zernio_post_id: 'zp1', status: 'published', scheduled_at: '2026-11-05T15:00:00.000Z' }]);
    await send({
      id: 'evt-s3', event: 'post.scheduled', timestamp: '2026-11-02T10:00:00Z',
      post: { id: 'zp1', content: 'Hola', status: 'scheduled', platforms: [] },
    });
    expect(post().status).toBe('published');
  });
});

describe('POST /api/webhooks/zernio — respuestas automáticas', () => {
  beforeEach(() => {
    vi.mocked(executeEngagementRules).mockClear();
    pendingAfter.length = 0;
    db.seed('kefy_social_accounts', [{ id: 'sa1', org_id: 'o1', brand_id: 'b1', zernio_account_id: 'acc' }]);
  });

  const comment = {
    id: 'evt-c', event: 'comment.received', timestamp: '2026-10-22T10:00:00Z',
    account: { id: 'acc', platform: 'instagram', username: 'acme' },
    comment: { id: 'c1', postId: 'zp1', platformPostId: '1789', platform: 'instagram', text: '¿Precio?', author: { id: 'u1', username: 'ana', avatar: 'https://x/a.png' } },
  };

  it('responde antes de correr las reglas (Zernio da 5 s y si no pausa el endpoint)', async () => {
    const res = await send(comment);
    expect(res.status).toBe(200);
    expect(db.rows('kefy_comments')).toHaveLength(1);
    expect(executeEngagementRules).not.toHaveBeenCalled();
    await flushAfter();
    expect(executeEngagementRules).toHaveBeenCalledTimes(1);
  });

  it('si las reglas fallan después de responder, el webhook ya respondió 200', async () => {
    vi.mocked(executeEngagementRules).mockRejectedValueOnce(new Error('IA caída'));
    expect((await send(comment)).status).toBe(200);
    await expect(flushAfter()).resolves.toBeUndefined();
  });

  it('un comentario dispara las reglas una sola vez aunque Zernio reintente el webhook', async () => {
    await send(comment);
    await send(comment);
    await flushAfter();
    expect(db.rows('kefy_comments')).toHaveLength(1);
    expect(executeEngagementRules).toHaveBeenCalledTimes(1);
    expect(executeEngagementRules).toHaveBeenCalledWith(expect.anything(), 'o1', expect.objectContaining({
      type: 'new_comment', brandId: 'b1', commentId: 'c1', authorId: 'u1', authorName: 'ana', authorAvatar: 'https://x/a.png',
    }));
  });

  it('un DM repetido tampoco vuelve a responder, y lleva el id del mensaje', async () => {
    const dm = {
      id: 'evt-m', event: 'message.received', timestamp: '2026-10-22T10:00:00Z',
      account: { id: 'acc', platform: 'instagram', username: 'acme' },
      message: { id: 'm1', conversationId: 't1', text: 'Hola', sender: { id: 'u2', name: 'Beto' }, direction: 'inbound' },
    };
    await send(dm);
    await send(dm);
    await flushAfter();
    expect(executeEngagementRules).toHaveBeenCalledTimes(1);
    expect(executeEngagementRules).toHaveBeenCalledWith(expect.anything(), 'o1', expect.objectContaining({
      type: 'new_dm', messageId: 'm1', senderId: 'u2', senderName: 'Beto',
    }));
  });
});

describe('POST /api/webhooks/zernio — estado del contenido', () => {
  const item = () => db.rows('kefy_content_items')[0];
  const row = (id: string) => db.rows('kefy_scheduled_posts').find((r) => r.id === id)!;

  beforeEach(() => {
    db.reset();
    db.seed('kefy_content_items', [{ id: 'ci1', status: 'scheduled' }]);
    db.seed('kefy_scheduled_posts', [{ id: 'a', zernio_post_id: 'za', content_item_id: 'ci1', status: 'scheduled' }]);
  });

  it('post.published pasa el contenido de programado a publicado', async () => {
    await send({ event: 'post.published', post: { id: 'za' } });
    expect(item().status).toBe('published');
  });

  it('con otra red aún por salir, ya cuenta como publicado', async () => {
    db.seed('kefy_scheduled_posts', [{ id: 'b', zernio_post_id: 'zb', content_item_id: 'ci1', status: 'scheduled' }]);
    await send({ event: 'post.published', post: { id: 'za' } });
    expect(item().status).toBe('published');
    await send({ event: 'post.platform.published', post: { id: 'zb' } });
    expect(item().status).toBe('published');
  });

  it('si todo falla vuelve a aprobado; si una red salió, queda publicado', async () => {
    db.seed('kefy_scheduled_posts', [{ id: 'b', zernio_post_id: 'zb', content_item_id: 'ci1', status: 'scheduled' }]);
    await send({ event: 'post.failed', post: { id: 'za' } });
    expect(item().status).toBe('scheduled');
    await send({ event: 'post.published', post: { id: 'zb' } });
    expect(item().status).toBe('published');

    db.reset();
    db.seed('kefy_content_items', [{ id: 'ci1', status: 'scheduled' }]);
    db.seed('kefy_scheduled_posts', [{ id: 'a', zernio_post_id: 'za', content_item_id: 'ci1', status: 'scheduled' }]);
    await send({ event: 'post.failed', post: { id: 'za' } });
    expect(item().status).toBe('approved');
  });

  it('post.recycled lo vuelve a programado', async () => {
    db.reset();
    db.seed('kefy_content_items', [{ id: 'ci1', status: 'published' }]);
    db.seed('kefy_scheduled_posts', [{ id: 'a', zernio_post_id: 'za', content_item_id: 'ci1', status: 'published' }]);
    await send({ event: 'post.recycled', post: { id: 'za', scheduledFor: '2027-01-01T00:00:00Z' } });
    expect(item().status).toBe('scheduled');
  });

  it('no toca un contenido archivado', async () => {
    db.reset();
    db.seed('kefy_content_items', [{ id: 'ci1', status: 'archived' }]);
    db.seed('kefy_scheduled_posts', [{ id: 'a', zernio_post_id: 'za', content_item_id: 'ci1', status: 'scheduled' }]);
    await send({ event: 'post.published', post: { id: 'za' } });
    expect(item().status).toBe('archived');
  });

  it('un evento no resucita una publicación borrada', async () => {
    db.reset();
    db.seed('kefy_content_items', [{ id: 'ci1', status: 'approved' }]);
    db.seed('kefy_scheduled_posts', [{ id: 'a', zernio_post_id: 'za', content_item_id: 'ci1', status: 'deleted' }]);
    for (const event of ['post.cancelled', 'post.published', 'post.scheduled', 'post.failed']) {
      await send({ event, post: { id: 'za' } });
      expect(row('a').status).toBe('deleted');
    }
    expect(item().status).toBe('approved');
  });
});
