import { useEffect, useState } from 'react';
import type React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { AnimatedGradientBg, LOGO_SFX, TRANSITION_SFX, isSvgUrl, overlapFor } from './ReelComposition';
import type { FilmCameraMove, FilmCompositionProps, FilmScene, FilmWord } from './film-types';

// ─── KefyFilm ─────────────────────────────────────────────────────────────────
//
// El montaje del pipeline de video (lib/video). A diferencia de KefyReel —
// fondo + titular + cuerpo por escena— aquí cada plano es un clip animado (o
// una foto con movimiento de cámara) con su voz, y el texto principal son los
// subtítulos de esa voz, palabra a palabra. Los titulares son opcionales.
//
// La duración total es la suma de los planos, igual que en KefyReel: las
// transiciones toman prestados frames de la cola del plano anterior (ver
// overlapFor) y no alargan el video.

export type { FilmCompositionProps } from './film-types';

const DEFAULT_SCENE_SECONDS = 3;
const MUSIC_VOLUME_SOLO   = 0.24;
/** Con voz, la música baja para no taparla. */
const MUSIC_VOLUME_UNDER  = 0.1;
const MUSIC_FADE_IN       = 24;
const MUSIC_FADE_OUT      = 45;
const CAPTION_MAX_WORDS   = 3;

function sceneSeconds(scene: Partial<FilmScene> | undefined): number {
  const d = scene?.duration_seconds;
  return typeof d === 'number' && d > 0 ? d : DEFAULT_SCENE_SECONDS;
}

export function getFilmSceneRanges(scenes: FilmScene[], fps: number) {
  let start = 0;
  return scenes.map((scene) => {
    const durationFrames = Math.max(1, Math.round(sceneSeconds(scene) * fps));
    const range = { start, end: start + durationFrames, durationFrames };
    start += durationFrames;
    return range;
  });
}

export function getFilmTotalFrames(scenes: FilmScene[], fps = 30): number {
  return scenes.reduce((acc, s) => acc + Math.max(1, Math.round(sceneSeconds(s) * fps)), 0);
}

export function calculateFilmMetadata(
  { props }: { props: Partial<FilmCompositionProps> },
  fps = 30,
): { durationInFrames: number } {
  const scenes = Array.isArray(props?.scenes) ? props.scenes : [];
  return { durationInFrames: Math.max(1, getFilmTotalFrames(scenes, fps)) };
}

/** Frames de transición de entrada de un plano. Los cortes secos y los planos
 *  que hablan desde su clip (lipsync) entran sin superponerse: la voz del clip
 *  arranca en su frame 0. */
export function filmIntroOffset(scene: FilmScene, index: number, durationFrames: number): number {
  if (index === 0 || scene.transition === 'cut') return 0;
  if (scene.visual.type === 'video' && scene.visual.has_audio) return 0;
  return overlapFor(durationFrames);
}

/**
 * Agrupa las palabras en «páginas» cortas de subtítulo: hasta
 * CAPTION_MAX_WORDS, cortando antes en una pausa de puntuación.
 */
export function captionPages(words: FilmWord[], maxWords = CAPTION_MAX_WORDS): FilmWord[][] {
  const pages: FilmWord[][] = [];
  let current: FilmWord[] = [];
  for (const w of words) {
    current.push(w);
    if (current.length >= maxWords || /[.,;:!?…]$/.test(w.text)) {
      pages.push(current);
      current = [];
    }
  }
  if (current.length) pages.push(current);
  return pages;
}

// ─── Cámara (fotos fijas) ─────────────────────────────────────────────────────

const CAMERA: Record<FilmCameraMove, { s: [number, number]; x: [number, number]; y: [number, number] }> = {
  push_in:   { s: [1.0, 1.12],  x: [0, -12],  y: [0, -8] },
  pull_out:  { s: [1.14, 1.0],  x: [-10, 0],  y: [6, 0] },
  pan_left:  { s: [1.12, 1.12], x: [40, -40], y: [0, 0] },
  pan_right: { s: [1.12, 1.12], x: [-40, 40], y: [0, 0] },
  static:    { s: [1.03, 1.05], x: [0, 0],    y: [0, 0] },
};

// ─── Subtítulos ───────────────────────────────────────────────────────────────

