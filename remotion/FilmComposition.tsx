import { useEffect, useState } from 'react';
import type React from 'react';
import {
  AbsoluteFill,
  Audio,
  Freeze,
  Img,
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
import { LOGO_SFX, TRANSITION_SFX, isSvgUrl, overlapFor } from './ReelComposition';
import type { FilmCameraMove, FilmCompositionProps, FilmOutro, FilmScene, FilmTheme, FilmWord } from './film-types';

// ─── KefyFilm ─────────────────────────────────────────────────────────────────
//
// El montaje del pipeline de video (lib/video). A diferencia de KefyReel —
// fondo + titular + cuerpo por escena— aquí cada plano es un clip animado (o
// una foto con movimiento de cámara) con su voz, y el texto principal son los
// subtítulos de esa voz, palabra a palabra. Los titulares son opcionales.
//
// Todo el diseño sale de `theme` (lib/video/brand.ts): acento, tipografías,
// fondo y logo de la marca, o el respaldo cuando la marca no los definió. La
// composición no decide colores: solo los aplica.
//
// La duración total es la suma de los planos más el cierre: las transiciones
// toman prestados frames de la cola del plano anterior (ver overlapFor) y no
// alargan el video.

export type { FilmCompositionProps } from './film-types';

const DEFAULT_SCENE_SECONDS = 3;
const MUSIC_VOLUME_SOLO   = 0.24;
/** Con voz, la música baja para no taparla. */
const MUSIC_VOLUME_UNDER  = 0.1;
const MUSIC_FADE_IN       = 24;
const MUSIC_FADE_OUT      = 45;
const CAPTION_MAX_WORDS   = 3;
/** El cierre entra fundiéndose sobre la cola del último plano. */
const OUTRO_OVERLAP       = 12;

/** Respaldo si una props vieja llega sin theme (no debería). */
const DEFAULT_THEME: FilmTheme = {
  accent: '#ffd23f', onAccent: '#0b0b0f', primary: '#14141c', secondary: '#2a2440', onPrimary: '#ffffff',
  headingFont: 'Montserrat', bodyFont: 'Montserrat', branded: false,
};

function sceneSeconds(scene: Partial<FilmScene> | undefined): number {
  const d = scene?.duration_seconds;
  return typeof d === 'number' && d > 0 ? d : DEFAULT_SCENE_SECONDS;
}

function outroFrames(outro: FilmOutro | null | undefined, fps: number): number {
  const d = outro?.duration_seconds;
  return typeof d === 'number' && d > 0 ? Math.round(d * fps) : 0;
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

export function getFilmTotalFrames(scenes: FilmScene[], fps = 30, outro?: FilmOutro | null): number {
  return scenes.reduce((acc, s) => acc + Math.max(1, Math.round(sceneSeconds(s) * fps)), 0) + outroFrames(outro, fps);
}

export function calculateFilmMetadata(
  { props }: { props: Partial<FilmCompositionProps> },
  fps = 30,
): { durationInFrames: number } {
  const scenes = Array.isArray(props?.scenes) ? props.scenes : [];
  return { durationInFrames: Math.max(1, getFilmTotalFrames(scenes, fps, props?.outro)) };
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

function fontStack(family: string): string {
  return `'${family}', 'Montserrat', system-ui, -apple-system, sans-serif`;
}

// ─── Tipografías ──────────────────────────────────────────────────────────────
// Se piden a Google Fonts desde el navegador del render (local y Lambda). No
// todas las familias tienen 800/900: la API responde 400 si se pide un peso
// que no existe, así que se prueba de más a menos pesos. Después se espera a
// que la fuente esté de verdad cargada (document.fonts.load), no solo la hoja
// de estilos: si no, los primeros frames salen con la fuente del sistema.

const WEIGHT_SETS = ['400;600;700;800;900', '400;700;900', '400;700', ''];

async function loadGoogleFont(family: string): Promise<void> {
  for (const weights of WEIGHT_SETS) {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}${weights ? `:wght@${weights}` : ''}&display=block`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const style = document.createElement('style');
      style.textContent = await res.text();
      document.head.appendChild(style);
      await Promise.all(['400', '700', '800', '900'].map((w) => document.fonts.load(`${w} 64px '${family}'`).catch(() => [])));
      return;
    } catch {
      // Sin red o familia inexistente: se prueba la siguiente variante y, al
      // final, queda la pila de respaldo de fontStack.
    }
  }
}

// ─── Imágenes que no tumban el render ─────────────────────────────────────────
// Remotion cancela el render entero si un <Img> no carga (tras sus
// reintentos). Una foto de un reel viejo borrada del Storage, o un logo que
// cambió de URL, no puede costar el video: con onError, la imagen se oculta y
// queda lo que haya debajo (el fondo de marca).

function SafeImg({ src, style, onFail }: { src: string; style: React.CSSProperties; onFail?: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const fail = () => { setFailed(true); onFail?.(); };
  if (isSvgUrl(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={style} onError={fail} />;
  }
  return <Img src={src} style={style} maxRetries={2} onError={fail} />;
}

// ─── Cámara (fotos fijas) ─────────────────────────────────────────────────────

const CAMERA: Record<FilmCameraMove, { s: [number, number]; x: [number, number]; y: [number, number] }> = {
  push_in:   { s: [1.0, 1.12],  x: [0, -12],  y: [0, -8] },
  pull_out:  { s: [1.14, 1.0],  x: [-10, 0],  y: [6, 0] },
  pan_left:  { s: [1.12, 1.12], x: [40, -40], y: [0, 0] },
  pan_right: { s: [1.12, 1.12], x: [-40, 40], y: [0, 0] },
  static:    { s: [1.03, 1.05], x: [0, 0],    y: [0, 0] },
};

// ─── Fondo de marca (planos sin imagen) ───────────────────────────────────────

function BrandBackdrop({ frame, durationFrames, theme }: { frame: number; durationFrames: number; theme: FilmTheme }) {
  const t  = frame / Math.max(durationFrames, 1);
  const x1 = 30 + Math.sin(t * Math.PI * 2) * 20;
  const y1 = 25 + Math.cos(t * Math.PI * 1.5) * 15;
  const x2 = 70 + Math.cos(t * Math.PI * 1.5) * 18;
  const y2 = 72 + Math.sin(t * Math.PI * 2) * 12;
  return (
    <div style={{
      width: '100%', height: '100%',
      background: [
        `radial-gradient(ellipse at ${x1}% ${y1}%, ${theme.accent}33 0%, transparent 55%)`,
        `radial-gradient(ellipse at ${x2}% ${y2}%, ${theme.secondary} 0%, transparent 60%)`,
        `linear-gradient(160deg, ${theme.primary} 0%, ${theme.secondary} 55%, ${theme.primary} 100%)`,
      ].join(', '),
    }} />
  );
}

// ─── Subtítulos ───────────────────────────────────────────────────────────────

function Captions({ words, speechStartFrame, theme }: {
  words: FilmWord[]; speechStartFrame: number; theme: FilmTheme;
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
      position: 'absolute', left: 64, right: 64, bottom: 500,
      display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 14px',
      transform: `scale(${interpolate(pop, [0, 1], [0.86, 1])})`,
      opacity: interpolate(pop, [0, 1], [0, 1]),
    }}>
      {page.map((w, i) => {
        // Una sola palabra activa: la última que ya empezó, mientras dure (o
        // hasta que empiece la siguiente, si hay una pausa corta entre medio).
        const next = page[i + 1];
        const active = t >= w.start && (next ? t < next.start : t <= w.end + 0.25);
        return (
          <span key={`${w.start}-${i}`} style={{
            fontFamily: fontStack(theme.bodyFont),
            fontWeight: 800, fontSize: 74, lineHeight: 1.15, letterSpacing: '-0.5px',
            padding: '2px 14px', borderRadius: 14,
            color: active ? theme.onAccent : '#ffffff',
            background: active ? theme.accent : 'transparent',
            textShadow: active ? 'none' : '0 4px 18px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.95)',
          }}>
            {w.text}
          </span>
        );
      })}
    </div>
  );
}

// ─── Plano ────────────────────────────────────────────────────────────────────

function FilmShot({ scene, durationFrames, introOffset, isFirst, fadeOut, theme, captions }: {
  scene:          FilmScene;
  durationFrames: number;
  introOffset:    number;
  isFirst:        boolean;
  /** El último plano funde a negro si no hay cierre que lo cubra. */
  fadeOut:        boolean;
  theme:          FilmTheme;
  captions:       boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const settled = Math.max(0, frame - introOffset);

  // ── Entrada / salida ───────────────────────────────────────────────────
  const enter = introOffset > 0
    ? interpolate(frame, [0, introOffset], [0, 1], { extrapolateRight: 'clamp' })
    : 1;
  const exit = fadeOut
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

  // Debajo de cada foto, el fondo de marca: si la foto no carga, queda ese.
  const photo = (src: string) => (
    <>
      <AbsoluteFill><BrandBackdrop frame={frame} durationFrames={durationFrames} theme={theme} /></AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, transform: camTransform, transformOrigin: 'center' }}>
        <SafeImg src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    </>
  );

  let visual: React.ReactNode;
  if (scene.visual.type === 'video') {
    // El clip corre una sola vez. Repetirlo con <Loop> se notaba como un salto
    // y, en un clip con lipsync, repetía las primeras sílabas de la línea. Si
    // termina antes que el plano, queda congelado su último cuadro (mudo) sobre
    // la foto del plano.
    const clipFrames = Math.max(1, Math.round(scene.visual.clip_seconds * fps));
    const { src, has_audio: hasAudio, poster } = scene.visual;
    visual = (
      <>
        {poster && <AbsoluteFill>{photo(poster)}</AbsoluteFill>}
        <Sequence durationInFrames={Math.min(clipFrames, durationFrames)} layout="none">
          <AbsoluteFill>
            <OffthreadVideo src={src} muted={!hasAudio} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </AbsoluteFill>
        </Sequence>
        {clipFrames < durationFrames && (
          <Sequence from={clipFrames} layout="none">
            <AbsoluteFill>
              <Freeze frame={Math.max(0, clipFrames - 1)}>
                <OffthreadVideo src={src} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </Freeze>
            </AbsoluteFill>
          </Sequence>
        )}
      </>
    );
  } else if (scene.visual.type === 'image') {
    visual = photo(scene.visual.src);
  } else {
    visual = <BrandBackdrop frame={frame} durationFrames={durationFrames} theme={theme} />;
  }

  // ── Titular ────────────────────────────────────────────────────────────
  const titlePop = spring({ frame: settled - 4, fps, config: { damping: 12, stiffness: 240, mass: 0.6 } });
  const speechStart = introOffset + Math.round(scene.speech_offset * fps);

  return (
    <AbsoluteFill style={{ opacity, transform }}>
      <AbsoluteFill style={{ overflow: 'hidden' }}>{visual}</AbsoluteFill>

      {/* Legibilidad de titular y subtítulos */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.58) 100%)',
      }} />

      {scene.voice && (
        <Sequence from={speechStart} layout="none">
          <Audio src={scene.voice.src} volume={1} />
        </Sequence>
      )}

      {scene.on_screen_text && (
        <div style={{
          position: 'absolute', top: isFirst ? 250 : 230, left: 64, right: 64,
          transform: `scale(${interpolate(titlePop, [0, 1], [0.8, 1])}) rotate(${interpolate(titlePop, [0, 1], [-2, 0])}deg)`,
          opacity: interpolate(titlePop, [0, 1], [0, 1]),
          transformOrigin: 'left top',
          lineHeight: 1.32,
        }}>
          <span style={{
            fontFamily: fontStack(theme.headingFont), fontWeight: 900,
            fontSize: isFirst ? 84 : 60, letterSpacing: '-1px',
            color: theme.onAccent, background: theme.accent,
            padding: '4px 20px', borderRadius: 14,
            boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
            boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
          }}>
            {scene.on_screen_text}
          </span>
        </div>
      )}

      {captions && <Captions words={scene.words} speechStartFrame={speechStart} theme={theme} />}
    </AbsoluteFill>
  );
}

// ─── Marca: logo y cierre ─────────────────────────────────────────────────────

function Wordmark({ theme, style }: { theme: FilmTheme; style?: React.CSSProperties }) {
  if (!theme.brandName) return null;
  return (
    <span style={{
      display: 'inline-block',
      fontFamily: fontStack(theme.headingFont), fontWeight: 800, fontSize: 30, color: '#fff',
      letterSpacing: '-0.3px', textShadow: '0 2px 12px rgba(0,0,0,0.8)',
      borderBottom: `4px solid ${theme.accent}`, paddingBottom: 4,
      ...style,
    }}>
      {theme.brandName}
    </span>
  );
}

function BrandMark({ theme, height, frame, fps }: { theme: FilmTheme; height: number; frame: number; fps: number }) {
  // Un logo que no carga (URL vieja, servidor caído) no deja un chip vacío:
  // queda el nombre de la marca.
  const [logoOk, setLogoOk] = useState(true);
  const pop = spring({ frame, fps, config: { damping: 16, stiffness: 100 } });
  const style: React.CSSProperties = {
    transform: `scale(${interpolate(pop, [0, 1], [0.6, 1])})`,
    opacity: interpolate(pop, [0, 1], [0, 1]),
    transformOrigin: 'top left',
  };
  if (theme.logoUrl && logoOk) {
    // Los logos suelen estar pensados para fondo claro: un chip blanco evita
    // que un logo oscuro desaparezca sobre una foto oscura.
    const img: React.CSSProperties = { height, maxWidth: height * 4, objectFit: 'contain', display: 'block' };
    return (
      <div style={{ ...style, background: 'rgba(255,255,255,0.94)', borderRadius: 16, padding: '10px 16px', boxShadow: '0 6px 24px rgba(0,0,0,0.25)' }}>
        <SafeImg src={theme.logoUrl} style={img} onFail={() => setLogoOk(false)} />
      </div>
    );
  }
  return <Wordmark theme={theme} style={style} />;
}

function OutroCard({ theme, outro, durationFrames }: { theme: FilmTheme; outro: FilmOutro; durationFrames: number }) {
  const [logoOk, setLogoOk] = useState(true);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn  = interpolate(frame, [0, OUTRO_OVERLAP], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [durationFrames - 10, durationFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const card = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 140 } });
  const text = spring({ frame: frame - 12, fps, config: { damping: 18, stiffness: 120 } });

  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut, background: `linear-gradient(165deg, ${theme.primary} 0%, ${theme.secondary} 100%)` }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 38%, ${theme.accent}40 0%, transparent 60%)` }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 44, padding: '0 90px', textAlign: 'center' }}>
        <div style={{ transform: `scale(${interpolate(card, [0, 1], [0.7, 1])})`, opacity: interpolate(card, [0, 1], [0, 1]) }}>
          {theme.logoUrl && logoOk ? (
            <div style={{ background: '#ffffff', borderRadius: 36, padding: '48px 64px', boxShadow: '0 30px 80px rgba(0,0,0,0.35)' }}>
              <SafeImg src={theme.logoUrl} style={{ maxHeight: 220, maxWidth: 620, objectFit: 'contain', display: 'block' }} onFail={() => setLogoOk(false)} />
            </div>
          ) : (
            <span style={{
              fontFamily: fontStack(theme.headingFont), fontWeight: 900, fontSize: 120, lineHeight: 1.05,
              letterSpacing: '-3px', color: theme.onPrimary, borderBottom: `12px solid ${theme.accent}`, paddingBottom: 10,
            }}>
              {theme.brandName}
            </span>
          )}
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28,
          transform: `translateY(${interpolate(text, [0, 1], [30, 0])}px)`, opacity: interpolate(text, [0, 1], [0, 1]),
        }}>
          {(outro.headline || theme.tagline) && (
            <span style={{ fontFamily: fontStack(theme.bodyFont), fontWeight: 700, fontSize: 52, lineHeight: 1.25, color: theme.onPrimary }}>
              {outro.headline || theme.tagline}
            </span>
          )}
          {theme.contact && (
            <span style={{
              fontFamily: fontStack(theme.bodyFont), fontWeight: 800, fontSize: 44,
              color: theme.onAccent, background: theme.accent, borderRadius: 999, padding: '14px 36px',
            }}>
              {theme.contact}
            </span>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ─── Composición ──────────────────────────────────────────────────────────────

export function FilmComposition({ scenes, theme: themeProp, outro, musicTrack, captions = true }: FilmCompositionProps) {
  const theme = themeProp ?? DEFAULT_THEME;
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const ranges = getFilmSceneRanges(scenes, fps);
  const scenesEnd = ranges.length ? ranges[ranges.length - 1]!.end : 0;
  const outroLen = outroFrames(outro, fps);
  const hasSpeech = scenes.some((s) => s.voice || (s.visual.type === 'video' && s.visual.has_audio));
  const musicLevel = hasSpeech ? MUSIC_VOLUME_UNDER : MUSIC_VOLUME_SOLO;

  const [fontHandle] = useState(() => delayRender('Loading brand fonts'));
  useEffect(() => {
    const families = [...new Set([theme.headingFont, theme.bodyFont, 'Montserrat'])];
    Promise.all(families.map(loadGoogleFont)).finally(() => continueRender(fontHandle));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AbsoluteFill style={{ background: theme.primary }}>
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

      {(theme.logoUrl || theme.brandName) && (
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
              fadeOut={i === scenes.length - 1 && outroLen === 0}
              theme={theme}
              captions={captions}
            />
          </Sequence>
        );
      })}

      {/* Logo o nombre arriba a la izquierda mientras corren los planos */}
      <Sequence from={0} durationInFrames={Math.max(1, scenesEnd)} layout="none">
        <div style={{ position: 'absolute', top: 52, left: 52 }}>
          <BrandMark theme={theme} height={60} frame={frame} fps={fps} />
        </div>
      </Sequence>

      {outro && outroLen > 0 && (
        <Sequence from={Math.max(0, scenesEnd - OUTRO_OVERLAP)} durationInFrames={outroLen + OUTRO_OVERLAP}>
          <Audio src={staticFile(`audio/sfx/${LOGO_SFX}`)} volume={0.35} />
          <OutroCard theme={theme} outro={outro} durationFrames={outroLen + OUTRO_OVERLAP} />
        </Sequence>
      )}

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, background: 'rgba(255,255,255,0.12)' }}>
        <div style={{ height: '100%', width: `${(frame / Math.max(1, durationInFrames)) * 100}%`, background: theme.accent }} />
      </div>
    </AbsoluteFill>
  );
}
