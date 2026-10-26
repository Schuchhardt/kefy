// Música de fondo disponible para los reels/stories.
//
// Los archivos viven en `remotion/public/audio/music/` (ver README ahí) y se
// suben al bundle de Remotion Lambda tal cual — por eso esta lista es un
// array fijo y no un `fs.readdir`: el route handler que la importa corre en
// Vercel, donde el file tracing solo empaqueta lo que el código referencia
// explícitamente, no un directorio leído en runtime.
//
// Para agregar/quitar una pista: edita este array y el archivo en
// `public/audio/music/`, luego re-despliega
// (`npx tsx scripts/deploy-remotion-lambda.ts`).
export const MUSIC_TRACKS: string[] = [
  'landr-cello-flowing.mp3',
  'landr-hard-house.mp3',
  'landr-iridescent-wave.mp3',
  'landr-sitar-flow.mp3',
  'landr-spirit-kiss.mp3',
  'landr-sweet-phase.mp3',
  'softverse-fatum-space.mp3',
  'softverse-pianocello-space.mp3',
  'softverse-smooth-space.mp3',
];

/**
 * Ánimo de cada pista, para elegir según el `music_mood` del guion y el tono
 * de la marca. Una pista puede tener varios. Al agregar una pista nueva,
 * etiquetarla aquí (si no, solo sale cuando ningún ánimo coincide).
 */
export const TRACK_MOODS: Record<string, string[]> = {
  'landr-cello-flowing.mp3':        ['elegant', 'emotional'],
  'landr-hard-house.mp3':           ['energetic'],
  'landr-iridescent-wave.mp3':      ['energetic', 'tech'],
  'landr-sitar-flow.mp3':           ['calm'],
  'landr-spirit-kiss.mp3':          ['emotional', 'calm'],
  'landr-sweet-phase.mp3':          ['calm', 'friendly'],
  'softverse-fatum-space.mp3':      ['tech', 'epic'],
  'softverse-pianocello-space.mp3': ['elegant', 'emotional'],
  'softverse-smooth-space.mp3':     ['calm', 'tech'],
};

/** Palabras (es/en) que delatan cada ánimo en el guion o en el tono de marca. */
const MOOD_KEYWORDS: Array<[string, RegExp]> = [
  ['energetic', /energ|upbeat|party|fiesta|din[aá]m|dynamic|hype|fun|divert|bold|atrev|intens/i],
  ['calm',      /calm|tranq|relax|chill|suave|smooth|wellness|bienestar|zen|sereno/i],
  ['elegant',   /elegan|premium|luxur|lujo|sofistic|minimal|refin/i],
  ['emotional', /emoti|inspir|warm|c[aá]lid|cercan|human|nostalg|heart/i],
  ['tech',      /tech|tecno|modern|futur|innov|digital|startup/i],
  ['friendly',  /friend|amig|playful|juguet|casual|cozy|uplift|hope|esperanz|optimis|positiv|alegr|cheer/i],
  ['epic',      /epic|[eé]pic|dramat|cinemat|power|poder/i],
];

function hashOf(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Elección determinística: el mismo id siempre cae en la misma pista. Con
 * `mood` (el del guion, el tono de la marca…), elige entre las pistas de ese
 * ánimo; si ninguna coincide, entre todas.
 *
 * `avoid`: pistas que la marca usó hace poco. Con un ánimo fijo de marca el
 * grupo es de 3-4 pistas y el hash repetía la misma video tras video; así
 * rotan. Si evitarlas deja el grupo vacío, se usan las del ánimo de todos
 * modos, y si el ánimo solo tiene pistas recientes, se pasa a las demás.
 */
export function pickMusicTrack(seed: string, mood?: string | null, avoid: string[] = []): string | undefined {
  if (MUSIC_TRACKS.length === 0) return undefined;
  const moods = mood ? MOOD_KEYWORDS.filter(([, re]) => re.test(mood)).map(([m]) => m) : [];
  const matching = moods.length
    ? MUSIC_TRACKS.filter((t) => (TRACK_MOODS[t] ?? []).some((m) => moods.includes(m)))
    : [];
  const fresh = (pool: string[]) => pool.filter((t) => !avoid.includes(t));
  const pool = [fresh(matching), fresh(MUSIC_TRACKS), matching, MUSIC_TRACKS].find((p) => p.length)!;
  return pool[hashOf(seed) % pool.length];
}
