import { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  delayRender,
  continueRender,
} from 'remotion';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReelSceneProps {
  scene_order:      number;
  title:            string;
  body:             string;
  image_url?:       string;
  duration_seconds: number;
}

export interface ReelCompositionProps {
  scenes:        ReelSceneProps[];
  brandName?:    string;
  accentColor?:  string;   // default: #c6ff4b
  primaryColor?: string;   // brand kit primary color
  fontHeading?:  string;   // brand kit heading font
  logoUrl?:      string;   // brand kit logo URL
  musicTrack?:   string;   // filename under remotion/public/audio/music/
}

// ─── Bundled audio (CC0, Kenney — see public/audio/sfx/LICENSE-kenney.txt) ────

/** One per scene cut, cycled by scene index so it doesn't repeat identically. */
const TRANSITION_SFX = ['drop_001.ogg', 'drop_002.ogg', 'drop_003.ogg', 'drop_004.ogg'];
const LOGO_SFX       = 'pluck_001.ogg';

function sfxSrc(filename: string): string {
  return staticFile(`audio/sfx/${filename}`);
}

const MUSIC_VOLUME          = 0.24;
const MUSIC_FADE_IN_FRAMES  = 24;
const MUSIC_FADE_OUT_FRAMES = 45;

/** Linear ramp that never throws on a degenerate (zero-width) range — unlike
 *  `interpolate`, which requires a strictly increasing input range and would
 *  crash on the very short/edge-case durations `calculateReelMetadata` falls
 *  back to. */
function rampTo(frame: number, start: number, end: number, from: number, to: number): number {
  if (end <= start) return frame >= end ? to : from;
  const t = Math.min(1, Math.max(0, (frame - start) / (end - start)));
  return from + (to - from) * t;
}

function musicVolumeAt(frame: number, totalFrames: number): number {
  const fadeInEnd    = Math.min(MUSIC_FADE_IN_FRAMES, totalFrames);
  const fadeOutStart = Math.max(0, totalFrames - MUSIC_FADE_OUT_FRAMES);
  const fadeIn  = rampTo(frame, 0, fadeInEnd, 0, MUSIC_VOLUME);
  const fadeOut = rampTo(frame, fadeOutStart, totalFrames, MUSIC_VOLUME, 0);
  return Math.min(fadeIn, fadeOut);
}

// ─── Animated gradient background ────────────────────────────────────────────

function AnimatedGradientBg({
  frame,
  durationFrames,
  accentColor,
}: {
  frame:          number;
  durationFrames: number;
  accentColor:    string;
}) {
  const t        = frame / Math.max(durationFrames, 1);
  const sinA     = Math.sin(t * Math.PI * 2);
  const cosA     = Math.cos(t * Math.PI * 1.5);
  const cx1      = 30 + sinA * 20;
  const cy1      = 25 + cosA * 15;
  const cx2      = 70 + cosA * 18;
  const cy2      = 70 + sinA * 12;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: [
        `radial-gradient(ellipse at ${cx1}% ${cy1}%, ${accentColor}28 0%, transparent 55%)`,
        `radial-gradient(ellipse at ${cx2}% ${cy2}%, #7c3aed28 0%, transparent 55%)`,
        'linear-gradient(160deg, #080810 0%, #0d0d1c 45%, #080814 100%)',
      ].join(', '),
    }} />
  );
}

// ─── Camera moves (Ken Burns variants) ────────────────────────────────────────
// A single fixed zoom-in read as a slideshow once scenes repeated it. Cycling
// through a small set of moves (zoom in, zoom out, diagonal push, drift) by
// scene index keeps every scene feeling shot separately.

interface CameraMove {
  scaleFrom: number; scaleTo: number;
  xFrom:     number; xTo:     number;
  yFrom:     number; yTo:     number;
}

