'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ReelSceneProps } from '@/remotion/ReelComposition';
import { getTotalFrames, ReelComposition } from '@/remotion/ReelComposition';

// Lazy-load the Remotion Player to avoid SSR issues. The placeholder has no
// text: this loader can't know the UI language, and a spinner reads the same
// in both.
const Player = dynamic(
  () => import('@remotion/player').then((m) => m.Player),
  { ssr: false, loading: () => <div style={loaderStyle}><span className="ui-spinner" aria-hidden="true" /></div> },
);

interface ReelPlayerProps {
  scenes:        ReelSceneProps[];
  brandName?:    string;
  accentColor?:  string;
  primaryColor?: string;
  fontHeading?:  string;
  logoUrl?:      string;
  /** Rendered height in pixels (width is calculated for 9:16) */
  height?: number;
}

const loaderStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: '#111',
  borderRadius: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--muted)',
};

const FPS = 30;

export function ReelPlayer({ scenes, brandName, accentColor = '#c6ff4b', primaryColor, fontHeading, logoUrl, height = 480 }: ReelPlayerProps) {
  const totalFrames = useMemo(() => getTotalFrames(scenes, FPS), [scenes]);

  const inputProps = useMemo(
    () => ({ scenes, brandName, accentColor, primaryColor, fontHeading, logoUrl }),
    [scenes, brandName, accentColor, primaryColor, fontHeading, logoUrl],
  );

  const playerWidth  = Math.round(height * (9 / 16));

  // Fluid: never wider than its container (a fixed width overflowed phones);
  // the height follows the 9:16 ratio.
  return (
    <div style={{ width: `min(${playerWidth}px, 100%)`, aspectRatio: '9 / 16', margin: '0 auto', borderRadius: 12, overflow: 'hidden' }}>
      <Player
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={ReelComposition as any}
        compositionWidth={1080}
        compositionHeight={1920}
        durationInFrames={totalFrames}
        fps={FPS}
        style={{ width: '100%', height: '100%' }}
        inputProps={inputProps}
        controls
        loop
        autoPlay={false}
        clickToPlay
        showVolumeControls={false}
        acknowledgeRemotionLicense
      />
    </div>
  );
}
