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
 * Whisper devuelve lo que oyó (sin puntuación, y a veces con el nombre de la
 * marca mal escrito); el guion tiene el texto bueno pero no los tiempos. Se
 * reparte: la palabra i del guion toma el tiempo de la palabra proporcional
 * de whisper. Sin whisper, se reparte la duración por largo de palabra.
 */
export function alignWords(
  line: string,
  durationSeconds: number,
  heard: Array<{ start: number; end: number }> = [],
): TimedWord[] {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  if (heard.length > 0) {
    return words.map((text, i) => {
      const a = heard[Math.min(heard.length - 1, Math.floor((i * heard.length) / words.length))]!;
      const nextIdx = Math.floor(((i + 1) * heard.length) / words.length) - 1;
      const b = heard[Math.min(heard.length - 1, Math.max(nextIdx, 0))]!;
      return { text, start: a.start, end: Math.max(a.start, b.end) };
    });
  }

  const weights = words.map((w) => w.length + 2);
  const total   = weights.reduce((acc, w) => acc + w, 0);
  let t = 0;
  return words.map((text, i) => {
    const d = (weights[i]! / total) * durationSeconds;
    const word = { text, start: t, end: t + d };
    t += d;
    return word;
  });
}
