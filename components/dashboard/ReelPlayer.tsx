'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ReelSceneProps } from '@/remotion/ReelComposition';
import { getTotalFrames, ReelComposition } from '@/remotion/ReelComposition';

// Lazy-load the Remotion Player to avoid SSR issues
const Player = dynamic(
  () => import('@remotion/player').then((m) => m.Player),
  { ssr: false, loading: () => <div style={loaderStyle}>Cargando preview...</div> },
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
  background: '#111',
  borderRadius: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--muted, #888)',
  fontSize: 13,
};

const FPS = 30;

export function ReelPlayer({ scenes, brandName, accentColor = '#c6ff4b', primaryColor, fontHeading, logoUrl, height = 480 }: ReelPlayerProps) {
  const totalFrames = useMemo(() => getTotalFrames(scenes, FPS), [scenes]);

  const inputProps = useMemo(
    () => ({ scenes, brandName, accentColor, primaryColor, fontHeading, logoUrl }),
    [scenes, brandName, accentColor, primaryColor, fontHeading, logoUrl],
  );

  const playerWidth  = Math.round(height * (9 / 16));

  return (
    <div style={{ width: playerWidth, height, margin: '0 auto', borderRadius: 12, overflow: 'hidden' }}>
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
