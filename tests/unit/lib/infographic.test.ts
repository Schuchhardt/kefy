import { describe, expect, it } from 'vitest';
import { infographicBrief, infographicSize, parseInfographicCopy } from '@/lib/infographic';
import { planImageFit } from '@/lib/image-fit';
import { safeAreaFor } from '@/lib/preview-layout';
import type { ContentChannel } from '@/types/ai';

describe('parseInfographicCopy', () => {
  it('rechaza una respuesta sin titular o sin puntos', () => {
    expect(parseInfographicCopy(null)).toBeNull();
    expect(parseInfographicCopy({ headline: 'Hola', points: [] })).toBeNull();
    expect(parseInfographicCopy({ headline: ' ', points: [{ label: 'x' }] })).toBeNull();
  });

  it('descarta puntos vacíos, limita a 5 y recorta los textos largos', () => {
    const copy = parseInfographicCopy({
      headline: 'x'.repeat(300),
      points: [{ label: '' }, ...Array.from({ length: 8 }, (_, i) => ({ label: `P${i}` }))],
    });
    expect(copy?.headline.length).toBeLessThanOrEqual(80);
    expect(copy?.points.map((p) => p.label)).toEqual(['P0', 'P1', 'P2', 'P3', 'P4']);
    expect(copy?.closing).toBe('');
  });
});

describe('infographicBrief', () => {
  it('pone entre comillas lo que se imprime, sin romperlas, y separa la dirección visual', () => {
    const brief = infographicBrief({
      headline: 'Dile "sí"',
      points: [{ label: 'Escucha', detail: 'Antes de responder' }, { label: 'Agradece', detail: '' }],
      closing: 'Guárdalo',
      visual: 'steps',
    });
    expect(brief).toContain(`Headline: "Dile 'sí'"`);
    expect(brief).toContain('Point 1: "Escucha"');
    expect(brief).toContain('Point 1 supporting line: "Antes de responder"');
    expect(brief).not.toContain('Point 2 supporting line');
    expect(brief).toContain('Closing line: "Guárdalo"');
    expect(brief).toContain('Visual direction (do not print): steps');
  });
});

describe('infographicSize', () => {
  it('en un post solo deja cuadrado o 4:5', () => {
    expect(infographicSize('post', '1024x1024')).toBe('1024x1024');
    expect(infographicSize('post', '1080x1080')).toBe('1024x1024');
    for (const size of [undefined, 'auto', '1024x1536', '1024x1792', '1536x1024'] as const) {
      expect(infographicSize('post', size)).toBe('1024x1280');
    }
  });

  it('una story se genera en 4:5, que cabe en la zona que su interfaz no tapa', () => {
    const [w, h] = infographicSize('story', '1024x1024').split('x').map(Number);
    const { top, bottom } = safeAreaFor('instagram', 'story');
    // Al escalarla al ancho de la story, ocupa como máximo lo que queda libre (±1 %).
    expect((h / w) * (9 / 16)).toBeLessThanOrEqual(1 - top - bottom + 0.01);
  });

  it('ninguna red recorta esas formas: el texto no se puede cortar al publicar', () => {
    const channels: ContentChannel[] = ['instagram', 'facebook', 'linkedin', 'twitter', 'tiktok', 'threads', 'generic'];
    for (const channel of channels) {
      for (const [w, h] of [[1024, 1024], [1024, 1280]] as const) {
        expect(planImageFit(w, h, channel, 'post').mode, `${channel} ${w}x${h}`).toBe('contain');
      }
    }
  });
});
