import { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
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

// ─── Single scene component ───────────────────────────────────────────────────

function ReelScene({
  scene,
  durationFrames,
  accentColor,
  fontHeading,
  totalScenes,
}: {
  scene:          ReelSceneProps;
  durationFrames: number;
  accentColor:    string;
  primaryColor?:  string;   // reserved for future use
  fontHeading?:   string;
  totalScenes:    number;
}) {
  const localFrame     = useCurrentFrame();
  const { fps }        = useVideoConfig();

  // ── Ken Burns effect on background image ──────────────────────────────────
  const kenScale = interpolate(localFrame, [0, durationFrames], [1.0, 1.09], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const kenX = interpolate(localFrame, [0, durationFrames], [0, -18], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const kenY = interpolate(localFrame, [0, durationFrames], [0, -10], {
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

  // ── Typewriter for title ───────────────────────────────────────────────────
  const typeProgress = spring({ frame: Math.max(0, localFrame - 6), fps, config: { damping: 300, stiffness: 500 } });
  const visibleChars = Math.ceil(typeProgress * scene.title.length);
  const cursorOn     = Math.floor(localFrame / 5) % 2 === 0 && visibleChars < scene.title.length;

  // ── Underline bar grows from left ─────────────────────────────────────────
  const barProgress = spring({ frame: Math.max(0, localFrame - 12), fps, config: { damping: 16, stiffness: 120 } });

  // ── Body text reveal ──────────────────────────────────────────────────────
  const bodyProgress = spring({ frame: Math.max(0, localFrame - 22), fps, config: { damping: 12, stiffness: 60 } });
  const bodyY        = interpolate(bodyProgress, [0, 1], [36, 0]);
  const bodyOpacity  = interpolate(bodyProgress, [0, 1], [0, 1]);

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
        padding: '80px 68px 144px',
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
        <div style={{ marginBottom: 30, position: 'relative', paddingBottom: 10 }}>
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

        {/* Body text */}
        <div style={{ transform: `translateY(${bodyY}px)`, opacity: bodyOpacity }}>
          <p style={{
            color: 'rgba(255,255,255,0.90)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontWeight: 400, fontSize: 46, lineHeight: 1.45,
            margin: 0, textShadow: '0 2px 16px rgba(0,0,0,0.90)',
          }}>
            {scene.body}
          </p>
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

export function ReelComposition({ scenes, brandName, accentColor = '#c6ff4b', primaryColor, fontHeading, logoUrl }: ReelCompositionProps) {
  const frame  = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ranges  = getSceneRanges(scenes, fps);

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
      {/* ── Scenes ──────────────────────────────────────────────────────── */}
      {scenes.map((scene, i) => {
        const range = ranges[i]!;
        return (
          <Sequence key={scene.scene_order} from={range.start} durationInFrames={range.durationFrames}>
            <ReelScene
              scene={scene}
              durationFrames={range.durationFrames}
              accentColor={accentColor}
              primaryColor={primaryColor}
              fontHeading={fontHeading}
              totalScenes={scenes.length}
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
              boxShadow:    isActive ? `0 0 8px ${accentColor}` : 'none',
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



