import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
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
  primaryColor,
  fontHeading,
}: {
  scene:          ReelSceneProps;
  durationFrames: number;
  accentColor:    string;
  primaryColor?:  string;
  fontHeading?:   string;
}) {
  const localFrame     = useCurrentFrame();
  const { fps }        = useVideoConfig();
  const highlightColor = primaryColor ?? accentColor;

  // Fade-in for background (first 15 frames)
  const bgOpacity = interpolate(localFrame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  // Text slide-up + fade-in
  const textProgress = spring({ frame: localFrame, fps, config: { damping: 12, stiffness: 80 }, delay: 10 });
  const titleY       = interpolate(textProgress, [0, 1], [40, 0]);
  const titleOpacity = interpolate(textProgress, [0, 1], [0, 1]);

  const bodyProgress = spring({ frame: localFrame, fps, config: { damping: 12, stiffness: 60 }, delay: 20 });
  const bodyY        = interpolate(bodyProgress, [0, 1], [30, 0]);
  const bodyOpacity  = interpolate(bodyProgress, [0, 1], [0, 1]);

  // Fade-out at the end (last 12 frames)
  const fadeOut = interpolate(localFrame, [durationFrames - 12, durationFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Progress bar at bottom
  const progress = localFrame / durationFrames;

  return (
    <AbsoluteFill style={{ opacity: bgOpacity * fadeOut }}>
      {/* Background image */}
      {scene.image_url ? (
        <Img
          src={scene.image_url}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)' }} />
      )}

      {/* Dark gradient overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.72) 100%)',
      }} />

      {/* Text content — centered */}
      <AbsoluteFill style={{
        display:        'flex',
        flexDirection:  'column',
        justifyContent: 'center',
        alignItems:     'flex-start',
        padding:        '160px 64px',
      }}>
        {/* Title */}
        <div style={{
          transform:    `translateY(${titleY}px)`,
          opacity:      titleOpacity,
          marginBottom: 32,
        }}>
          <span style={{
            display:       'inline',
            background:    highlightColor,
            color:         '#000',
            fontFamily:    fontHeading ? `'${fontHeading}', system-ui, -apple-system, sans-serif` : 'system-ui, -apple-system, sans-serif',
            fontWeight:    800,
            fontSize:      80,
            lineHeight:    1.15,
            padding:       '6px 20px',
            borderRadius:  10,
            letterSpacing: '-1px',
            boxDecorationBreak: 'clone' as const,
          }}>
            {scene.title}
          </span>
        </div>

        {/* Body */}
        <div style={{
          transform: `translateY(${bodyY}px)`,
          opacity:   bodyOpacity,
        }}>
          <p style={{
            color:      '#fff',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontWeight: 500,
            fontSize:   48,
            lineHeight: 1.4,
            margin:     0,
            textShadow: '0 2px 12px rgba(0,0,0,0.85)',
          }}>
            {scene.body}
          </p>
        </div>
      </AbsoluteFill>

      {/* Scene counter */}
      <div style={{
        position:   'absolute',
        top:        40,
        right:      40,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 700,
        fontSize:   20,
        color:      'rgba(255,255,255,0.6)',
      }}>
        {scene.scene_order}
      </div>

      {/* Progress bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, background: 'rgba(255,255,255,0.15)' }}>
        <div style={{ height: '100%', width: `${progress * 100}%`, background: highlightColor, transition: 'width 0.05s linear' }} />
      </div>
    </AbsoluteFill>
  );
}

// ─── Root composition ─────────────────────────────────────────────────────────

export function ReelComposition({ scenes, brandName, accentColor = '#c6ff4b', primaryColor, fontHeading, logoUrl }: ReelCompositionProps) {
  const { fps }  = useVideoConfig();
  const ranges   = getSceneRanges(scenes, fps);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
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
            />
          </Sequence>
        );
      })}

      {/* Brand watermark — logo or text */}
      {logoUrl ? (
        <Img
          src={logoUrl}
          style={{
            position:  'absolute',
            top:       48,
            left:      48,
            height:    80,
            maxWidth:  280,
            objectFit: 'contain',
            filter:    'drop-shadow(0 2px 8px rgba(0,0,0,0.6))',
          }}
        />
      ) : brandName ? (
        <div style={{
          position:      'absolute',
          top:           48,
          left:          48,
          fontFamily:    'system-ui, sans-serif',
          fontWeight:    800,
          fontSize:      26,
          color:         '#fff',
          opacity:       0.95,
          letterSpacing: '-0.3px',
          textShadow:    '0 2px 8px rgba(0,0,0,0.6)',
        }}>
          {brandName}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
