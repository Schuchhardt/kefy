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

/** Elección determinística: el mismo id siempre cae en la misma pista. */
export function pickMusicTrack(seed: string): string | undefined {
  if (MUSIC_TRACKS.length === 0) return undefined;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % MUSIC_TRACKS.length;
  return MUSIC_TRACKS[index];
}
