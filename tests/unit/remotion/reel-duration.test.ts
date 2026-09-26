import { describe, it, expect } from 'vitest';
import { calculateReelMetadata, getTotalFrames, overlapFor } from '@/remotion/ReelComposition';

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

describe('overlapFor (crossfade window)', () => {
  it('usa la ventana completa (15 frames) en una escena de duración normal', () => {
    expect(overlapFor(3 * FPS)).toBe(15); // escena de 3s
  });

  it('se recorta en una escena muy corta, para no arrancar antes que la anterior', () => {
    expect(overlapFor(10)).toBe(Math.floor(10 / 3));
    expect(overlapFor(10)).toBeLessThan(15);
  });

  it('nunca es negativo ni excede un tercio de la escena', () => {
    for (const d of [0, 1, 5, 30, 60, 90, 150]) {
      const overlap = overlapFor(d);
      expect(overlap).toBeGreaterThanOrEqual(0);
      expect(overlap).toBeLessThanOrEqual(Math.floor(d / 3));
    }
  });
});

// Regresión: el crossfade entre escenas (ver OVERLAP_FRAMES en ReelComposition)
// adelanta el inicio de cada Sequence tomando frames prestados de la cola de
// la anterior — nunca debe alargar la duración total ni mover el final de la
// última escena, que es justo la duración que calculateReelMetadata calculó.
describe('las Sequences con crossfade no cambian la duración total', () => {
  function simulateSequenceRanges(durations: number[]) {
    let start = 0;
    const nominal = durations.map((d) => {
      const durationFrames = Math.round(d * FPS);
      const range = { start, end: start + durationFrames, durationFrames };
      start += durationFrames;
      return range;
    });

    return nominal.map((range, i) => {
      const introOffset  = i === 0 ? 0 : overlapFor(range.durationFrames);
      const sequenceFrom = range.start - introOffset;
      const sequenceDur  = range.durationFrames + introOffset;
      return { sequenceFrom, sequenceDur, sequenceEnd: sequenceFrom + sequenceDur, nominalEnd: range.end };
    });
  }

  it('la última Sequence termina exactamente en getTotalFrames', () => {
    const durations = [3, 4, 3, 3, 4];
    const ranges = simulateSequenceRanges(durations);
    const last = ranges[ranges.length - 1]!;

    expect(last.sequenceEnd).toBe(getTotalFrames(scenes(...durations), FPS));
    expect(last.nominalEnd).toBe(last.sequenceEnd);
  });

  it('cada Sequence (salvo la primera) arranca antes que su límite nominal, nunca después', () => {
    const ranges = simulateSequenceRanges([2, 2, 5, 2]);
    expect(ranges[0]!.sequenceFrom).toBe(0);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i]!.sequenceFrom).toBeLessThan(ranges[i]!.nominalEnd);
      expect(ranges[i]!.sequenceFrom).toBeGreaterThanOrEqual(0);
    }
  });

  it('ninguna Sequence se solapa más allá del inicio de la escena previa', () => {
    // El crossfade de la escena i nunca debe empezar antes de que la escena
    // i-1 haya empezado la suya — dos escenas de más atrás no deben mezclarse.
    const durations = [2, 2, 2, 2];
    const ranges = simulateSequenceRanges(durations);
    for (let i = 1; i < ranges.length; i++) {
      const prevStart = ranges[i - 1]!.sequenceFrom;
      expect(ranges[i]!.sequenceFrom).toBeGreaterThanOrEqual(prevStart);
    }
  });
});