const CAMERA_MOVES: CameraMove[] = [
  { scaleFrom: 1.00, scaleTo: 1.09, xFrom: 0,   xTo: -18, yFrom: 0,   yTo: -10 }, // push in, drift up-left
  { scaleFrom: 1.10, scaleTo: 1.00, xFrom: -16, xTo: 0,   yFrom: 8,   yTo: 0   }, // pull out, settle
  { scaleFrom: 1.00, scaleTo: 1.08, xFrom: 0,   xTo: 16,  yFrom: 0,  yTo: 9   }, // push in, drift down-right
  { scaleFrom: 1.06, scaleTo: 1.13, xFrom: 10,  xTo: -10, yFrom: -7, yTo: 7   }, // slow diagonal push
];

function getCameraMove(sceneIndex: number): CameraMove {
  return CAMERA_MOVES[sceneIndex % CAMERA_MOVES.length]!;
}

// ─── Scene frame ranges ───────────────────────────────────────────────────────

function getSceneRanges(scenes: ReelSceneProps[], fps: number) {
  let start = 0;
  return scenes.map((scene) => {
    const durationFrames = Math.round(scene.duration_seconds * fps);
    const range = { start, end: start + durationFrames, durationFrames };
    start += durationFrames;
    return range;
  });
}

export function getTotalFrames(scenes: ReelSceneProps[], fps = 30): number {
  return scenes.reduce((acc, s) => acc + Math.round(s.duration_seconds * fps), 0);
}

/** Fallback when a scene carries no (or an unusable) duration. */
const DEFAULT_SCENE_SECONDS = 3;
/** Remotion rejects a composition with 0 frames. */
const MIN_TOTAL_FRAMES      = 1;

/**
 * Duration of the reel that is actually being rendered.
 *
 * Remotion resolves a composition's `durationInFrames` from the *registered*
 * value unless the composition computes it from its input props. Without this,
 * every render used the sample scenes' length (17 s): longer scripts were cut
 * mid-scene and shorter ones ended with seconds of dead background.
 */
export function calculateReelMetadata(
  { props }: { props: Partial<ReelCompositionProps> },
  fps = 30,
): { durationInFrames: number } {
  const scenes = Array.isArray(props?.scenes) ? props.scenes : [];
  const normalized = scenes.map((scene) => ({
    ...scene,
    duration_seconds:
      typeof scene?.duration_seconds === 'number' && scene.duration_seconds > 0
        ? scene.duration_seconds
        : DEFAULT_SCENE_SECONDS,
  }));
  return { durationInFrames: Math.max(MIN_TOTAL_FRAMES, getTotalFrames(normalized, fps)) };
}

// ─── Single scene component ───────────────────────────────────────────────────

