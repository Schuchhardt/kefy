import { describe, it, expect } from 'vitest';
import {
  networkFrame,
  safeAreaCss,
  safeAreaFor,
  safeBoxFor,
} from '@/lib/preview-layout';

// Regresión: la vista previa dibujaba todos los carruseles en un marco 1:1 con
// el texto pegado al borde inferior. En TikTok eso queda debajo del @usuario y
// detrás de la columna de like/comentarios/compartir, así que el usuario
// aprobaba una composición que en el destino real salía tapada.

describe('networkFrame', () => {
  it('el valor CSS coincide con la relación numérica', () => {
    expect(networkFrame('tiktok', 'carousel').css).toBe('9 / 16');
    expect(networkFrame('instagram', 'carousel').css).toBe('1 / 1');
  });

  it('reel y story son verticales en cualquier red', () => {
    for (const platform of ['instagram', 'facebook', 'tiktok'] as const) {
      expect(networkFrame(platform, 'reel').aspect).toBeCloseTo(9 / 16, 4);
      expect(networkFrame(platform, 'story').aspect).toBeCloseTo(9 / 16, 4);
    }
  });

  it('el feed de Instagram/LinkedIn muestra el carrusel cuadrado', () => {
    expect(networkFrame('instagram', 'carousel')).toEqual({ aspect: 1, css: '1 / 1', fit: 'cover' });
    expect(networkFrame('linkedin', 'post')).toEqual({ aspect: 1, css: '1 / 1', fit: 'cover' });
  });

  it('TikTok muestra también el carrusel a pantalla vertical, encajado sin recortar', () => {
    const frame = networkFrame('tiktok', 'carousel');
    expect(frame.aspect).toBeCloseTo(9 / 16, 4);
    // `contain` porque la imagen cuadrada se sube tal cual (entra en el rango
    // que TikTok acepta) y es la app la que la encaja en su viewport vertical.
    expect(frame.fit).toBe('contain');
  });
});

describe('safeAreaFor', () => {
  it('TikTok reserva la columna derecha y la franja del usuario', () => {
    const safe = safeAreaFor('tiktok', 'carousel');
    expect(safe.right).toBeGreaterThan(0.15);   // avatar + like + comentarios + compartir
    expect(safe.bottom).toBeGreaterThan(0.20);  // @usuario + descripción + música
    expect(safe.top).toBeGreaterThan(0.05);     // buscador + pestañas
  });

  it('un feed cuadrado no reserva nada más que el margen tipográfico', () => {
    const safe = safeAreaFor('instagram', 'carousel');
    expect(safe.right).toBeLessThan(0.1);
    expect(safe.bottom).toBeLessThan(0.1);
  });

  it('la story reserva la barra de progreso arriba y la caja de respuesta abajo', () => {
    const safe = safeAreaFor('instagram', 'story');
    expect(safe.top).toBeGreaterThan(0.1);
    expect(safe.bottom).toBeGreaterThan(0.1);
  });

  it('el reel reserva su rail de acciones', () => {
    expect(safeAreaFor('instagram', 'reel').right).toBeGreaterThan(0.1);
  });

  it('ninguna zona segura deja el área útil en cero o negativa', () => {
    const platforms = ['instagram', 'facebook', 'linkedin', 'twitter', 'threads', 'tiktok', 'generic'] as const;
    const formats   = ['post', 'carousel', 'reel', 'story'] as const;
    for (const platform of platforms) {
      for (const format of formats) {
        const safe = safeAreaFor(platform, format);
        expect(safe.left + safe.right).toBeLessThan(1);
        expect(safe.top + safe.bottom).toBeLessThan(1);
      }
    }
  });
});

describe('safeBoxFor', () => {
  it('traduce la zona segura a píxeles del lienzo', () => {
    const box = safeBoxFor(1000, 2000, 'tiktok', 'carousel');
    const safe = safeAreaFor('tiktok', 'carousel');
    expect(box.x).toBe(Math.round(1000 * safe.left));
    expect(box.y).toBe(Math.round(2000 * safe.top));
    expect(box.width).toBe(Math.round(1000 * (1 - safe.left - safe.right)));
    expect(box.height).toBe(Math.round(2000 * (1 - safe.top - safe.bottom)));
  });

  it('la caja nunca se sale del lienzo', () => {
    const box = safeBoxFor(1080, 1920, 'tiktok', 'reel');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1080);
    expect(box.y + box.height).toBeLessThanOrEqual(1920);
  });

  it('en TikTok la caja es sensiblemente más angosta que el lienzo', () => {
    const box = safeBoxFor(1080, 1920, 'tiktok', 'carousel');
    expect(box.width).toBeLessThan(1080 * 0.8);
  });
});

describe('safeAreaCss', () => {
  // El overlay del preview y el compositor del servidor tienen que leer la
  // MISMA zona: si divergen, lo aprobado en pantalla no es lo publicado.
  it('expresa exactamente la misma zona que safeAreaFor', () => {
    const css  = safeAreaCss('tiktok', 'carousel');
    const safe = safeAreaFor('tiktok', 'carousel');
    expect(css.paddingRight).toBe(`${(safe.right * 100).toFixed(2)}%`);
    expect(css.paddingBottom).toBe(`${(safe.bottom * 100).toFixed(2)}%`);
    expect(css.paddingTop).toBe(`${(safe.top * 100).toFixed(2)}%`);
    expect(css.paddingLeft).toBe(`${(safe.left * 100).toFixed(2)}%`);
  });
});
