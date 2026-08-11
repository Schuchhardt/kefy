import { describe, it, expect } from 'vitest';
import { resolvePublishMedia } from '@/lib/publish-media';

// Regresión: un reel sin video se publicaba como imagen (la portada) en
// Instagram / Facebook / TikTok. Un reel SIEMPRE es video o no se publica.

const base = {
  body:      'Texto del contenido',
  image_url: 'https://cdn.example.com/cover.jpg',
  slides:    null,
  video_url: null,
  hashtags:  ['marketing', '#ia'],
};

describe('resolvePublishMedia — reel', () => {
  it('con video: envía el video y NUNCA la imagen de portada', () => {
    const res = resolvePublishMedia('reel', { ...base, video_url: 'https://s3.example.com/reel.mp4' });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.media.video_url).toBe('https://s3.example.com/reel.mp4');
    expect(res.media.image_url).toBeUndefined();
    expect(res.media.media_urls).toBeUndefined();
    expect(res.media.is_video).toBe(true);
  });

  it('sin video: falla en vez de publicar la portada como imagen', () => {
    const res = resolvePublishMedia('reel', base);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/reel/i);
    expect(res.error).toMatch(/render/i);
  });

  it('con video_url vacío o inválido: falla (no cae a imagen)', () => {
    for (const video_url of ['', '   ', 'no-es-una-url', 'mux:abc123']) {
      const res = resolvePublishMedia('reel', { ...base, video_url });
      expect(res.ok, `video_url=${JSON.stringify(video_url)}`).toBe(false);
    }
  });

  it('solo con mux_playback_id (legacy): falla pidiendo re-render', () => {
    const res = resolvePublishMedia('reel', { ...base, mux_playback_id: 'abc123' });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/Mux/i);
  });

  it('sin video ni portada tampoco publica nada', () => {
    const res = resolvePublishMedia('reel', { ...base, image_url: null });
    expect(res.ok).toBe(false);
  });

  it('con video: incrusta los hashtags en el caption y vacía el campo hashtags', () => {
    const res = resolvePublishMedia('reel', { ...base, video_url: 'https://s3.example.com/reel.mp4' });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.media.text).toBe('Texto del contenido\n\n#marketing #ia');
    expect(res.media.hashtags).toEqual([]);
  });
});

describe('resolvePublishMedia — story', () => {
  it('con video: publica el video sin imagen', () => {
    const res = resolvePublishMedia('story', { ...base, video_url: 'https://s3.example.com/story.mp4' });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.media.video_url).toBe('https://s3.example.com/story.mp4');
    expect(res.media.image_url).toBeUndefined();
  });

  it('sin video: publica la imagen (las stories sí pueden ser solo imagen)', () => {
    const res = resolvePublishMedia('story', base);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.media.image_url).toBe('https://cdn.example.com/cover.jpg');
    expect(res.media.video_url).toBeUndefined();
    expect(res.media.is_video).toBe(false);
  });
});

describe('resolvePublishMedia — carousel', () => {
  it('envía las slides sin duplicar la portada', () => {
    const res = resolvePublishMedia('carousel', {
      ...base,
      image_url: 'https://cdn.example.com/slide-1.jpg',
      slides: [
        { image_url: 'https://cdn.example.com/slide-1.jpg' },
        { image_url: 'https://cdn.example.com/slide-2.jpg' },
        { image_url: null },
      ],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.media.media_urls).toEqual([
      'https://cdn.example.com/slide-1.jpg',
      'https://cdn.example.com/slide-2.jpg',
    ]);
    expect(res.media.image_url).toBeUndefined();
  });

  it('sin slides con imagen: cae a la portada', () => {
    const res = resolvePublishMedia('carousel', { ...base, slides: [{ image_url: null }] });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.media.image_url).toBe('https://cdn.example.com/cover.jpg');
  });

  it('sin slides ni portada: falla', () => {
    const res = resolvePublishMedia('carousel', { ...base, image_url: null, slides: [] });
    expect(res.ok).toBe(false);
  });
});

describe('resolvePublishMedia — post', () => {
  it('publica imagen + hashtags en su campo propio', () => {
    const res = resolvePublishMedia('post', base);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.media.image_url).toBe('https://cdn.example.com/cover.jpg');
    expect(res.media.hashtags).toEqual(['marketing', '#ia']);
    expect(res.media.text).toBe('Texto del contenido');
    expect(res.media.video_url).toBeUndefined();
  });

  it('sin body: falla', () => {
    const res = resolvePublishMedia('post', { ...base, body: null });
    expect(res.ok).toBe(false);
  });
});