function ReelScene({
  scene,
  durationFrames,
  accentColor,
  fontHeading,
  totalScenes,
  cameraMove,
  isHook,
}: {
  scene:          ReelSceneProps;
  durationFrames: number;
  accentColor:    string;
  primaryColor?:  string;   // reserved for future use
  fontHeading?:   string;
  totalScenes:    number;
  cameraMove:     CameraMove;
  isHook:         boolean;
}) {
  const localFrame     = useCurrentFrame();
  const { fps }        = useVideoConfig();

  // ── Ken Burns effect on background image (varies per scene — see CAMERA_MOVES) ──
  const kenScale = interpolate(localFrame, [0, durationFrames], [cameraMove.scaleFrom, cameraMove.scaleTo], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const kenX = interpolate(localFrame, [0, durationFrames], [cameraMove.xFrom, cameraMove.xTo], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const kenY = interpolate(localFrame, [0, durationFrames], [cameraMove.yFrom, cameraMove.yTo], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Scene fade in / fade out ───────────────────────────────────────────────
  // Short transitions (8 frames each ≈ 0.27s) to minimise the dark gap between scenes
  const fadeIn  = interpolate(localFrame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(localFrame, [durationFrames - 8, durationFrames], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const opacity = fadeIn * fadeOut;

  // ── Title reveal ───────────────────────────────────────────────────────────
  // The hook (scene 1) has ~2s to earn the rest of the video, so it slams the
  // full line in at once instead of typing it out letter by letter.
  const typeProgress = spring({ frame: Math.max(0, localFrame - 6), fps, config: { damping: 300, stiffness: 500 } });
  const visibleChars = isHook ? scene.title.length : Math.ceil(typeProgress * scene.title.length);
  const cursorOn      = !isHook && Math.floor(localFrame / 5) % 2 === 0 && visibleChars < scene.title.length;

  const hookPunch = spring({ frame: localFrame, fps, config: { damping: 12, stiffness: 260, mass: 0.6 } });
  const hookScale = isHook ? interpolate(hookPunch, [0, 1], [1.16, 1]) : 1;

  // ── Underline bar grows from left ─────────────────────────────────────────
  const barProgress = spring({ frame: Math.max(0, localFrame - 12), fps, config: { damping: 16, stiffness: 120 } });

  // ── Body text: word-by-word kinetic reveal ────────────────────────────────
  // Stagger spread is capped tight (9 frames total, ≤3/word) because each
  // word's own spring keeps settling for a while after its trigger frame —
  // an uncapped per-word stagger on an 11+ word sentence (normal for real
  // Spanish copy) was taking ~2s to fully settle instead of the intended
  // ~1s, per QA. Short lines are unaffected (they were already near the cap).
  const bodyStartFrame = 22;
  const words           = scene.body.split(' ').filter(Boolean);
  const staggerPerWord  = Math.max(1, Math.min(3, Math.round(9 / Math.max(words.length - 1, 1))));

  // ── Scene chip fade in ────────────────────────────────────────────────────
  const chipOpacity = interpolate(localFrame, [0, 14], [0, 1], { extrapolateRight: 'clamp' });

  const progress       = localFrame / durationFrames;
  const headingFont    = fontHeading
    ? `'${fontHeading}', system-ui, -apple-system, sans-serif`
    : 'system-ui, -apple-system, sans-serif';

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* ── Background layer ────────────────────────────────────────────── */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {scene.image_url ? (
          <div style={{
            width: '100%', height: '100%',
            transform:       `scale(${kenScale}) translate(${kenX}px, ${kenY}px)`,
            transformOrigin: 'center center',
          }}>
            <Img
              src={scene.image_url}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        ) : (
          <AnimatedGradientBg
            frame={localFrame}
            durationFrames={durationFrames}
            accentColor={accentColor}
          />
        )}
      </div>

      {/* ── Cinematic overlay layers ────────────────────────────────────── */}
      {/* Bottom-heavy gradient for text legibility */}
      <div style={{
        position: 'absolute', inset: 0,
        background: scene.image_url
          ? 'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.20) 35%, rgba(0,0,0,0.72) 65%, rgba(0,0,0,0.90) 100%)'
          : 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.50) 100%)',
      }} />

      {/* Accent color top vignette — subtle brand presence */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse at 50% -10%, ${accentColor}20 0%, transparent 55%)`,
      }} />

      {/* ── Text content ────────────────────────────────────────────────── */}
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-end', alignItems: 'flex-start',
        // Bottom padding is generous on purpose: Instagram/TikTok reserve the
        // bottom ~20% of the frame for their own UI (username, caption,
        // action icons) — that's 384px at 1920px tall. 144px, then 260px,
        // both measured short of that (a 2-line body sentence, the normal
        // case for real copy, still bottomed out inside the reserved band).
        // Facebook doesn't have that overlay, but the extra margin there is a
        // fine tradeoff since the video is shared across networks.
        padding: '80px 68px 400px',
      }}>
        {/* Scene chip */}
        <div style={{ marginBottom: 22, opacity: chipOpacity }}>
          <span style={{
            fontSize: 13, fontWeight: 700, letterSpacing: '0.11em',
            textTransform: 'uppercase', fontFamily: 'system-ui, sans-serif',
            color: accentColor,
            background: `${accentColor}18`,
            padding: '5px 14px', borderRadius: 20,
            border: `1px solid ${accentColor}45`,
          }}>
            {scene.scene_order} / {totalScenes}
          </span>
        </div>

        {/* Title + animated underline */}
        <div style={{
          marginBottom: 30, position: 'relative', paddingBottom: 10,
          transform:       isHook ? `scale(${hookScale})` : undefined,
          transformOrigin: 'left bottom',
        }}>
          {/* Animated underline bar */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0,
            height: 4, borderRadius: 2,
            width: `${barProgress * 100}%`,
            background: accentColor,
            boxShadow: `0 0 14px ${accentColor}80`,
          }} />
          <span style={{
            display: 'block',
            fontFamily: headingFont,
            fontWeight: 900, fontSize: 74,
            lineHeight: 1.10, letterSpacing: '-1.5px',
            color: '#fff',
            textShadow: '0 3px 24px rgba(0,0,0,0.85)',
          }}>
            {scene.title.slice(0, visibleChars)}
            {cursorOn && (
              <span style={{ color: accentColor, fontWeight: 300 }}>|</span>
            )}
          </span>
        </div>

        {/* Body text — each word settles in on its own stagger */}
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {words.map((word, i) => {
            const wordStart    = bodyStartFrame + i * staggerPerWord;
            const wordProgress = spring({
              frame: Math.max(0, localFrame - wordStart), fps,
              config: { damping: 14, stiffness: 120 },
            });
            const wordY       = interpolate(wordProgress, [0, 1], [16, 0]);
            const wordOpacity = interpolate(wordProgress, [0, 1], [0, 1]);
            return (
              <span key={i} style={{
                display: 'inline-block',
                transform: `translateY(${wordY}px)`,
                opacity: wordOpacity,
                marginRight: '0.32em',
                color: 'rgba(255,255,255,0.90)',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontWeight: 400, fontSize: 46, lineHeight: 1.45,
                textShadow: '0 2px 16px rgba(0,0,0,0.90)',
              }}>
                {word}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* ── Progress bar with glow ──────────────────────────────────────── */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,0.10)' }}>
        <div style={{
          height: '100%', width: `${progress * 100}%`,
          background: accentColor,
          boxShadow: `0 0 10px ${accentColor}, 0 0 20px ${accentColor}60`,
        }} />
      </div>
    </AbsoluteFill>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** SVG files can't be decoded via img.decode() used internally by Remotion's <Img>.
 *  Detect them by URL extension so we can fall back to a plain <img> tag. */
function isSvgUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('.svg');
  } catch {
    return url.toLowerCase().includes('.svg');
  }
}

// ─── Root composition ─────────────────────────────────────────────────────────

export function ReelComposition({ scenes, brandName, accentColor = '#c6ff4b', primaryColor, fontHeading, logoUrl, musicTrack }: ReelCompositionProps) {
  const frame  = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const ranges  = getSceneRanges(scenes, fps);

  // Camera-move variety (see CAMERA_MOVES) is only ever visible on scenes
  // that actually have a background photo — gradient-fallback scenes render
  // AnimatedGradientBg instead and never apply it. Indexing by the scene's
  // position in the full `scenes` array wasted move slots on gradient
  // scenes, so the hook and the last scene (the two highest-visibility
  // ones) often landed on the identical move whenever a reel had an even
  // number of scenes before them. Index by position among image scenes only.
  let imageSceneCounter = -1;
  const cameraMoveIndexByScene = scenes.map((scene) => {
    if (scene.image_url) imageSceneCounter++;
    return imageSceneCounter;
  });

  // Load Google Font before rendering so Remotion (browser + Lambda) can use it
  const [fontHandle] = useState(() => delayRender('Loading brand font'));
  useEffect(() => {
    if (!fontHeading) { continueRender(fontHandle); return; }
    const family = fontHeading.replace(/ /g, '+');
    const link   = document.createElement('link');
    link.rel     = 'stylesheet';
    link.href    = `https://fonts.googleapis.com/css2?family=${family}:wght@400;700;900&display=swap`;
    link.onload  = () => continueRender(fontHandle);
    link.onerror = () => continueRender(fontHandle);
    document.head.appendChild(link);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animated logo entrance (first 18 frames)
  const logoSpring  = spring({ frame, fps, config: { damping: 16, stiffness: 100 } });
  const logoScale   = interpolate(logoSpring, [0, 1], [0.55, 1.0]);
  const logoOpacity = interpolate(logoSpring, [0, 1], [0.0, 1.0]);

  return (
    <AbsoluteFill style={{ background: '#080810' }}>
      {/* ── Music bed (optional — set by the render route from a fixed track list) ── */}
      {musicTrack && (
        <Audio
          src={staticFile(`audio/music/${musicTrack}`)}
          volume={(f) => musicVolumeAt(f, durationInFrames)}
          loop
        />
      )}

      {/* ── Logo entrance accent ─────────────────────────────────────────── */}
      {(logoUrl || brandName) && (
        <Sequence from={4} durationInFrames={30} layout="none">
          <Audio src={sfxSrc(LOGO_SFX)} volume={0.5} />
        </Sequence>
      )}

      {/* ── Scenes ──────────────────────────────────────────────────────── */}
      {scenes.map((scene, i) => {
        const range = ranges[i]!;
        const isHook = scene.scene_order === 1;
        return (
          <Sequence key={scene.scene_order} from={range.start} durationInFrames={range.durationFrames}>
            {/* Cut accent — skipped on the hook so it doesn't collide with the logo sting */}
            {!isHook && (
              <Audio src={sfxSrc(TRANSITION_SFX[i % TRANSITION_SFX.length]!)} volume={0.42} />
            )}
            <ReelScene
              scene={scene}
              durationFrames={range.durationFrames}
              accentColor={accentColor}
              primaryColor={primaryColor}
              fontHeading={fontHeading}
              totalScenes={scenes.length}
              cameraMove={getCameraMove(Math.max(0, cameraMoveIndexByScene[i]!))}
              isHook={isHook}
            />
          </Sequence>
        );
      })}

      {/* ── Scene indicator dots (always visible) ───────────────────────── */}
      <div style={{
        position: 'absolute', top: 52, right: 52,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        {scenes.map((_, i) => {
          const range    = ranges[i]!;
          const isActive = frame >= range.start && frame < range.end;
          const isPast   = frame >= range.end;
          return (
            <div key={i} style={{
              width:        isActive ? 22 : 7,
              height:       7,
              borderRadius: 3.5,
              background:   isActive ? accentColor : isPast ? `${accentColor}55` : 'rgba(255,255,255,0.25)',
              // Past/upcoming dots are semi-transparent by design, which reads
              // fine on a dark gradient scene but disappears against a bright
              // photo background (QA: a light forest/sky scene made every
              // non-active dot unreadable). A constant dark outline keeps a
              // minimum edge regardless of what's behind it.
              boxShadow:    isActive ? `0 0 8px ${accentColor}` : '0 0 2px rgba(0,0,0,0.8)',
            }} />
          );
        })}
      </div>

      {/* ── Brand logo / watermark — animated entrance ──────────────────── */}
      {logoUrl ? (
        // SVG logos can't be decoded by Remotion's <Img> (uses img.decode() internally).
        // Use a plain <img> for SVGs; Chromium handles them fine in both preview and render.
        isSvgUrl(logoUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            style={{
              position: 'absolute', top: 52, left: 52,
              height: 72, maxWidth: 240, objectFit: 'contain',
              filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.75))',
              transform: `scale(${logoScale})`,
              opacity: logoOpacity,
              transformOrigin: 'top left',
            }}
          />
        ) : (
          <Img
            src={logoUrl}
            style={{
              position: 'absolute', top: 52, left: 52,
              height: 72, maxWidth: 240, objectFit: 'contain',
              filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.75))',
              transform: `scale(${logoScale})`,
              opacity: logoOpacity,
              transformOrigin: 'top left',
            }}
          />
        )
      ) : brandName ? (
        <div style={{
          position: 'absolute', top: 52, left: 52,
          transform: `scale(${logoScale})`,
          opacity: logoOpacity,
          transformOrigin: 'top left',
        }}>
          <span style={{
            fontFamily:    fontHeading
              ? `'${fontHeading}', system-ui, sans-serif`
              : 'system-ui, sans-serif',
            fontWeight: 800, fontSize: 26, color: '#fff',
            letterSpacing: '-0.3px',
            textShadow: '0 2px 10px rgba(0,0,0,0.75)',
          }}>
            {brandName}
          </span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
