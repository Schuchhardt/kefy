import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Audio,
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
  scenes:    ReelSceneProps[];
  brandName?: string;
  accentColor?: string;   // default: #c6ff4b
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
  startFrame,
  durationFrames,
  accentColor,
}: {
  scene:          ReelSceneProps;
  startFrame:     number;
  durationFrames: number;
  accentColor:    string;
}) {
  const frame      = useCurrentFrame();
  const { fps }    = useVideoConfig();
  const localFrame = frame - startFrame;

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
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.75) 100%)',
      }} />

      {/* Text content — bottom area */}
      <div style={{
        position: 'absolute', bottom: 80, left: 0, right: 0,
        padding: '0 48px',
      }}>
        {/* Title */}
        <div style={{
          transform: `translateY(${titleY}px)`,
          opacity:   titleOpacity,
          marginBottom: 16,
        }}>
          <span style={{
            display:      'inline-block',
            background:   accentColor,
            color:        '#000',
            fontFamily:   'system-ui, -apple-system, sans-serif',
            fontWeight:   800,
            fontSize:     42,
            lineHeight:   1.15,
            padding:      '4px 12px',
            borderRadius: 6,
            letterSpacing: '-0.5px',
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
            fontSize:   28,
            lineHeight: 1.4,
            margin:     0,
            textShadow: '0 1px 8px rgba(0,0,0,0.7)',
          }}>
            {scene.body}
          </p>
        </div>
      </div>

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
        <div style={{ height: '100%', width: `${progress * 100}%`, background: accentColor, transition: 'width 0.05s linear' }} />
      </div>
    </AbsoluteFill>
  );
}

// ─── Root composition ─────────────────────────────────────────────────────────

export function ReelComposition({ scenes, brandName, accentColor = '#c6ff4b' }: ReelCompositionProps) {
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
              startFrame={range.start}
              durationFrames={range.durationFrames}
              accentColor={accentColor}
            />
          </Sequence>
        );
      })}

      {/* Brand watermark */}
      {brandName && (
        <div style={{
          position:   'absolute',
          top:        40,
          left:       40,
          fontFamily: 'system-ui, sans-serif',
          fontWeight: 800,
          fontSize:   22,
          color:      '#fff',
          opacity:    0.9,
          letterSpacing: '-0.3px',
        }}>
          {brandName}
        </div>
      )}
    </AbsoluteFill>
  );
}
