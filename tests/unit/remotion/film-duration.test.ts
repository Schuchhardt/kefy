import { describe, it, expect } from 'vitest';
import { CLIP_MIN_PLAYBACK_RATE, calculateFilmMetadata, captionPages, clipPlaybackRate, filmIntroOffset, getFilmTotalFrames } from '@/remotion/FilmComposition';
import type { FilmScene } from '@/remotion/film-types';

const FPS = 30;

function scene(duration_seconds: number, patch: Partial<FilmScene> = {}): FilmScene {
  return {
    id: 's', duration_seconds, visual: { type: 'none' }, camera: 'push_in', voice: null,
    speech_offset: 0, words: [], on_screen_text: null, transition: 'crossfade', ...patch,
  };
}

describe('KefyFilm: duración', () => {
  it('es la suma de los planos: las transiciones no alargan el video', () => {
    const scenes = [scene(2.5), scene(3.2), scene(1.5)];
    expect(calculateFilmMetadata({ props: { scenes } }, FPS).durationInFrames)
      .toBe(Math.round(2.5 * FPS) + Math.round(3.2 * FPS) + Math.round(1.5 * FPS));
    expect(getFilmTotalFrames(scenes, FPS)).toBe(calculateFilmMetadata({ props: { scenes } }, FPS).durationInFrames);
  });

  it('la tarjeta de cierre suma su duración al final', () => {
    const scenes = [scene(2), scene(3)];
    expect(calculateFilmMetadata({ props: { scenes, outro: { duration_seconds: 2.2 } } }, FPS).durationInFrames)
      .toBe(5 * FPS + Math.round(2.2 * FPS));
  });

  it('sin planos no rompe Remotion (mínimo 1 frame)', () => {
    expect(calculateFilmMetadata({ props: {} }, FPS).durationInFrames).toBe(1);
  });
});

describe('filmIntroOffset', () => {
  it('el primer plano, los cortes secos y los planos con lipsync entran sin superponerse', () => {
    expect(filmIntroOffset(scene(3), 0, 90)).toBe(0);
    expect(filmIntroOffset(scene(3, { transition: 'cut' }), 1, 90)).toBe(0);
    expect(filmIntroOffset(scene(3, { visual: { type: 'video', src: 'x', clip_seconds: 5, has_audio: true } }), 1, 90)).toBe(0);
    expect(filmIntroOffset(scene(3), 1, 90)).toBeGreaterThan(0);
  });
});

describe('captionPages', () => {
  const w = (text: string, i: number) => ({ text, start: i, end: i + 0.5 });

  it('agrupa de a 3 palabras y corta antes en la puntuación', () => {
    const pages = captionPages(['Hola,', 'esto', 'es', 'Kefy', 'para', 'ti'].map(w));
    expect(pages.map((p) => p.map((x) => x.text).join(' '))).toEqual(['Hola,', 'esto es Kefy', 'para ti']);
  });
});

describe('KefyFilm: clip más corto que el plano', () => {
  it('un clip mudo se ralentiza hasta cubrir el plano en vez de congelarse', () => {
    // 5 s de clip para 6,95 s de plano (voz de 6,4 s)
    const rate = clipPlaybackRate(5 * FPS, Math.round(6.95 * FPS), false);
    expect(rate).toBeLessThan(1);
    expect(Math.ceil((5 * FPS) / rate)).toBeGreaterThanOrEqual(Math.round(6.95 * FPS));
  });

  it('no va más lento que el mínimo ni acelera un clip largo', () => {
    expect(clipPlaybackRate(5 * FPS, 15 * FPS, false)).toBe(CLIP_MIN_PLAYBACK_RATE);
    expect(clipPlaybackRate(10 * FPS, 4 * FPS, false)).toBe(1);
  });

  it('un clip con audio va siempre a velocidad normal', () => {
    expect(clipPlaybackRate(5 * FPS, 6 * FPS, true)).toBe(1);
  });
});
