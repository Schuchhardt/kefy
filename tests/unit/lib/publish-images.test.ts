import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regresión: el texto de cada slide se quemaba al GENERAR el carrusel. Eso
// obligaba a decidir tipografía y posición sin saber la red destino, dejaba el
// texto imposible de editar, y en la app se veía dos veces (los píxeles + el
// overlay HTML del preview). Ahora la imagen se guarda limpia y el texto se
// compone acá, una vez por red, al publicar.
//
// Además: los slides creados ANTES de este cambio ya traen el texto quemado y
// no llevan `text_baked`. Volver a escribirlo encima los dejaría ilegibles.

const mockResize   = vi.fn();
const mockBake     = vi.fn();
const mockStory    = vi.fn();
const mockUpload   = vi.fn();

vi.mock('@/lib/image-processor', () => ({
  resizeForFormat:    (...args: unknown[]) => mockResize(...args),
  bakeTextIfSupported: (...args: unknown[]) => mockBake(...args),
  compositeStoryText: (...args: unknown[]) => mockStory(...args),
}));

vi.mock('@/lib/storage', () => ({
  uploadBase64Image: (...args: unknown[]) => mockUpload(...args),
}));

import { needsTextBake, prepareCarouselSlides, prepareSingleImage } from '@/lib/publish-images';

const deps = { orgId: 'org-1', prefix: 'publish' };

function slide(over: Record<string, unknown> = {}) {
  return {
    slide_order: 1,
    title: 'Publicar más no es mejor',
    body:  'La frecuencia sin estrategia no vende',
    image_url: 'https://cdn.example.com/s1.jpeg',
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResize.mockResolvedValue(Buffer.from('resized'));
  mockBake.mockResolvedValue(Buffer.from('baked'));
  mockStory.mockResolvedValue(Buffer.from('story'));
  mockUpload.mockResolvedValue('https://cdn.example.com/final.jpeg');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new TextEncoder().encode('source').buffer,
  }));
});

describe('needsTextBake', () => {
  it('un slide nuevo (imagen limpia) necesita que se le escriba el texto', () => {
    expect(needsTextBake({ text_baked: false, title: 'Hola', body: '' })).toBe(true);
  });

  it('un slide anterior al cambio ya viene quemado: no se reescribe', () => {
    expect(needsTextBake({ title: 'Hola', body: 'Mundo' })).toBe(false);
    expect(needsTextBake({ text_baked: true, title: 'Hola', body: 'Mundo' })).toBe(false);
  });

  it('sin texto no hay nada que escribir', () => {
    expect(needsTextBake({ text_baked: false, title: '  ', body: '' })).toBe(false);
  });
});

