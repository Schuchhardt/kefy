import { describe, it, expect } from 'vitest';
import { alignWords, wavDurationSeconds } from '@/lib/video/tools/audio';

function wav(seconds: number, opts: { streamed?: boolean } = {}): Buffer {
  const sampleRate = 24000;
  const byteRate = sampleRate * 2;
  const dataBytes = Math.round(seconds * byteRate);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(opts.streamed ? 0xffffffff : 36 + dataBytes, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(opts.streamed ? 0xffffffff : dataBytes, 40);
  return Buffer.concat([header, Buffer.alloc(dataBytes)]);
}

describe('wavDurationSeconds', () => {
  it('lee la duración del encabezado', () => {
    expect(wavDurationSeconds(wav(2.5))).toBeCloseTo(2.5, 3);
  });

  it('con el tamaño de streaming (0xFFFFFFFF) mide hasta el final del archivo', () => {
    expect(wavDurationSeconds(wav(1.25, { streamed: true }))).toBeCloseTo(1.25, 3);
  });

  it('null si no es un WAV', () => {
    expect(wavDurationSeconds(Buffer.from('ID3 not a wav file at all, nope nope nope nope'))).toBeNull();
  });
});

describe('alignWords', () => {
  it('conserva el texto del guion con los tiempos de whisper', () => {
    const words = alignWords('Hola, Kefy!', 1, [{ start: 0.1, end: 0.4 }, { start: 0.5, end: 0.9 }]);
    expect(words).toEqual([
      { text: 'Hola,', start: 0.1, end: 0.4 },
      { text: 'Kefy!', start: 0.5, end: 0.9 },
    ]);
  });

  it('sin whisper reparte la duración por largo de palabra', () => {
    const words = alignWords('a bbbb', 2);
    expect(words[0]!.start).toBe(0);
    expect(words[1]!.end).toBeCloseTo(2, 5);
    expect(words[1]!.end - words[1]!.start).toBeGreaterThan(words[0]!.end - words[0]!.start);
  });
});
