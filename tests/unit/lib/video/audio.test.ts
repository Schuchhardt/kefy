import { describe, it, expect } from 'vitest';
import { alignWords, alignmentWordSpans, wavDurationSeconds } from '@/lib/video/tools/audio';

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

  it('con más palabras en el guion que las oídas, cada una tiene su tramo y no se pisan', () => {
    // «24/7» se oye como dos palabras y «depando.cl» como tres: los conteos no cuadran.
    const words = alignWords('Atención 24/7 en depando.cl ya', 3, [
      { start: 0, end: 0.5 }, { start: 0.6, end: 1.4 }, { start: 1.5, end: 2.6 },
    ]);
    expect(words.map((w) => w.text)).toEqual(['Atención', '24/7', 'en', 'depando.cl', 'ya']);
    for (let i = 1; i < words.length; i++) {
      expect(words[i]!.start).toBeGreaterThanOrEqual(words[i - 1]!.end);
      expect(words[i]!.end).toBeGreaterThan(words[i]!.start);
    }
    expect(words[0]!.start).toBe(0);
    expect(words[words.length - 1]!.end).toBeCloseTo(2.6, 2);
  });

  it('sin whisper reparte la duración por largo de palabra', () => {
    const words = alignWords('a bbbb', 2);
    expect(words[0]!.start).toBe(0);
    expect(words[1]!.end).toBeCloseTo(2, 5);
    expect(words[1]!.end - words[1]!.start).toBeGreaterThan(words[0]!.end - words[0]!.start);
  });
});

describe('alignmentWordSpans', () => {
  it('agrupa los caracteres de ElevenLabs en palabras, saltando los espacios', () => {
    expect(alignmentWordSpans({
      characters:                    ['H', 'o', 'l', 'a', ' ', 'y', 'a', '.'],
      character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
      character_end_times_seconds:   [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    })).toEqual([{ start: 0, end: 0.4 }, { start: 0.5, end: 0.8 }]);
  });

  it('sin alineación, ninguna palabra', () => {
    expect(alignmentWordSpans(null)).toEqual([]);
    expect(alignmentWordSpans({ characters: 'nope' })).toEqual([]);
  });
});
