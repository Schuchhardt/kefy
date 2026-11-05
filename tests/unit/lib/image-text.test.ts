import { describe, expect, it } from 'vitest';
import { defaultImageText, imageTextToBake, readImageOverlay, readImageText } from '@/lib/image-text';

describe('readImageText', () => {
  // Las piezas anteriores a la opción tienen que publicarse igual que siempre.
  it('sin valor (o con basura) es lo de siempre: story con caption, post sin texto', () => {
    expect(readImageText('story', null)).toBe('overlay');
    expect(readImageText('post', {})).toBe('none');
    expect(readImageText('post', { image_text: 'collage' })).toBe('none');
    expect(defaultImageText('carousel')).toBe('none');
  });
});

describe('imageTextToBake', () => {
  it('una story anterior a la opción sigue llevando su caption', () => {
    expect(imageTextToBake('story', null, 'Mi caption')).toBe('Mi caption');
  });

  it('con el texto generado en la imagen no se escribe nada encima', () => {
    expect(imageTextToBake('story', { image_text: 'generated' }, 'Mi caption')).toBeUndefined();
    expect(imageTextToBake('post', { image_text: 'generated' }, 'Mi caption')).toBeUndefined();
    expect(imageTextToBake('story', { image_text: 'none' }, 'Mi caption')).toBeUndefined();
  });

  it('overlay usa el texto propio; en un post nunca el caption, que es largo', () => {
    const meta = { image_text: 'overlay', image_overlay: { title: 'Hola', body: 'Mundo' } };
    expect(imageTextToBake('post', meta, 'caption')).toEqual({ title: 'Hola', body: 'Mundo' });
    expect(imageTextToBake('story', meta, 'caption')).toEqual({ title: 'Hola', body: 'Mundo' });
    expect(imageTextToBake('post', { image_text: 'overlay' }, 'caption')).toBeUndefined();
  });

  it('un carrusel lleva su texto por slide', () => {
    expect(imageTextToBake('carousel', { image_text: 'overlay' }, 'caption')).toBeUndefined();
  });
});

describe('readImageOverlay', () => {
  it('limpia y recorta lo que venga en metadata', () => {
    expect(readImageOverlay({ image_overlay: { title: `  ${'x'.repeat(200)}`, body: 3 } })).toEqual({
      title: 'x'.repeat(80), body: '',
    });
    expect(readImageOverlay(null)).toEqual({ title: '', body: '' });
  });
});
