// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';
import { resetQuotaState, resetSubscriptionState } from '../../helpers/quota';
import { IDS, AUTH, seedWorkspace, apiCtx } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

const zernio = vi.hoisted(() => ({
  publishPost: vi.fn(),
  cancelPost: vi.fn(),
}));
vi.mock('@/lib/zernio', () => ({
  publishPost: zernio.publishPost,
  cancelPost: zernio.cancelPost,
  STORY_CAPABLE_PLATFORMS: new Set(['instagram', 'facebook']),
}));
vi.mock('@/lib/publish-images', () => ({
  prepareSingleImage: vi.fn(async (url: string) => url),
  prepareCarouselSlides: vi.fn(async (slides: Array<{ image_url: string }>) => slides.map((s) => s.image_url)),
}));

import { publishContent, cancelScheduledPost } from '@/lib/services/publish';
import { serviceContext } from '@/lib/services/context';
import { ServiceError } from '@/lib/services/errors';
import { executeTool } from '@/lib/assistant/registry';
import { ensureToolsRegistered } from '@/lib/assistant/tools';
import { chatToolContext } from '@/lib/assistant/context';

const strict = serviceContext(AUTH, IDS.BRAND, 'en', { brandScope: 'strict', source: 'api' });

const ITEM = IDS.uuid(200);
const ITEM_OTHER_BRAND = IDS.uuid(201);
const ACC = IDS.uuid(300);
const ACC_2 = IDS.uuid(304);
const ACC_OTHER_BRAND = IDS.uuid(301);
const ACC_OTHER_ORG = IDS.uuid(302);
const ACC_INACTIVE = IDS.uuid(303);

beforeEach(() => {
  db.reset();
  resetQuotaState();
  resetSubscriptionState();
  vi.clearAllMocks();
  seedWorkspace(db);
  db.seed('kefy_content_items', [
    {
      id: ITEM, org_id: IDS.ORG, brand_id: IDS.BRAND, title: 'Lanzamiento', body: 'Hola mundo',
      image_url: 'https://cdn.test/img.jpg', hashtags: ['cafe'], channel: 'instagram', status: 'approved',
      content_type: 'post', slides: null, video_url: null, mux_playback_id: null,
    },
    {
      id: ITEM_OTHER_BRAND, org_id: IDS.ORG, brand_id: IDS.BRAND_2, title: 'Otra', body: 'x',
      image_url: null, hashtags: [], status: 'approved', content_type: 'post', slides: null, video_url: null,
    },
  ]);
  db.seed('kefy_social_accounts', [
    { id: ACC, org_id: IDS.ORG, brand_id: IDS.BRAND, status: 'active', platform: 'instagram', zernio_account_id: 'z1', username: 'acme' },
    { id: ACC_2, org_id: IDS.ORG, brand_id: IDS.BRAND, status: 'active', platform: 'facebook', zernio_account_id: 'z2', username: 'acme' },
    { id: ACC_OTHER_BRAND, org_id: IDS.ORG, brand_id: IDS.BRAND_2, status: 'active', platform: 'instagram', zernio_account_id: 'z3' },
    { id: ACC_OTHER_ORG, org_id: IDS.OTHER_ORG, brand_id: IDS.OTHER_BRAND, status: 'active', platform: 'instagram', zernio_account_id: 'z4' },
    { id: ACC_INACTIVE, org_id: IDS.ORG, brand_id: IDS.BRAND, status: 'disconnected', platform: 'linkedin', zernio_account_id: 'z5' },
  ]);
  zernio.publishPost.mockImplementation(async (p: { account_id: string }) => ({
    post_id: `zp-${p.account_id}`, status: 'published', platform_post_id: `pp-${p.account_id}`,
  }));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })));
});

afterEach(() => { vi.unstubAllGlobals(); });

const posts = () => db.rows('kefy_scheduled_posts');
const item = () => db.rows('kefy_content_items').find((i) => i.id === ITEM)!;

