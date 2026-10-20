// Utilidades de audio para la voz: duración de un WAV sin ffprobe y reparto
// de los tiempos por palabra sobre el texto del guion.

/**
 * Duración en segundos de un WAV PCM. OpenAI manda el WAV en streaming, con
 * el tamaño del chunk `data` a 0xFFFFFFFF: en ese caso se mide hasta el final
 * del buffer en vez de confiar en el encabezado.
 */
export function wavDurationSeconds(buf: Buffer): number | null {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= buf.length) {
    const id   = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      byteRate = buf.readUInt32LE(body + 8);
    } else if (id === 'data') {
      if (!byteRate) return null;
      const available = buf.length - body;
      const dataBytes = size === 0xffffffff || size === 0 || size > available ? available : size;
      return dataBytes / byteRate;
    }
    if (size === 0xffffffff) return null;
    offset = body + size + (size % 2);
  }
  return null;
}

export interface TimedWord {
  text:  string;
  start: number;
  end:   number;
}

/**
 * Tiempos por palabra para los subtítulos, con el texto exacto del guion.
 *
 * Whisper devuelve lo que oyó (sin puntuación, a veces con el nombre de la
 * marca partido o mal escrito, o «24/7» como varias palabras); el guion tiene
 * el texto bueno pero no los tiempos. Se reparte el habla de forma continua:
 * las N palabras del guion se distribuyen sobre las M palabras oídas, y cada
 * una ocupa su tramo proporcional del tiempo hablado (los silencios entre
 * palabras oídas no cuentan). Así ninguna palabra comparte tramo con otra —
 * antes dos palabras del guion podían caer en la misma palabra oída y se
 * resaltaban juntas. Sin whisper, se reparte la duración por largo de palabra.
 */
export function alignWords(
  line: string,
  durationSeconds: number,
  heard: Array<{ start: number; end: number }> = [],
): TimedWord[] {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const spans = heard
    .filter((h) => Number.isFinite(h.start) && Number.isFinite(h.end) && h.end >= h.start)
    .sort((a, b) => a.start - b.start);

  if (spans.length > 0) {
    const n = words.length;
    const m = spans.length;
    // Posición continua x ∈ [0, m] → segundo: dentro de la palabra oída k.
    const at = (x: number): number => {
      const k = Math.min(m - 1, Math.floor(x));
      const span = spans[k]!;
      const frac = Math.min(1, x - k);
      return span.start + frac * (span.end - span.start);
    };
    return words.map((text, i) => ({
      text,
      start: round(at((i * m) / n)),
      end:   round(at(((i + 1) * m) / n - 1e-9)),
    }));
  }

  const weights = words.map((w) => w.length + 2);
  const total   = weights.reduce((acc, w) => acc + w, 0);
  let t = 0;
  return words.map((text, i) => {
    const d = (weights[i]! / total) * durationSeconds;
    const word = { text, start: round(t), end: round(t + d) };
    t += d;
    return word;
  });
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
