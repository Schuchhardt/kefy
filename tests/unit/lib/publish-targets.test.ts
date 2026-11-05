// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  PLATFORM_CAPS, buildPublishTargets, hasCoverage, mediaShapeOf, platformFit, suggestedAccountIds,
  type TargetAccount, type TargetPost,
} from '@/lib/publish-targets';
import { STORY_CAPABLE_PLATFORMS } from '@/lib/zernio';
import { STORY_PLATFORMS } from '@/lib/autopilot-formats';
import { ORGANIC_CHANNELS } from '@/lib/channels';

// Un mismo contenido se publica en todas las cuentas de la marca, esté en
// borrador, programado o publicado. Este módulo decide, por cuenta, si ya está
// ahí, si se puede publicar o si la red no admite el formato.

describe('PLATFORM_CAPS', () => {
  it('las redes con stories son las mismas que publica Zernio como story', () => {
    const withStories = Object.entries(PLATFORM_CAPS).filter(([, c]) => c.stories).map(([p]) => p).sort();
    expect(withStories).toEqual([...STORY_CAPABLE_PLATFORMS].sort());
    expect(withStories).toEqual([...STORY_PLATFORMS].sort());
  });

  it('cubre todas las redes orgánicas que se pueden conectar (salvo el catch-all)', () => {
    for (const c of ORGANIC_CHANNELS) {
      expect(PLATFORM_CAPS[c.value], c.value).toBeDefined();
    }
  });
});

describe('platformFit', () => {
  const images = (count: number | null) => ({ kind: 'images' as const, count });

  it('YouTube solo publica video: un post con imagen no es compatible, un reel sí', () => {
    expect(platformFit('youtube', 'post', images(1))).toEqual({ ok: false, issue: 'video_only' });
    expect(platformFit('youtube', 'reel', { kind: 'video' })).toEqual({ ok: true, asPost: false });
  });

  it('Instagram, TikTok y Pinterest exigen imagen o video: el post de solo texto no va', () => {
    for (const p of ['instagram', 'tiktok', 'pinterest', 'snapchat']) {
      expect(platformFit(p, 'post', { kind: 'text' }), p).toEqual({ ok: false, issue: 'needs_media' });
    }
    for (const p of ['linkedin', 'facebook', 'twitter', 'threads', 'bluesky', 'googlebusiness']) {
      expect(platformFit(p, 'post', { kind: 'text' }), p).toEqual({ ok: true, asPost: false });
    }
  });

  it('carrusel: respeta el máximo de imágenes de cada red', () => {
    expect(platformFit('twitter', 'carousel', images(4))).toEqual({ ok: true, asPost: false });
    expect(platformFit('twitter', 'carousel', images(5))).toEqual({ ok: false, issue: 'too_many_images', maxImages: 4 });
    expect(platformFit('instagram', 'carousel', images(10))).toEqual({ ok: true, asPost: false });
    expect(platformFit('pinterest', 'carousel', images(2))).toEqual({ ok: false, issue: 'too_many_images', maxImages: 1 });
  });

  it('un carrusel que aún no se generó cuenta como 2 imágenes: descarta las redes de una sola', () => {
    expect(platformFit('googlebusiness', 'carousel', images(null))).toMatchObject({ ok: false, issue: 'too_many_images' });
    expect(platformFit('twitter', 'carousel', images(null))).toEqual({ ok: true, asPost: false });
  });

  it('Google Business no admite video', () => {
    expect(platformFit('googlebusiness', 'reel', { kind: 'video' })).toEqual({ ok: false, issue: 'no_video' });
  });

  it('una story va a cualquier red: donde no hay stories sale como post', () => {
    expect(platformFit('instagram', 'story', images(1))).toEqual({ ok: true, asPost: false });
    expect(platformFit('linkedin', 'story', images(1))).toEqual({ ok: true, asPost: true });
    expect(platformFit('youtube', 'story', { kind: 'video' })).toEqual({ ok: true, asPost: true });
  });

  it('WhatsApp no recibe posts; una red desconocida se da por compatible', () => {
    expect(platformFit('whatsapp', 'post', images(1))).toEqual({ ok: false, issue: 'no_publishing' });
    expect(platformFit('mastodon', 'post', { kind: 'text' })).toEqual({ ok: true, asPost: false });
  });
});

