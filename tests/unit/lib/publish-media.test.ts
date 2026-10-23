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

describe('resolvePublishMedia — story solo imagen', () => {
  // Regresión: una story subida a mano con solo una imagen fallaba al publicar
  // con «Content has no body text». El caption de una story es opcional.
  it('sin body: publica la imagen sin caption', () => {
    for (const body of [null, '', '   ']) {
      const res = resolvePublishMedia('story', { ...base, body });

      expect(res.ok, `body=${JSON.stringify(body)}`).toBe(true);
      if (!res.ok) return;
      expect(res.media.image_url).toBe('https://cdn.example.com/cover.jpg');
      expect(res.media.text).toBe('');
      expect(res.media.is_video).toBe(false);
    }
  });

  it('en video sin body: el caption son solo los hashtags', () => {
    const res = resolvePublishMedia('story', { ...base, body: null, video_url: 'https://s3.example.com/story.mp4' });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.media.text).toBe('#marketing #ia');
  });

  it('sin imagen ni video: falla aunque tenga texto', () => {
    const res = resolvePublishMedia('story', { ...base, image_url: null });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/story/i);
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

  it('solo imagen, sin body: publica la imagen sin caption', () => {
    const res = resolvePublishMedia('post', { ...base, body: null });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.media.image_url).toBe('https://cdn.example.com/cover.jpg');
    expect(res.media.text).toBe('');
  });

  it('sin body ni imagen: falla', () => {
    for (const body of [null, '', '   ']) {
      const res = resolvePublishMedia('post', { ...base, body, image_url: null });
      expect(res.ok, `body=${JSON.stringify(body)}`).toBe(false);
    }
  });
});

describe('resolvePublishMedia — markdown sin interpolar', () => {
  // Regresión: ninguna red de Zernio renderiza markdown en el caption — el
  // texto salía con los asteriscos/almohadillas literales en LinkedIn.
  it('quita **bold**, __bold__, `code`, headers y bullets', () => {
    const body = [
      '# Título',
      'Esto es **muy** importante y __esto también__.',
      'Usa `console.log` para depurar.',
      '- primer punto',
      '* segundo punto',
    ].join('\n');

    const res = resolvePublishMedia('post', { ...base, body });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.media.text).not.toMatch(/[*_`#]/);
    expect(res.media.text).toContain('Título');
    expect(res.media.text).toContain('Esto es muy importante y esto también.');
    expect(res.media.text).toContain('console.log');
    expect(res.media.text).toContain('• primer punto');
    expect(res.media.text).toContain('• segundo punto');
  });

  it('convierte [texto](url) a "texto (url)"', () => {
    const res = resolvePublishMedia('post', { ...base, body: 'Mira [nuestro sitio](https://example.com) hoy.' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.media.text).toBe('Mira nuestro sitio (https://example.com) hoy.');
  });

  it('también limpia el caption de un reel/story en video (hashtags inline incluidos)', () => {
    const res = resolvePublishMedia('reel', {
      ...base, video_url: 'https://s3.example.com/reel.mp4', body: '**Grandes** noticias hoy.',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.media.text).toContain('Grandes noticias hoy.');
    expect(res.media.text).not.toContain('**');
  });

  it('texto sin markdown queda intacto', () => {
    const res = resolvePublishMedia('post', { ...base, body: 'Un texto normal, sin nada raro.' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.media.text).toBe('Un texto normal, sin nada raro.');
  });
});
