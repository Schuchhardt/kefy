'use client';

import type React from 'react';

export interface GenerationLoaderProps {
  /** 0..1. Values outside the range are clamped. */
  progress:     number;
  /** Text under the spinner. Omit to render the spinner alone. */
  label?:       string;
  /** Secondary line under the percentage (e.g. an ETA). */
  hint?:        string;
  /** Spinner diameter in px. The ring thickness scales with it. */
  size?:        number;
  accentColor?: string;
  /** `dark` sits on top of a video/black backdrop, `surface` inside a card. */
  tone?:        'dark' | 'surface';
  /** Hide the bar where there is no horizontal room (small thumbnails). */
  showBar?:     boolean;
  showPercent?: boolean;
  /** Drop the ring when the caller renders it elsewhere — e.g. the list card
   *  puts the ring in the thumbnail slot and the bar in the text column. */
  showSpinner?: boolean;
  /** Stretch the bar to the full width instead of the 80 % the video uses. */
  fullWidthBar?: boolean;
  style?:       React.CSSProperties;
}

/** Circular spinner + progress bar + percentage, shared by every long-running
 *  generation (video render, cover image). Progress is supplied by the caller:
 *  the video render reports it server-side, the image pipeline estimates it
 *  from elapsed time. */
export default function GenerationLoader({
  progress,
  label,
  hint,
  size = 40,
  accentColor = '#c6ff4b',
  tone = 'dark',
  showBar = true,
  showPercent = true,
  showSpinner = true,
  fullWidthBar = false,
  style,
}: GenerationLoaderProps) {
  const pct        = Math.min(100, Math.max(0, Math.round(progress * 100)));
  const barPct     = Math.max(pct, 2);  // always show a sliver, so it never reads as stuck at zero
  const borderW    = Math.max(2, Math.round(size / 13));
  const labelColor = tone === 'dark' ? 'rgba(255,255,255,0.6)'  : 'var(--muted)';
  const hintColor  = tone === 'dark' ? 'rgba(255,255,255,0.3)'  : 'var(--muted)';
  const trackColor = tone === 'dark' ? 'rgba(255,255,255,0.08)' : 'var(--border)';
  // Centred under the ring; flush left when the caller renders the ring apart.
  const textAlign: React.CSSProperties['textAlign'] = showSpinner ? 'center' : 'left';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: size >= 40 ? 16 : 8, width: '100%',
      ...style,
    }}>
      {showSpinner && (
        <div style={{
          width: size, height: size, borderRadius: '50%', flexShrink: 0,
          border: `${borderW}px solid ${accentColor}30`,
          borderTop: `${borderW}px solid ${accentColor}`,
          animation: 'spin 1s linear infinite',
        }} />
      )}

      {label && (
        <p style={{ color: labelColor, fontSize: size >= 40 ? 13 : 11, textAlign, margin: 0 }}>
          {label}
        </p>
      )}

      {showBar && (
        <div style={{ width: fullWidthBar ? '100%' : '80%', background: trackColor, borderRadius: 99, height: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${barPct}%`, background: accentColor,
            borderRadius: 99, transition: 'width 0.6s ease',
          }} />
        </div>
      )}

      {showPercent && (
        <p style={{ color: hintColor, fontSize: 11, margin: 0, textAlign }}>
          {pct}%{hint ? ` · ${hint}` : ''}
        </p>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
