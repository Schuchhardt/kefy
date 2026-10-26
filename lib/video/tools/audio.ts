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

const LETTER_NAMES_ES: Record<string, string> = {
  a: 'a', b: 'be', c: 'ce', d: 'de', e: 'e', f: 'efe', g: 'ge', h: 'hache', i: 'i', j: 'jota',
  k: 'ka', l: 'ele', m: 'eme', n: 'ene', ñ: 'eñe', o: 'o', p: 'pe', q: 'cu', r: 'erre', s: 'ese',
  t: 'te', u: 'u', v: 've', w: 'doble ve', x: 'equis', y: 'ye', z: 'zeta',
};
/** Terminaciones que se leen como palabra; las demás (`.cl`, `.mx`) se deletrean. */
const WORD_TLDS = new Set(['com', 'net', 'org', 'app', 'info', 'shop', 'store', 'online', 'site', 'blog']);
const DOMAIN = /\b(?:www\.)?((?:[a-z0-9-]+\.)+)([a-z]{2,6})\b/gi;

/**
 * Lo que dice la voz de una línea del guion. La línea es también el
 * subtítulo, así que se escribe como se lee en pantalla («depando.cl»); aquí
 * se pasa a como se pronuncia («depando punto ce ele») solo para el TTS. Los
 * subtítulos siguen saliendo del texto escrito (`alignWords` reparte las
 * palabras escritas sobre las habladas aunque no sean las mismas).
 */
export function spokenText(line: string, language: 'es' | 'en'): string {
  const dot = language === 'es' ? ' punto ' : ' dot ';
  const spell = (tld: string) => [...tld.toLowerCase()]
    .map((ch) => (language === 'es' ? LETTER_NAMES_ES[ch] ?? ch : ch.toUpperCase()))
    .join(' ');
  return line.replace(DOMAIN, (_m, labels: string, tld: string) => {
    const name = labels.slice(0, -1).split('.').join(dot);
    return `${name}${dot}${WORD_TLDS.has(tld.toLowerCase()) ? tld.toLowerCase() : spell(tld)}`;
  });
}

/**
 * Tramos de cada palabra a partir de la alineación por carácter de ElevenLabs
 * (`/with-timestamps`): cada racha de caracteres sin espacio es una palabra.
 * Es lo mismo que devuelve whisper, sin tener que transcribir el audio.
 */
export function alignmentWordSpans(alignment: {
  characters?:                    unknown;
  character_start_times_seconds?: unknown;
  character_end_times_seconds?:   unknown;
} | null | undefined): Array<{ start: number; end: number }> {
  const chars  = Array.isArray(alignment?.characters) ? alignment.characters : [];
  const starts = Array.isArray(alignment?.character_start_times_seconds) ? alignment.character_start_times_seconds : [];
  const ends   = Array.isArray(alignment?.character_end_times_seconds) ? alignment.character_end_times_seconds : [];
  const spans: Array<{ start: number; end: number }> = [];
  let current: { start: number; end: number } | null = null;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const start = starts[i];
    const end = ends[i];
    if (typeof ch !== 'string' || typeof start !== 'number' || typeof end !== 'number') continue;
    if (/\s/.test(ch)) {
      current = null;
      continue;
    }
    if (current) current.end = end;
    else {
      current = { start, end };
      spans.push(current);
    }
  }
  return spans;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