function Captions({ words, speechStartFrame, accentColor }: {
  words: FilmWord[]; speechStartFrame: number; accentColor: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame - speechStartFrame) / fps;
  if (t < 0 || words.length === 0) return null;

  const pages = captionPages(words);
  const page = pages.find((p, i) => {
    const next = pages[i + 1];
    return t >= p[0]!.start && (next ? t < next[0]!.start : t <= p[p.length - 1]!.end + 0.4);
  });
  if (!page) return null;

  const pageStartFrame = speechStartFrame + Math.round(page[0]!.start * fps);
  const pop = spring({ frame: frame - pageStartFrame, fps, config: { damping: 14, stiffness: 220, mass: 0.5 } });

  return (
    <div style={{
      position: 'absolute', left: 60, right: 60, bottom: 520,
      display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 16px',
      transform: `scale(${interpolate(pop, [0, 1], [0.86, 1])})`,
      opacity: interpolate(pop, [0, 1], [0, 1]),
    }}>
      {page.map((w, i) => {
        const active = t >= w.start && t < w.end + 0.05;
        return (
          <span key={`${w.start}-${i}`} style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontWeight: 900, fontSize: 70, lineHeight: 1.15, letterSpacing: '-0.5px',
            padding: '2px 14px', borderRadius: 14,
            color: active ? '#0b0b0f' : '#fff',
            background: active ? accentColor : 'transparent',
            textShadow: active ? 'none' : '0 4px 18px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.9)',
          }}>
            {w.text}
          </span>
        );
      })}
    </div>
  );
}

// ─── Plano ────────────────────────────────────────────────────────────────────

