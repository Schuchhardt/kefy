import { describe, it, expect } from 'vitest';
import { calculateReelMetadata, getTotalFrames } from '@/remotion/ReelComposition';

// Regresión: la duración estaba fijada a las escenas de ejemplo (17 s), así que
// los reels largos se cortaban a mitad de escena y los cortos terminaban con
// segundos de fondo muerto. Ahora sale de las escenas reales del render.

const FPS = 30;

function scenes(...durations: number[]) {
  return durations.map((duration_seconds, i) => ({
    scene_order: i + 1, title: `T${i}`, body: `B${i}`, duration_seconds,
  }));
}

describe('calculateReelMetadata', () => {
  it('usa la duración real de las escenas, no la de la composición de ejemplo', () => {
    // 5 escenas de 4 s = 20 s > los 17 s del sample: antes se cortaba
    const { durationInFrames } = calculateReelMetadata({ props: { scenes: scenes(4, 4, 4, 4, 4) } }, FPS);

    expect(durationInFrames).toBe(20 * FPS);
  });

  it('un reel corto no arrastra frames muertos', () => {
    const { durationInFrames } = calculateReelMetadata({ props: { scenes: scenes(2, 2, 2) } }, FPS);

    expect(durationInFrames).toBe(6 * FPS);
  });

  it('coincide con la suma de los rangos de las escenas', () => {
    const s = scenes(3, 5, 2, 4);
    expect(calculateReelMetadata({ props: { scenes: s } }, FPS).durationInFrames)
      .toBe(getTotalFrames(s, FPS));
  });

  it('escenas sin duration_seconds usable: cae a 3 s por escena', () => {
    const broken = [
      { scene_order: 1, title: 'a', body: 'b', duration_seconds: 0 },
      { scene_order: 2, title: 'a', body: 'b', duration_seconds: undefined as unknown as number },
      { scene_order: 3, title: 'a', body: 'b', duration_seconds: -5 },
    ];

    expect(calculateReelMetadata({ props: { scenes: broken } }, FPS).durationInFrames).toBe(9 * FPS);
  });

  it('sin escenas: devuelve una duración válida (Remotion rechaza 0 frames)', () => {
    expect(calculateReelMetadata({ props: {} }, FPS).durationInFrames).toBeGreaterThan(0);
    expect(calculateReelMetadata({ props: { scenes: [] } }, FPS).durationInFrames).toBeGreaterThan(0);
  });
});
