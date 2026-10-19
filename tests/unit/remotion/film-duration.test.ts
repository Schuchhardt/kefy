import { describe, it, expect } from 'vitest';
import { calculateFilmMetadata, captionPages, filmIntroOffset, getFilmTotalFrames } from '@/remotion/FilmComposition';
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
