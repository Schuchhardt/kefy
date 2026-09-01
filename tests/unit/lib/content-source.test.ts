import { describe, it, expect } from 'vitest';
import {
  MAX_REFERENCE_IMAGES,
  buildDerivedImagePrompt,
  buildDerivedTopic,
  buildSourceBlock,
  buildSourceContext,
  withSourceBlock,
} from '@/lib/content-source';

// Regresión (producción): al generar la versión carrusel de un post, el
// resultado no tenía relación con el post. El endpoint sólo pasaba
// `topic = (title || body).slice(0, 500)` y generaba imágenes desde cero, así
// que el modelo escribía una pieza nueva sobre un tema parecido y las fotos no
// se parecían en nada a la del post original.

const post = {
  content_type: 'post' as const,
  title: null,
  body: '¿Publicar todos los días es la clave del éxito? Mentira. He visto marcas publicar 3 veces al día durante meses sin conseguir un cliente.',
  hashtags: ['#marketing', '#redes'],
  slides: null,
  image_url: 'https://cdn.example.com/post-cover.jpeg',
};

const carousel = {
  content_type: 'carousel' as const,
  title: 'Frecuencia vs. constancia',
  body: 'La descripción del carrusel',
  hashtags: ['#marketing'],
  slides: [
    { slide_order: 1, title: 'Publicar más no es mejor', body: 'La frecuencia sin estrategia no vende', image_url: 'https://cdn.example.com/s1.jpeg' },
    { slide_order: 2, title: 'Lo que sí funciona',       body: 'Constancia con mensaje claro',        image_url: 'https://cdn.example.com/s2.jpeg' },
  ],
  image_url: 'https://cdn.example.com/s1.jpeg',
};

describe('buildSourceContext', () => {
  it('lleva el cuerpo COMPLETO, no un recorte', () => {
    expect(buildSourceContext(post).body).toBe(post.body);
  });

  it('recoge el texto de cada slide del original', () => {
    const ctx = buildSourceContext(carousel);
    expect(ctx.slideTexts).toEqual([
      'Publicar más no es mejor — La frecuencia sin estrategia no vende',
      'Lo que sí funciona — Constancia con mensaje claro',
    ]);
  });

  it('expone las imágenes del original como referencia visual', () => {
    expect(buildSourceContext(post).imageUrls).toEqual(['https://cdn.example.com/post-cover.jpeg']);
  });

  it('no repite la portada cuando además es el primer slide', () => {
    expect(buildSourceContext(carousel).imageUrls).toEqual([
      'https://cdn.example.com/s1.jpeg',
      'https://cdn.example.com/s2.jpeg',
    ]);
  });

  it('limita las referencias a las que acepta el generador de imágenes', () => {
    const many = {
      ...carousel,
      slides: Array.from({ length: 8 }, (_, i) => ({
        slide_order: i + 1, title: `T${i}`, body: '', image_url: `https://cdn.example.com/${i}.jpeg`,
      })),
      image_url: 'https://cdn.example.com/cover.jpeg',
    };
    expect(buildSourceContext(many).imageUrls).toHaveLength(MAX_REFERENCE_IMAGES);
  });

  it('descarta valores que no son URLs públicas', () => {
    const ctx = buildSourceContext({ ...post, image_url: 'data:image/png;base64,AAA' });
    expect(ctx.imageUrls).toEqual([]);
  });

  it('tolera slides ausentes o con forma inesperada', () => {
    expect(buildSourceContext({ content_type: 'post', slides: 'nope' }).slideTexts).toEqual([]);
    expect(buildSourceContext({ content_type: 'post' }).imageUrls).toEqual([]);
  });
});

describe('buildSourceBlock', () => {
  it('sin origen no añade nada al prompt', () => {
    expect(buildSourceBlock(undefined)).toBe('');
    expect(withSourceBlock('SYSTEM', undefined)).toBe('SYSTEM');
  });

  it('ordena adaptar el original en vez de inventar otra pieza', () => {
    const block = buildSourceBlock(buildSourceContext(post));
    expect(block).toMatch(/ADAPTING an existing/i);
    expect(block).toMatch(/Do NOT invent a different topic/i);
    expect(block).toContain('same core message');
  });

  it('incluye el texto original íntegro para que el modelo lo reutilice', () => {
    const block = buildSourceBlock(buildSourceContext(post));
    expect(block).toContain('He visto marcas publicar 3 veces al día');
  });

  it('numera los slides del original en orden', () => {
    const block = buildSourceBlock(buildSourceContext(carousel));
    expect(block).toContain('1. Publicar más no es mejor');
    expect(block).toContain('2. Lo que sí funciona');
  });

  it('nombra el formato del que se parte', () => {
    expect(buildSourceBlock(buildSourceContext(carousel))).toContain('multi-slide carousel');
    expect(buildSourceBlock(buildSourceContext({ content_type: 'reel', body: 'x' }))).toContain('reel');
  });

  it('withSourceBlock antepone el bloque sin duplicarlo', () => {
    const ctx  = buildSourceContext(post);
    const once = withSourceBlock('SYSTEM PROMPT', ctx);
    expect(once.startsWith(buildSourceBlock(ctx))).toBe(true);
    expect(once).toContain('SYSTEM PROMPT');
    expect(withSourceBlock(once, ctx)).toBe(once);
  });
});

describe('buildDerivedTopic', () => {
  it('usa el título cuando existe', () => {
    expect(buildDerivedTopic(carousel)).toBe('Frecuencia vs. constancia');
  });

  it('sin título, arranca por la primera frase del cuerpo', () => {
    expect(buildDerivedTopic(post)).toBe('¿Publicar todos los días es la clave del éxito?');
  });

  it('si la primera frase es demasiado corta, usa el cuerpo', () => {
    const topic = buildDerivedTopic({ content_type: 'post', body: 'Ojo. Esto sí importa mucho para tu marca.' });
    expect(topic).toContain('Esto sí importa');
  });

  it('devuelve cadena vacía cuando no hay nada de lo que partir', () => {
    expect(buildDerivedTopic({ content_type: 'post' })).toBe('');
  });
});

describe('buildDerivedImagePrompt', () => {
  it('sin imágenes de referencia deja el prompt tal cual', () => {
    const ctx = buildSourceContext({ content_type: 'post', body: 'x' });
    expect(buildDerivedImagePrompt('un fondo', ctx)).toBe('un fondo');
    expect(buildDerivedImagePrompt('un fondo', undefined)).toBe('un fondo');
  });

  it('con referencias pide continuidad visual explícita', () => {
    const prompt = buildDerivedImagePrompt('un fondo', buildSourceContext(post));
    expect(prompt).toContain('un fondo');
    expect(prompt).toMatch(/same piece of content as the reference image/i);
  });
});
