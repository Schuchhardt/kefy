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
  updatePost: vi.fn(),
}));
vi.mock('@/lib/zernio', () => ({
  publishPost: zernio.publishPost,
  cancelPost: zernio.cancelPost,
  updatePost: zernio.updatePost,
  STORY_CAPABLE_PLATFORMS: new Set(['instagram', 'facebook']),
}));
vi.mock('@/lib/publish-images', () => ({
  prepareSingleImage: vi.fn(async (url: string) => url),
  prepareCarouselSlides: vi.fn(async (slides: Array<{ image_url: string }>) => slides.map((s) => s.image_url)),
}));

import {
  publishContent, cancelScheduledPost, rescheduleScheduledPost, syncScheduledPosts, listPublishTargets,
} from '@/lib/services/publish';
import { updateContent } from '@/lib/services/content';
import { prepareSingleImage } from '@/lib/publish-images';
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

  it('guarda la URL pública que da Zernio y la devuelve para «Ver publicado»', async () => {
    zernio.publishPost.mockResolvedValueOnce({
      post_id: 'zp-1', status: 'published', platform_post_id: '1789',
      platform_post_url: 'https://www.instagram.com/p/AbC123/',
    });

    const out = await publishContent(strict, { itemId: ITEM, accountIds: [ACC], mode: 'now' });

    expect(out.body.results[0].post_url).toBe('https://www.instagram.com/p/AbC123/');
    expect(posts()[0].platform_post_url).toBe('https://www.instagram.com/p/AbC123/');
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

// Regresión: una story subida a mano con solo una imagen fallaba al publicar o
// programar con «Content has no body text».
describe('publishContent — story solo imagen', () => {
  const STORY = IDS.uuid(210);
  const seedStory = (fields: Record<string, unknown>) => db.seed('kefy_content_items', [{
    id: STORY, org_id: IDS.ORG, brand_id: IDS.BRAND, title: null, body: null,
    image_url: 'https://cdn.test/story.jpg', hashtags: [], channel: 'generic', status: 'approved',
    content_type: 'story', slides: null, video_url: null, mux_playback_id: null, ...fields,
  }]);

  it('se publica con la imagen y sin texto, y no se quema un caption vacío', async () => {
    seedStory({});
    const out = await publishContent(strict, { itemId: STORY, accountIds: [ACC], mode: 'now' });

    expect(out.status).toBe(200);
    const payload = zernio.publishPost.mock.calls[0][0] as { text: string; image_url?: string; content_type: string };
    expect(payload.text).toBe('');
    expect(payload.image_url).toBe('https://cdn.test/story.jpg');
    expect(payload.content_type).toBe('story');
    expect(vi.mocked(prepareSingleImage).mock.calls[0][5]).toBeFalsy();
  });

  it('con el texto generado en la imagen no le escribe el caption encima', async () => {
    seedStory({ body: 'Mi caption', metadata: { image_text: 'generated' } });
    await publishContent(strict, { itemId: STORY, accountIds: [ACC], mode: 'now' });
    expect(vi.mocked(prepareSingleImage).mock.calls[0][5]).toBeUndefined();
  });

  it('con texto propio escribe ese, no el caption', async () => {
    seedStory({ body: 'Mi caption', metadata: { image_text: 'overlay', image_overlay: { title: 'Hola', body: 'Mundo' } } });
    await publishContent(strict, { itemId: STORY, accountIds: [ACC], mode: 'now' });
    expect(vi.mocked(prepareSingleImage).mock.calls[0][5]).toEqual({ title: 'Hola', body: 'Mundo' });
  });

  it('también se programa', async () => {
    seedStory({});
    const out = await publishContent(strict, {
      itemId: STORY, accountIds: [ACC], mode: 'schedule',
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(out.status).toBe(201);
    expect((zernio.publishPost.mock.calls[0][0] as { image_url?: string }).image_url).toBe('https://cdn.test/story.jpg');
  });

  it('una story sin imagen ni video → 422 sin tocar Zernio', async () => {
    seedStory({ body: 'Solo texto', image_url: null });
    await expect(publishContent(strict, { itemId: STORY, accountIds: [ACC], mode: 'now' }))
      .rejects.toMatchObject({ status: 422 });
    expect(zernio.publishPost).not.toHaveBeenCalled();
  });

  it('un post solo imagen también se publica', async () => {
    seedStory({ content_type: 'post' });
    const out = await publishContent(strict, { itemId: STORY, accountIds: [ACC], mode: 'now' });
    expect(out.status).toBe(200);
  });
});

describe('publishContent — post con texto sobre la imagen', () => {
  const POST_ID = IDS.uuid(211);
  const seedPost = (metadata: unknown) => db.seed('kefy_content_items', [{
    id: POST_ID, org_id: IDS.ORG, brand_id: IDS.BRAND, title: null, body: 'Un caption largo',
    image_url: 'https://cdn.test/post.jpg', hashtags: [], channel: 'generic', status: 'approved',
    content_type: 'post', slides: null, video_url: null, mux_playback_id: null, metadata,
  }]);

  it('overlay escribe el texto editable, y no el caption', async () => {
    seedPost({ image_text: 'overlay', image_overlay: { title: 'Hola', body: '' } });
    await publishContent(strict, { itemId: POST_ID, accountIds: [ACC], mode: 'now' });
    expect(vi.mocked(prepareSingleImage).mock.calls[0][5]).toEqual({ title: 'Hola', body: '' });
  });

  it('un post anterior a la opción no recibe texto', async () => {
    seedPost(null);
    await publishContent(strict, { itemId: POST_ID, accountIds: [ACC], mode: 'now' });
    expect(vi.mocked(prepareSingleImage).mock.calls[0][5]).toBeUndefined();
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

// ─── Editar lo programado ────────────────────────────────────────────────────

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

describe('rescheduleScheduledPost', () => {
  const POST = IDS.uuid(510);

  function seedPost(row: Record<string, unknown> = {}) {
    db.seed('kefy_scheduled_posts', [{
      id: POST, org_id: IDS.ORG, brand_id: IDS.BRAND, content_item_id: ITEM, status: 'scheduled',
      zernio_post_id: 'zp-1', scheduled_at: inDays(2), kefy_content_items: { brand_id: IDS.BRAND }, ...row,
    }]);
  }

  it('cambia la fecha en Zernio y en Kefy', async () => {
    seedPost();
    const at = inDays(5);
    const r = await rescheduleScheduledPost(strict, POST, { scheduledAt: at });

    expect(zernio.updatePost).toHaveBeenCalledWith('zp-1', { scheduled_at: at });
    expect(r.scheduled_at).toBe(at);
    expect(posts()[0].scheduled_at).toBe(at);
  });

  it('una fecha pasada → 422 sin tocar Zernio', async () => {
    seedPost();
    const err = await rescheduleScheduledPost(strict, POST, { scheduledAt: inDays(-1) }).catch((e) => e);
    expect(err.status).toBe(422);
    expect(zernio.updatePost).not.toHaveBeenCalled();
  });

  it('una publicación ya publicada o cuya hora ya pasó no se mueve (409)', async () => {
    seedPost({ status: 'published' });
    expect((await rescheduleScheduledPost(strict, POST, { scheduledAt: inDays(3) }).catch((e) => e)).status).toBe(409);

    db.reset(); seedWorkspace(db); seedPost({ scheduled_at: inDays(-0.01) });
    expect((await rescheduleScheduledPost(strict, POST, { scheduledAt: inDays(3) }).catch((e) => e)).status).toBe(409);
    expect(zernio.updatePost).not.toHaveBeenCalled();
  });

  it('si Zernio falla, la fecha de Kefy no cambia (502)', async () => {
    const before = inDays(2);
    seedPost({ scheduled_at: before });
    zernio.updatePost.mockRejectedValueOnce(new Error('Zernio down'));
    const err = await rescheduleScheduledPost(strict, POST, { scheduledAt: inDays(4) }).catch((e) => e);
    expect(err.status).toBe(502);
    expect(posts()[0].scheduled_at).toBe(before);
  });

  it('una publicación de otra marca es 404', async () => {
    seedPost({ brand_id: IDS.BRAND_2, kefy_content_items: { brand_id: IDS.BRAND_2 } });
    const err = await rescheduleScheduledPost(strict, POST, { scheduledAt: inDays(3) }).catch((e) => e);
    expect(err.status).toBe(404);
  });
});

describe('syncScheduledPosts — editar un contenido programado', () => {
  const account = (id: string, platform: string, zid: string) => ({ id, platform, zernio_account_id: zid });

  beforeEach(() => {
    zernio.updatePost.mockReset();
    item().status = 'scheduled';
    db.seed('kefy_scheduled_posts', [
      { id: IDS.uuid(520), org_id: IDS.ORG, brand_id: IDS.BRAND, content_item_id: ITEM, status: 'scheduled',
        zernio_post_id: 'zp-ig', scheduled_at: inDays(2), format: 'post', kefy_social_accounts: account(ACC, 'instagram', 'z1') },
      { id: IDS.uuid(521), org_id: IDS.ORG, brand_id: IDS.BRAND, content_item_id: ITEM, status: 'scheduled',
        zernio_post_id: 'zp-fb', scheduled_at: inDays(3), format: 'post', kefy_social_accounts: account(ACC_2, 'facebook', 'z2') },
      // Ya publicada: no se toca.
      { id: IDS.uuid(522), org_id: IDS.ORG, brand_id: IDS.BRAND, content_item_id: ITEM, status: 'published',
        zernio_post_id: 'zp-old', scheduled_at: inDays(-2), format: 'post', kefy_social_accounts: account(ACC, 'instagram', 'z1') },
    ]);
  });

  it('reenvía el texto y el media nuevos a cada publicación programada', async () => {
    item().body = 'Texto corregido';
    const r = await syncScheduledPosts(strict, ITEM);

    expect(r).toEqual({ updated: 2, failed: [] });
    expect(zernio.updatePost).toHaveBeenCalledTimes(2);
    const [id, { payload }] = zernio.updatePost.mock.calls.find(([zid]) => zid === 'zp-ig')!;
    expect(id).toBe('zp-ig');
    expect(payload).toMatchObject({ account_id: 'z1', platform: 'instagram', content_type: 'post', image_url: 'https://cdn.test/img.jpg' });
    expect(payload.text).toContain('Texto corregido');
    expect(payload.scheduled_at).toBeUndefined();
  });

  it('un fallo en una red se informa y no frena las demás', async () => {
    zernio.updatePost.mockImplementation(async (zid: string) => { if (zid === 'zp-fb') throw new Error('validation failed'); });
    const r = await syncScheduledPosts(strict, ITEM);

    expect(r.updated).toBe(1);
    expect(r.failed).toEqual([{ scheduled_post_id: IDS.uuid(521), platform: 'facebook', error: 'validation failed' }]);
  });

  it('updateContent sincroniza al editar el texto de un contenido programado', async () => {
    const out = await updateContent(strict, ITEM, { body: 'Nuevo' });
    expect(out.scheduled_sync).toEqual({ updated: 2, failed: [] });
  });

  it('updateContent con syncScheduled: false (autoguardado del editor) no llama a Zernio', async () => {
    const out = await updateContent(strict, ITEM, { body: 'Nuevo' }, { syncScheduled: false });
    expect(out.scheduled_sync).toBeUndefined();
    expect(zernio.updatePost).not.toHaveBeenCalled();
  });

  it('cambiar solo el título (no se publica) no sincroniza', async () => {
    await updateContent(strict, ITEM, { title: 'Otro título' });
    expect(zernio.updatePost).not.toHaveBeenCalled();
  });
});

describe('herramienta reschedule_scheduled_post', () => {
  beforeEach(() => { ensureToolsRegistered(); });

  it('por la API mueve la publicación y queda auditada como publish', async () => {
    db.seed('kefy_scheduled_posts', [{
      id: IDS.uuid(530), org_id: IDS.ORG, brand_id: IDS.BRAND, content_item_id: ITEM, social_account_id: ACC, status: 'scheduled',
      zernio_post_id: 'zp-1', scheduled_at: inDays(2), kefy_content_items: { brand_id: IDS.BRAND },
    }]);
    const at = inDays(6);
    const r = await executeTool('reschedule_scheduled_post', {
      scheduled_post_id: IDS.uuid(530), scheduled_at: at,
    }, apiCtx({ brandId: IDS.BRAND }));

    expect(r.ok).toBe(true);
    expect(zernio.updatePost).toHaveBeenCalledWith('zp-1', { scheduled_at: at });
    expect(db.rows('kefy_assistant_actions')[0]).toMatchObject({ tool_name: 'reschedule_scheduled_post', kind: 'publish', status: 'succeeded' });
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

// ─── Publicar el mismo contenido en más redes ────────────────────────────────
// Un contenido publicado o programado en una cuenta se puede llevar a las
// demás. Antes, programarlo en otra red lo devolvía a 'scheduled' (y la ficha
// dejaba editar un post que ya estaba en Instagram), y cancelar esa
// programación lo dejaba en 'approved'.

describe('publicar en otra red un contenido que ya salió', () => {
  const ACC_YT = IDS.uuid(305);
  const later = () => new Date(Date.now() + 3_600_000).toISOString();

  beforeEach(() => {
    item().status = 'published';
    db.seed('kefy_scheduled_posts', [{
      id: IDS.uuid(520), org_id: IDS.ORG, brand_id: IDS.BRAND, content_item_id: ITEM, social_account_id: ACC,
      status: 'published', format: 'post', published_at: '2026-11-01T10:00:00Z',
      platform_post_url: 'https://www.instagram.com/p/AbC/', zernio_post_id: 'zp-ig', kefy_content_items: { brand_id: IDS.BRAND },
    }]);
  });

  it('programarlo en otra cuenta no lo devuelve a scheduled', async () => {
    const out = await publishContent(strict, { itemId: ITEM, accountIds: [ACC_2], mode: 'schedule', scheduledAt: later() });
    expect(out.status).toBe(201);
    expect(item().status).toBe('published');
  });

  it('si falla publicarlo en otra cuenta sigue publicado', async () => {
    zernio.publishPost.mockRejectedValue(new Error('Zernio down'));
    const out = await publishContent(strict, { itemId: ITEM, accountIds: [ACC_2], mode: 'now' });
    expect(out.status).toBe(502);
    expect(item().status).toBe('published');
  });

  it('un contenido programado al que le falla publicar ahora en otra red sigue programado', async () => {
    item().status = 'scheduled';
    db.rows('kefy_scheduled_posts')[0].status = 'scheduled';
    zernio.publishPost.mockRejectedValue(new Error('Zernio down'));
    await publishContent(strict, { itemId: ITEM, accountIds: [ACC_2], mode: 'now' });
    expect(item().status).toBe('scheduled');
  });

  it('cancelar su programación en otra red no lo devuelve a approved', async () => {
    const out = await publishContent(strict, { itemId: ITEM, accountIds: [ACC_2], mode: 'schedule', scheduledAt: later() });
    const scheduledId = out.body.results[0].scheduled_post_id!;
    // El fake no embebe: la fila nueva necesita la marca de su contenido.
    db.rows('kefy_scheduled_posts').find((p) => p.id === scheduledId)!.kefy_content_items = { brand_id: IDS.BRAND };

    const r = await cancelScheduledPost(strict, scheduledId);

    expect(r.itemReverted).toBe(false);
    expect(item().status).toBe('published');
  });

  it('listPublishTargets: dónde está, dónde más puede ir y por qué YouTube no', async () => {
    db.seed('kefy_social_accounts', [
      { id: ACC_YT, org_id: IDS.ORG, brand_id: IDS.BRAND, status: 'active', platform: 'youtube', zernio_account_id: 'z6', username: 'acme-yt' },
    ]);

    const out = await listPublishTargets(strict, ITEM);

    expect(out).toMatchObject({ item_id: ITEM, format: 'post', primary_format: 'post', media_ready: true });
    const by = Object.fromEntries(out.targets.map((t) => [t.social_account_id, t]));
    expect(by[ACC]).toMatchObject({ state: 'published', post_url: 'https://www.instagram.com/p/AbC/' });
    expect(by[ACC_2].state).toBe('available');
    expect(by[ACC_YT]).toMatchObject({ state: 'incompatible', issue: 'video_only' });
    expect(by[ACC_INACTIVE].state).toBe('inactive');
    // Solo las cuentas de la marca del contenido.
    expect(by[ACC_OTHER_BRAND]).toBeUndefined();
    expect(by[ACC_OTHER_ORG]).toBeUndefined();
    expect(out.suggested_account_ids).toEqual([ACC_2]);
  });

  it('listPublishTargets por formato: la story de un post publicado sigue disponible en Instagram', async () => {
    db.seed('kefy_content_renditions', [{
      content_item_id: ITEM, format: 'story', status: 'ready', body: 'Story', hashtags: [], slides: null,
      image_url: 'https://cdn.test/story.jpg', video_url: null,
    }]);

    const out = await listPublishTargets(strict, ITEM, { format: 'story' });

    const ig = out.targets.find((t) => t.social_account_id === ACC)!;
    expect(ig).toMatchObject({ state: 'available', other_formats: ['post'] });
    expect(out.media_ready).toBe(true);
    expect(out.suggested_account_ids).toEqual(expect.arrayContaining([ACC, ACC_2]));
  });

  it('listPublishTargets: un formato sin generar todavía se puede consultar (media_ready false)', async () => {
    const out = await listPublishTargets(strict, ITEM, { format: 'carousel' });
    expect(out.media_ready).toBe(false);
    expect(out.targets.length).toBeGreaterThan(0);
  });

  it('listPublishTargets de un contenido de otra marca es 404', async () => {
    await expect(listPublishTargets(strict, ITEM_OTHER_BRAND)).rejects.toMatchObject({ status: 404 });
  });
});

describe('herramienta list_publish_targets y also_available', () => {
  beforeEach(() => { ensureToolsRegistered(); });

  it('es de lectura: funciona con una key de solo lectura y no deja fila de auditoría', async () => {
    const r = await executeTool('list_publish_targets', { item_id: ITEM }, apiCtx({ brandId: IDS.BRAND, scopes: ['read'] }));

    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const data = r.data as { suggested_account_ids: string[]; targets: Array<Record<string, unknown>> };
    expect(data.suggested_account_ids).toEqual([ACC, ACC_2]);
    // Lo que ve el modelo: sin avatar ni datos de Zernio.
    for (const t of data.targets) {
      expect(t).not.toHaveProperty('avatar_url');
      expect(t).not.toHaveProperty('zernio_account_id');
    }
    expect(db.rows('kefy_assistant_actions')).toHaveLength(0);
  });

  it('publish_content devuelve las otras cuentas compatibles donde todavía no está', async () => {
    const r = await executeTool('publish_content', {
      item_id: ITEM, social_account_ids: [ACC], when: 'now',
    }, apiCtx({ brandId: IDS.BRAND }));

    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const data = r.data as { also_available: Array<{ social_account_id: string; platform: string }> };
    expect(data.also_available).toEqual([{ social_account_id: ACC_2, platform: 'facebook', username: 'acme' }]);
  });
});