describe('prepareCarouselSlides', () => {
  it('recorta cada slide al formato de la red y le escribe el texto', async () => {
    const urls = await prepareCarouselSlides([slide({ text_baked: false })], 'instagram', deps);

    expect(mockResize).toHaveBeenCalledWith(expect.any(Buffer), 'instagram', 'carousel');
    expect(mockBake).toHaveBeenCalledWith(Buffer.from('resized'), {
      title: 'Publicar más no es mejor',
      body:  'La frecuencia sin estrategia no vende',
      platform: 'instagram',
      format: 'carousel',
      brandFonts: undefined,
    });
    expect(urls).toEqual(['https://cdn.example.com/final.jpeg']);
  });

  it('escribe los slides con la tipografía elegida por la marca', async () => {
    await prepareCarouselSlides(
      [slide({ text_baked: false })], 'instagram',
      { ...deps, brandFonts: { heading: 'Poppins', body: 'Lato' } },
    );
    expect(mockBake).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({
      brandFonts: { heading: 'Poppins', body: 'Lato' },
    }));
  });

  it('cada red recibe su propia zona segura', async () => {
    await prepareCarouselSlides([slide({ text_baked: false })], 'tiktok', deps);
    expect(mockBake).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ platform: 'tiktok' }));
  });

  it('NO reescribe el texto sobre un slide antiguo que ya lo trae quemado', async () => {
    await prepareCarouselSlides([slide()], 'instagram', deps);
    expect(mockResize).toHaveBeenCalled();   // sí se ajusta el tamaño
    expect(mockBake).not.toHaveBeenCalled(); // pero no se duplica el texto
  });

  it('conserva el orden de los slides', async () => {
    mockUpload
      .mockResolvedValueOnce('https://cdn.example.com/a.jpeg')
      .mockResolvedValueOnce('https://cdn.example.com/b.jpeg')
      .mockResolvedValueOnce('https://cdn.example.com/c.jpeg');

    const urls = await prepareCarouselSlides(
      [slide({ slide_order: 1, text_baked: false }), slide({ slide_order: 2, text_baked: false }), slide({ slide_order: 3, text_baked: false })],
      'instagram', deps,
    );
    expect(urls).toEqual([
      'https://cdn.example.com/a.jpeg',
      'https://cdn.example.com/b.jpeg',
      'https://cdn.example.com/c.jpeg',
    ]);
  });

  it('un slide que falla conserva su URL original en vez de desaparecer del carrusel', async () => {
    mockResize
      .mockResolvedValueOnce(Buffer.from('ok'))
      .mockRejectedValueOnce(new Error('sharp explotó'));
    mockUpload.mockResolvedValueOnce('https://cdn.example.com/ok.jpeg');

    const urls = await prepareCarouselSlides(
      [slide({ slide_order: 1, text_baked: false }), slide({ slide_order: 2, image_url: 'https://cdn.example.com/s2.jpeg', text_baked: false })],
      'instagram', deps,
    );
    expect(urls).toEqual(['https://cdn.example.com/ok.jpeg', 'https://cdn.example.com/s2.jpeg']);
  });

  it('si no se puede descargar la imagen se publica la original', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const urls = await prepareCarouselSlides([slide({ text_baked: false })], 'instagram', deps);
    expect(urls).toEqual(['https://cdn.example.com/s1.jpeg']);
    expect(mockBake).not.toHaveBeenCalled();
  });

  it('descarta slides sin imagen', async () => {
    expect(await prepareCarouselSlides([slide({ image_url: null })], 'instagram', deps)).toEqual([]);
  });
});

describe('prepareSingleImage', () => {
  it('ajusta la imagen al formato de la red', async () => {
    const url = await prepareSingleImage(
      'https://cdn.example.com/orig.jpeg', Buffer.from('src'), 'linkedin', 'post', deps,
    );
    expect(mockResize).toHaveBeenCalledWith(Buffer.from('src'), 'linkedin', 'post');
    expect(mockStory).not.toHaveBeenCalled();
    expect(url).toBe('https://cdn.example.com/final.jpeg');
  });

  it('en una story escribe el caption dentro de la zona segura de esa red', async () => {
    await prepareSingleImage(
      'https://cdn.example.com/orig.jpeg', Buffer.from('src'), 'tiktok', 'story', deps, 'Mi caption',
    );
    expect(mockStory).toHaveBeenCalledWith(Buffer.from('resized'), 'Mi caption', 'tiktok', undefined);
  });

  // La identidad de la marca también manda en el texto que se quema.
  it('propaga las tipografías del Brand Kit al caption de la story', async () => {
    await prepareSingleImage(
      'https://cdn.example.com/orig.jpeg', Buffer.from('src'), 'instagram', 'story',
      { ...deps, brandFonts: { heading: 'Poppins', body: 'Lato' } }, 'Mi caption',
    );
    expect(mockStory).toHaveBeenCalledWith(
      Buffer.from('resized'), 'Mi caption', 'instagram', { heading: 'Poppins', body: 'Lato' },
    );
  });

  it('sin buffer descargado se publica la URL original', async () => {
    const url = await prepareSingleImage('https://cdn.example.com/orig.jpeg', null, 'instagram', 'post', deps);
    expect(url).toBe('https://cdn.example.com/orig.jpeg');
    expect(mockResize).not.toHaveBeenCalled();
  });

  it('si el procesado falla se publica la original en vez de tumbar la publicación', async () => {
    mockResize.mockRejectedValue(new Error('boom'));
    const url = await prepareSingleImage('https://cdn.example.com/orig.jpeg', Buffer.from('src'), 'instagram', 'post', deps);
    expect(url).toBe('https://cdn.example.com/orig.jpeg');
  });
});
