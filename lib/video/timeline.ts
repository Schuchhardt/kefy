// ─── Línea de tiempo del montaje ──────────────────────────────────────────────
//
// Junta el guion con lo que produjo cada herramienta y arma las props de la
// composición KefyFilm. Pura: el motor la llama justo antes del montaje.
//
// La duración de cada plano la manda la voz, no el guion: el guion estima
// «3 segundos», el TTS dice 3,7 — y cortar la frase a la mitad es peor que un
// plano un poco más largo. Sin voz, se usa la duración del guion.
//
// Cada pieza tiene su respaldo, así un paso fallido no tumba el video:
//   lipsync o clip que dice la línea → clip animado + voz aparte →
//   foto con movimiento → fondo de marca.
//
// Un clip que dice la línea (Higgsfield, `has_audio` en la salida de anim_*)
// manda sobre el plano igual que la voz: dura lo que el clip y sus palabras
// son los subtítulos.

import type { VideoScript } from '@/lib/video/script';
import { alignWords } from '@/lib/video/tools/audio';
import type { FilmCompositionProps, FilmScene, FilmTheme, FilmVisual, FilmWord } from '@/remotion/film-types';

/** La voz entra un poco después del corte, no pegada a él. */
export const SPEECH_LEAD_SECONDS = 0.2;
/** Aire después de la última palabra antes del siguiente plano. */
export const SPEECH_TAIL_SECONDS = 0.35;
export const FILM_SCENE_MIN_SECONDS = 1.5;
export const FILM_SCENE_MAX_SECONDS = 15;
/** Tarjeta de cierre con el logo: solo si la marca tiene logo o nombre. */
export const OUTRO_SECONDS = 2.2;

export type StepOutputs = Record<string, Record<string, unknown> | undefined>;


function url(v: unknown): string | null {
  return typeof v === 'string' && /^https?:\/\//.test(v) ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

function words(v: unknown): FilmWord[] {
  if (!Array.isArray(v)) return [];
  return v.filter((w): w is FilmWord =>
    !!w && typeof w === 'object' && typeof (w as FilmWord).text === 'string'
    && typeof (w as FilmWord).start === 'number' && typeof (w as FilmWord).end === 'number');
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function buildFilmProps(
  script: VideoScript,
  outputs: StepOutputs,
  theme: FilmTheme,
  musicTrack?: string,
): FilmCompositionProps {
  const scenes: FilmScene[] = script.scenes.map((scene) => {
    const image = url(outputs[`img_${scene.id}`]?.image_url) ?? url(scene.visual.image_url);
    const anim  = outputs[`anim_${scene.id}`];
    const lips  = outputs[`lips_${scene.id}`];
    const voice = outputs[`voice_${scene.id}`];

    const voiceUrl      = url(voice?.audio_url);
    const voiceSeconds  = voiceUrl ? num(voice?.duration_seconds) : null;
    const lipsUrl       = url(lips?.video_url);
    const animUrl       = url(anim?.video_url);
    const clipSeconds   = num(anim?.clip_seconds) ?? 5;
    // El clip dice la línea (no hay voz aparte para este plano).
    const animSpeaks    = !!animUrl && anim?.has_audio === true;

    let visual: FilmVisual;
    // `poster`: la foto del plano, que queda debajo del clip y lo reemplaza
    // si el clip termina antes que el plano.
    if (lipsUrl) {
      // El clip con lipsync dura lo que la voz (sync_mode 'loop').
      visual = { type: 'video', src: lipsUrl, clip_seconds: voiceSeconds ?? clipSeconds, has_audio: true, poster: image };
    } else if (animUrl) {
      visual = { type: 'video', src: animUrl, clip_seconds: clipSeconds, has_audio: animSpeaks, poster: image };
    } else if (image) {
      visual = { type: 'image', src: image };
    } else {
      visual = { type: 'none' };
    }

    // El clip con lipsync ya trae la voz desde su segundo 0.
    const speechInClip  = visual.type === 'video' && visual.has_audio;
    const speechOffset  = voiceSeconds ? (speechInClip ? 0 : SPEECH_LEAD_SECONDS) : 0;
    // Con voz, el plano dura lo que la voz: nunca se corta una frase (el tope
    // solo aplica a los planos mudos; el guion ya acota el largo de la línea).
    const duration = voiceSeconds
      ? Math.max(FILM_SCENE_MIN_SECONDS, speechOffset + voiceSeconds + SPEECH_TAIL_SECONDS)
      : animSpeaks
        ? clamp(clipSeconds, FILM_SCENE_MIN_SECONDS, FILM_SCENE_MAX_SECONDS)
        : clamp(scene.duration_seconds, FILM_SCENE_MIN_SECONDS, FILM_SCENE_MAX_SECONDS);

    // Subtítulos: los de la voz, o los del clip que dice la línea. Si ese clip
    // falló, la línea no se oye en ningún lado: al menos se lee, repartida
    // sobre el plano.
    const lineWithoutAudio = !voiceUrl && !speechInClip && scene.visual.kind === 'talking' && !!scene.line;
    const sceneWords = voiceSeconds
      ? words(voice?.words)
      : animSpeaks
        ? words(anim?.words)
        : lineWithoutAudio
          ? alignWords(scene.line!, duration - SPEECH_TAIL_SECONDS)
          : [];

    return {
      id:               scene.id,
      duration_seconds: Math.round(duration * 100) / 100,
      visual,
      camera:           scene.visual.camera,
      voice:            voiceUrl && !speechInClip ? { src: voiceUrl } : null,
      speech_offset:    speechOffset,
      words:            sceneWords,
      on_screen_text:   scene.on_screen_text,
      transition:       scene.transition,
    };
  });

  return {
    scenes,
    theme,
    outro: theme.logoUrl || theme.brandName ? { duration_seconds: OUTRO_SECONDS, headline: null } : null,
    musicTrack,
    captions: true,
  };
}

/** Foto de cada plano, para las previews y la portada de la pieza. */
export function sceneImageUrls(script: VideoScript, outputs: StepOutputs): Record<string, string | null> {
  return Object.fromEntries(script.scenes.map((s) => [s.id, url(outputs[`img_${s.id}`]?.image_url) ?? url(s.visual.image_url)]));
}