describe('mediaShapeOf', () => {
  const src = (over: Record<string, unknown> = {}) => ({
    body: 'Hola', image_url: null, slides: null, video_url: null, hashtags: [], ...over,
  });

  it('usa las mismas reglas que la publicación', () => {
    expect(mediaShapeOf('post', src())).toEqual({ shape: { kind: 'text' }, ready: true });
    expect(mediaShapeOf('post', src({ image_url: 'https://x/a.jpg' }))).toEqual({ shape: { kind: 'images', count: 1 }, ready: true });
    expect(mediaShapeOf('carousel', src({ slides: [{ image_url: 'https://x/1.jpg' }, { image_url: 'https://x/2.jpg' }, { image_url: null }] })))
      .toEqual({ shape: { kind: 'images', count: 2 }, ready: true });
    expect(mediaShapeOf('reel', src({ video_url: 'https://x/v.mp4' }))).toEqual({ shape: { kind: 'video' }, ready: true });
  });

  it('sin versión generada, o un reel sin video: la forma esperada del formato y ready false', () => {
    expect(mediaShapeOf('carousel', null)).toEqual({ shape: { kind: 'images', count: null }, ready: false });
    expect(mediaShapeOf('reel', src())).toEqual({ shape: { kind: 'video' }, ready: false });
  });
});

describe('buildPublishTargets', () => {
  const acc = (id: string, platform: string, status = 'active'): TargetAccount => ({ id, platform, username: id, status });
  const post = (over: Partial<TargetPost>): TargetPost => ({
    id: `p-${Math.random()}`, social_account_id: null, status: 'published', format: 'post',
    scheduled_at: null, published_at: null, platform_post_url: null, ...over,
  });
  const accounts = [
    acc('ig', 'instagram'), acc('li', 'linkedin'), acc('yt', 'youtube'), acc('x', 'twitter'), acc('fb', 'facebook', 'expired'),
  ];

  it('un post publicado en Instagram y programado en LinkedIn recomienda X; YouTube no es compatible', () => {
    const targets = buildPublishTargets({
      accounts,
      posts: [
        post({ id: 'pub', social_account_id: 'ig', published_at: '2026-11-01T10:00:00Z', platform_post_url: 'https://instagram.com/p/1' }),
        post({ id: 'sch', social_account_id: 'li', status: 'scheduled', scheduled_at: '2026-11-10T10:00:00Z' }),
      ],
      format: 'post',
      primaryFormat: 'post',
      shape: { kind: 'images', count: 1 },
    });

    const by = Object.fromEntries(targets.map((t) => [t.social_account_id, t]));
    expect(by.ig).toMatchObject({ state: 'published', post_url: 'https://instagram.com/p/1' });
    expect(by.li).toMatchObject({ state: 'scheduled', scheduled_post_id: 'sch', scheduled_at: '2026-11-10T10:00:00Z' });
    expect(by.x.state).toBe('available');
    expect(by.yt).toMatchObject({ state: 'incompatible', issue: 'video_only' });
    expect(by.fb.state).toBe('inactive');
    // Orden: dónde está → dónde más puede ir → lo que no.
    expect(targets.map((t) => t.state)).toEqual(['published', 'scheduled', 'available', 'incompatible', 'inactive']);
    expect(suggestedAccountIds(targets)).toEqual(['x']);
    expect(hasCoverage(targets)).toBe(true);
  });

  it('un borrador sin publicaciones recomienda todas las compatibles', () => {
    const targets = buildPublishTargets({
      accounts, posts: [], format: 'post', primaryFormat: 'post', shape: { kind: 'images', count: 1 },
    });
    expect(suggestedAccountIds(targets)).toEqual(['ig', 'li', 'x']);
    expect(hasCoverage(targets)).toBe(false);
  });

  it('las filas fallidas o canceladas no cuentan como publicadas', () => {
    const targets = buildPublishTargets({
      accounts: [acc('ig', 'instagram')],
      posts: [post({ social_account_id: 'ig', status: 'failed' }), post({ social_account_id: 'ig', status: 'cancelled' })],
      format: 'post', primaryFormat: 'post', shape: { kind: 'images', count: 1 },
    });
    expect(targets[0].state).toBe('available');
  });

  it('el mismo contenido en otro formato no bloquea la cuenta: va en other_formats', () => {
    const targets = buildPublishTargets({
      accounts: [acc('ig', 'instagram')],
      posts: [post({ social_account_id: 'ig', format: 'post' })],
      format: 'story', primaryFormat: 'post', shape: { kind: 'images', count: 1 },
    });
    expect(targets[0]).toMatchObject({ state: 'available', other_formats: ['post'] });
    expect(hasCoverage(targets)).toBe(true);
  });

  it('una fila antigua sin formato es del formato propio del contenido', () => {
    const targets = buildPublishTargets({
      accounts: [acc('ig', 'instagram')],
      posts: [post({ social_account_id: 'ig', format: null })],
      format: 'carousel', primaryFormat: 'carousel', shape: { kind: 'images', count: 3 },
    });
    expect(targets[0].state).toBe('published');
  });

  it('una story en LinkedIn se recomienda avisando que sale como post', () => {
    const targets = buildPublishTargets({
      accounts: [acc('li', 'linkedin')], posts: [], format: 'story', primaryFormat: 'story', shape: { kind: 'images', count: 1 },
    });
    expect(targets[0]).toMatchObject({ state: 'available', as_post: true });
  });
});