function FilmShot({ scene, durationFrames, introOffset, isFirst, isLast, accentColor, fontHeading, captions }: {
  scene:          FilmScene;
  durationFrames: number;
  introOffset:    number;
  isFirst:        boolean;
  isLast:         boolean;
  accentColor:    string;
  fontHeading?:   string;
  captions:       boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const settled = Math.max(0, frame - introOffset);

  // ── Entrada / salida ───────────────────────────────────────────────────
  const enter = introOffset > 0
    ? interpolate(frame, [0, introOffset], [0, 1], { extrapolateRight: 'clamp' })
    : 1;
  const exit = isLast
    ? interpolate(frame, [durationFrames - 12, durationFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;
  let transform = '';
  let opacity = exit;
  if (scene.transition === 'slide' && introOffset > 0) transform = `translateX(${(1 - enter) * 100}%)`;
  else if (scene.transition === 'zoom' && introOffset > 0) { transform = `scale(${1.15 - 0.15 * enter})`; opacity *= enter; }
  else opacity *= enter;

  // ── Visual ─────────────────────────────────────────────────────────────
  const cam = CAMERA[scene.camera] ?? CAMERA.push_in;
  const p = [0, Math.max(1, durationFrames)];
  const opts = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
  const camTransform = `scale(${interpolate(frame, p, cam.s, opts)}) translate(${interpolate(frame, p, cam.x, opts)}px, ${interpolate(frame, p, cam.y, opts)}px)`;

  let visual: React.ReactNode;
  if (scene.visual.type === 'video') {
    const clipFrames = Math.max(1, Math.round(scene.visual.clip_seconds * fps));
    const video = (
      <OffthreadVideo
        src={scene.visual.src}
        muted={!scene.visual.has_audio}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    );
    // Un clip más corto que el plano se repite en vez de congelarse en negro.
    visual = clipFrames < durationFrames
      ? <Loop durationInFrames={clipFrames}>{video}</Loop>
      : video;
  } else if (scene.visual.type === 'image') {
    visual = (
      <div style={{ width: '100%', height: '100%', transform: camTransform, transformOrigin: 'center' }}>
        <Img src={scene.visual.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  } else {
    visual = <AnimatedGradientBg frame={frame} durationFrames={durationFrames} accentColor={accentColor} />;
  }

  // ── Titular ────────────────────────────────────────────────────────────
  const titlePop = spring({ frame: settled - 4, fps, config: { damping: 12, stiffness: 240, mass: 0.6 } });
  const headingFont = fontHeading ? `'${fontHeading}', system-ui, sans-serif` : 'system-ui, sans-serif';
  const speechStart = introOffset + Math.round(scene.speech_offset * fps);

  return (
    <AbsoluteFill style={{ opacity, transform }}>
      <AbsoluteFill style={{ overflow: 'hidden' }}>{visual}</AbsoluteFill>

      {/* Legibilidad de titular y subtítulos */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)',
      }} />

      {scene.voice && (
        <Sequence from={speechStart} layout="none">
          <Audio src={scene.voice.src} volume={1} />
        </Sequence>
      )}

      {scene.on_screen_text && (
        <div style={{
          position: 'absolute', top: 220, left: 68, right: 68,
          transform: `scale(${interpolate(titlePop, [0, 1], [0.8, 1])})`,
          opacity: interpolate(titlePop, [0, 1], [0, 1]),
          transformOrigin: 'left top',
        }}>
          <span style={{
            display: 'inline',
            fontFamily: headingFont, fontWeight: 900,
            fontSize: isFirst ? 92 : 68, lineHeight: 1.12, letterSpacing: '-1.5px',
            color: '#fff',
            textShadow: '0 4px 28px rgba(0,0,0,0.85)',
            boxShadow: `inset 0 -0.22em 0 ${accentColor}`,
          }}>
            {scene.on_screen_text}
          </span>
        </div>
      )}

      {captions && <Captions words={scene.words} speechStartFrame={speechStart} accentColor={accentColor} />}
    </AbsoluteFill>
  );
}

// ─── Composición ──────────────────────────────────────────────────────────────

export function FilmComposition({
  scenes, brandName, accentColor = '#c6ff4b', fontHeading, logoUrl, musicTrack, captions = true,
}: FilmCompositionProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const ranges = getFilmSceneRanges(scenes, fps);
  const hasSpeech = scenes.some((s) => s.voice || (s.visual.type === 'video' && s.visual.has_audio));
  const musicLevel = hasSpeech ? MUSIC_VOLUME_UNDER : MUSIC_VOLUME_SOLO;

  const [fontHandle] = useState(() => delayRender('Loading brand font'));
  useEffect(() => {
    if (!fontHeading) { continueRender(fontHandle); return; }
    const link  = document.createElement('link');
    link.rel    = 'stylesheet';
    link.href   = `https://fonts.googleapis.com/css2?family=${fontHeading.replace(/ /g, '+')}:wght@400;700;900&display=swap`;
    link.onload = () => continueRender(fontHandle);
    link.onerror = () => continueRender(fontHandle);
    document.head.appendChild(link);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoSpring = spring({ frame, fps, config: { damping: 16, stiffness: 100 } });
  const logoStyle: React.CSSProperties = {
    position: 'absolute', top: 52, left: 52, height: 64, maxWidth: 220, objectFit: 'contain',
    filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.75))',
    transform: `scale(${interpolate(logoSpring, [0, 1], [0.55, 1])})`,
    opacity: interpolate(logoSpring, [0, 1], [0, 1]),
    transformOrigin: 'top left',
  };

  return (
    <AbsoluteFill style={{ background: '#080810' }}>
      {musicTrack && (
        <Audio
          src={staticFile(`audio/music/${musicTrack}`)}
          loop
          volume={(f) => {
            const fadeIn  = interpolate(f, [0, Math.min(MUSIC_FADE_IN, durationInFrames)], [0, musicLevel], { extrapolateRight: 'clamp' });
            const outFrom = Math.max(0, durationInFrames - MUSIC_FADE_OUT);
            const fadeOut = f <= outFrom ? musicLevel : musicLevel * Math.max(0, 1 - (f - outFrom) / MUSIC_FADE_OUT);
            return Math.min(fadeIn, fadeOut);
          }}
        />
      )}

      {(logoUrl || brandName) && (
        <Sequence from={4} durationInFrames={30} layout="none">
          <Audio src={staticFile(`audio/sfx/${LOGO_SFX}`)} volume={0.4} />
        </Sequence>
      )}

      {scenes.map((scene, i) => {
        const range = ranges[i]!;
        const introOffset = filmIntroOffset(scene, i, range.durationFrames);
        return (
          <Sequence key={scene.id ?? i} from={range.start - introOffset} durationInFrames={range.durationFrames + introOffset}>
            {i > 0 && scene.transition !== 'cut' && (
              <Audio src={staticFile(`audio/sfx/${TRANSITION_SFX[i % TRANSITION_SFX.length]}`)} volume={0.25} />
            )}
            <FilmShot
              scene={scene}
              durationFrames={range.durationFrames + introOffset}
              introOffset={introOffset}
              isFirst={i === 0}
              isLast={i === scenes.length - 1}
              accentColor={accentColor}
              fontHeading={fontHeading}
              captions={captions}
            />
          </Sequence>
        );
      })}

      {logoUrl ? (
        isSvgUrl(logoUrl)
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logoUrl} alt="" style={logoStyle} />
          : <Img src={logoUrl} style={logoStyle} />
      ) : brandName ? (
        <span style={{
          ...logoStyle, height: undefined, maxWidth: undefined,
          fontFamily: fontHeading ? `'${fontHeading}', system-ui, sans-serif` : 'system-ui, sans-serif',
          fontWeight: 800, fontSize: 26, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.75)',
        }}>
          {brandName}
        </span>
      ) : null}

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,0.10)' }}>
        <div style={{ height: '100%', width: `${(frame / Math.max(1, durationInFrames)) * 100}%`, background: accentColor }} />
      </div>
    </AbsoluteFill>
  );
}