describe('publishContent (now)', () => {
  it('publica en las cuentas de la marca y guarda cada publicación con su marca y autor', async () => {
    const out = await publishContent(strict, { itemId: ITEM, accountIds: [ACC, ACC_2], mode: 'now', requestIdBase: 'act-1' });

    expect(out.status).toBe(200);
    expect(out.body.results.map((r) => r.status)).toEqual(['published', 'published']);
    expect(zernio.publishPost).toHaveBeenCalledTimes(2);
    expect(posts()).toHaveLength(2);
    expect(posts().every((p) => p.brand_id === IDS.BRAND && p.created_by === IDS.USER && p.status === 'published'))
      .toBe(true);
    expect(item().status).toBe('published');
  });

  it('manda a Zernio un request_id estable por cuenta', async () => {
    await publishContent(strict, { itemId: ITEM, accountIds: [ACC, ACC_2], mode: 'now', requestIdBase: 'act-1' });

    const ids = zernio.publishPost.mock.calls.map((c) => (c[0] as { request_id?: string }).request_id);
    expect(ids).toEqual([`act-1:${ACC}`, `act-1:${ACC_2}`]);
  });

  it('sin requestIdBase no manda request_id (las rutas de la UI no cambian)', async () => {
    await publishContent(strict, { itemId: ITEM, accountIds: [ACC], mode: 'now' });
    expect((zernio.publishPost.mock.calls[0][0] as { request_id?: string }).request_id).toBeUndefined();
  });

  it('el contenido de otra marca es 404 y no toca Zernio', async () => {
    const err = await publishContent(strict, { itemId: ITEM_OTHER_BRAND, accountIds: [ACC_OTHER_BRAND], mode: 'now' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ServiceError);
    expect(err.status).toBe(404);
    expect(zernio.publishPost).not.toHaveBeenCalled();
  });

  it('las cuentas de otra marca, otra organización o inactivas se informan como fallidas y no se publican', async () => {
    const out = await publishContent(strict, {
      itemId: ITEM, accountIds: [ACC, ACC_OTHER_BRAND, ACC_OTHER_ORG, ACC_INACTIVE], mode: 'now',
    });

    expect(zernio.publishPost).toHaveBeenCalledTimes(1);
    expect((zernio.publishPost.mock.calls[0][0] as { account_id: string }).account_id).toBe('z1');
    const byId = Object.fromEntries(out.body.results.map((r) => [r.social_account_id, r]));
    expect(byId[ACC].status).toBe('published');
    for (const id of [ACC_OTHER_BRAND, ACC_OTHER_ORG, ACC_INACTIVE]) {
      expect(byId[id]).toMatchObject({ status: 'failed', platform: null });
    }
    // Solo la cuenta real deja fila: no se escriben filas para cuentas ajenas.
    expect(posts().map((p) => p.social_account_id)).toEqual([ACC]);
  });

  it('si ninguna cuenta pedida es de la marca → 404', async () => {
    const err = await publishContent(strict, { itemId: ITEM, accountIds: [ACC_OTHER_BRAND], mode: 'now' }).catch((e) => e);
    expect(err.status).toBe(404);
    expect(zernio.publishPost).not.toHaveBeenCalled();
  });

  it('si todo falla: 502, filas fallidas y el contenido vuelve a approved', async () => {
    zernio.publishPost.mockRejectedValue(new Error('Zernio down'));

    const out = await publishContent(strict, { itemId: ITEM, accountIds: [ACC], mode: 'now' });

    expect(out.status).toBe(502);
    expect(out.body.results[0]).toMatchObject({ status: 'failed', error: 'Zernio down' });
    expect(posts()[0]).toMatchObject({ status: 'failed', error_message: 'Zernio down' });
    expect(item().status).toBe('approved');
  });

  it('un fallo parcial no aborta el resto', async () => {
    zernio.publishPost
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce({ post_id: 'zp', status: 'published', platform_post_id: 'pp' });

    const out = await publishContent(strict, { itemId: ITEM, accountIds: [ACC, ACC_2], mode: 'now' });

    expect(out.status).toBe(200);
    expect(out.body.results.map((r) => r.status)).toEqual(['failed', 'published']);
  });
});

describe('publishContent (schedule)', () => {
  const future = () => new Date(Date.now() + 3600_000).toISOString();

  it('programa y guarda solo las filas programadas; el contenido pasa a scheduled', async () => {
    const when = future();
    const out = await publishContent(strict, { itemId: ITEM, accountIds: [ACC], mode: 'schedule', scheduledAt: when });

    expect(out.status).toBe(201);
    expect((zernio.publishPost.mock.calls[0][0] as { scheduled_at?: string }).scheduled_at).toBe(when);
    expect(posts()[0]).toMatchObject({ status: 'scheduled', scheduled_at: when, brand_id: IDS.BRAND });
    expect(item().status).toBe('scheduled');
  });

  it('una fecha pasada → 422 sin tocar Zernio', async () => {
    const err = await publishContent(strict, {
      itemId: ITEM, accountIds: [ACC], mode: 'schedule', scheduledAt: new Date(Date.now() - 1000).toISOString(),
    }).catch((e) => e);

    expect(err.status).toBe(422);
    expect(zernio.publishPost).not.toHaveBeenCalled();
  });
});

describe('cancelScheduledPost', () => {
  const POST = IDS.uuid(500);

  function seedPost(row: Record<string, unknown> = {}) {
    db.seed('kefy_scheduled_posts', [{
      id: POST, org_id: IDS.ORG, brand_id: IDS.BRAND, content_item_id: ITEM, status: 'scheduled',
      zernio_post_id: 'zp-1', kefy_content_items: { brand_id: IDS.BRAND }, ...row,
    }]);
  }

  it('cancela en Zernio y en Kefy; si era la última, el contenido vuelve a approved', async () => {
    seedPost();
    item().status = 'scheduled';

    const r = await cancelScheduledPost(strict, POST);

    expect(r.itemReverted).toBe(true);
    expect(zernio.cancelPost).toHaveBeenCalledWith('zp-1');
    expect(posts()[0].status).toBe('cancelled');
    expect(item().status).toBe('approved');
  });

  it('una publicación ya publicada no se cancela (409)', async () => {
    seedPost({ status: 'published' });
    const err = await cancelScheduledPost(strict, POST).catch((e) => e);
    expect(err.status).toBe(409);
    expect(zernio.cancelPost).not.toHaveBeenCalled();
  });

  it('una publicación de otra marca es 404', async () => {
    seedPost({ brand_id: IDS.BRAND_2, kefy_content_items: { brand_id: IDS.BRAND_2 } });
    const err = await cancelScheduledPost(strict, POST).catch((e) => e);
    expect(err.status).toBe(404);
    expect(posts()[0].status).toBe('scheduled');
  });
});

// ─── A través del registro (herramienta publish_content) ─────────────────────

describe('herramienta publish_content', () => {
  beforeEach(() => { ensureToolsRegistered(); });

  it('por la API publica con un request_id basado en la fila de auditoría', async () => {
    const r = await executeTool('publish_content', {
      item_id: ITEM, social_account_ids: [ACC], when: 'now',
    }, apiCtx({ brandId: IDS.BRAND }));

    expect(r.ok).toBe(true);
    const audit = db.rows('kefy_assistant_actions')[0];
    expect(audit).toMatchObject({ tool_name: 'publish_content', status: 'succeeded', kind: 'publish' });
    expect((zernio.publishPost.mock.calls[0][0] as { request_id: string }).request_id).toBe(`${audit.id}:${ACC}`);
  });

  it('si todas las cuentas fallan la herramienta falla (no es un éxito con errores dentro)', async () => {
    zernio.publishPost.mockRejectedValue(new Error('Zernio down'));

    const r = await executeTool('publish_content', {
      item_id: ITEM, social_account_ids: [ACC], when: 'now',
    }, apiCtx({ brandId: IDS.BRAND }));

    expect(r).toMatchObject({ ok: false, error: { code: 'provider_error', status: 502 } });
    if (r.ok === false) expect(Array.isArray(r.error.body?.results)).toBe(true);
    expect(db.rows('kefy_assistant_actions')[0].status).toBe('failed');
  });

  it('una key de solo lectura no puede publicar', async () => {
    const r = await executeTool('publish_content', {
      item_id: ITEM, social_account_ids: [ACC], when: 'now',
    }, apiCtx({ brandId: IDS.BRAND, scopes: ['read', 'write'] }));

    expect(r).toMatchObject({ ok: false, error: { code: 'scope_denied' } });
    expect(zernio.publishPost).not.toHaveBeenCalled();
  });

  it('una key atada a una marca no publica contenido de otra marca', async () => {
    const r = await executeTool('publish_content', {
      item_id: ITEM_OTHER_BRAND, social_account_ids: [ACC_OTHER_BRAND], when: 'now',
    }, apiCtx({ boundBrandId: IDS.BRAND }));

    expect(r).toMatchObject({ ok: false, error: { status: 404 } });
    expect(zernio.publishPost).not.toHaveBeenCalled();
  });
});

// ─── En el chat: la tarjeta muestra lo que se publica ────────────────────────

describe('herramienta publish_content en el chat', () => {
  beforeEach(() => { ensureToolsRegistered(); });

  const chat = () => chatToolContext({
    auth: AUTH, brandId: IDS.BRAND, language: 'es', conversationId: IDS.uuid(100), turnId: IDS.uuid(101), tainted: true,
  });
  const input = { item_id: ITEM, social_account_ids: [ACC], when: 'now' };
  const pendingRow = () => db.rows('kefy_assistant_actions')[0];

  it('la tarjeta de confirmación trae el texto y los hashtags que se van a publicar', async () => {
    const r = await executeTool('publish_content', input, chat());

    expect(r.ok).toBe('pending');
    if (r.ok !== 'pending') return;
    expect(String(r.preview.text)).toContain('Hola mundo');
    expect(r.preview.hashtags).toEqual(['#cafe']);
    expect(r.preview.accounts).toEqual(['@acme (instagram)']);
  });

  it('con otro formato muestra el texto de la rendición, que es lo que se publica', async () => {
    db.seed('kefy_content_renditions', [{
      content_item_id: ITEM, format: 'story', status: 'ready', body: 'Texto de la story', hashtags: [], slides: null,
      image_url: 'https://cdn.test/story.jpg', video_url: null,
    }]);

    const r = await executeTool('publish_content', { ...input, format: 'story' }, chat());

    if (r.ok !== 'pending') throw new Error('se esperaba pending');
    expect(String(r.preview.text)).toContain('Texto de la story');
    expect(String(r.preview.text)).not.toContain('Hola mundo');
  });

  it('confirmar sin cambios publica', async () => {
    const r = await executeTool('publish_content', input, chat());
    if (r.ok !== 'pending') throw new Error('se esperaba pending');
    const hash = (pendingRow().result as { snapshot_hash: string }).snapshot_hash;
    Object.assign(pendingRow(), { status: 'running' });

    const done = await executeTool('publish_content', input, chat(), {
      confirmed: true, claimedActionId: r.actionId, expectedSnapshotHash: hash,
    });

    expect(done.ok).toBe(true);
    expect(zernio.publishPost).toHaveBeenCalledTimes(1);
  });

  it('si el texto cambió entre la tarjeta y el clic no publica (409 content_changed)', async () => {
    const r = await executeTool('publish_content', input, chat());
    if (r.ok !== 'pending') throw new Error('se esperaba pending');
    const hash = (pendingRow().result as { snapshot_hash: string }).snapshot_hash;
    Object.assign(pendingRow(), { status: 'running' });

    item().body = 'Oferta: entra en https://phish.example';

    const done = await executeTool('publish_content', input, chat(), {
      confirmed: true, claimedActionId: r.actionId, expectedSnapshotHash: hash,
    });

    expect(done).toMatchObject({ ok: false, error: { code: 'content_changed', status: 409 } });
    expect(zernio.publishPost).not.toHaveBeenCalled();
  });
});
