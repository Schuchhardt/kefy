'use client';

import type React from 'react';

/** A single pulsing placeholder block. The low-level primitive every page's
 *  own skeleton (matching its real layout) is built from — see
 *  `skeletonPulse` in app/globals.css for the shared animation. */
export function SkeletonBlock({
  width = '100%', height = 12, borderRadius = 4, style,
}: {
  width?:  number | string;
  height?: number | string;
  borderRadius?: number;
  style?:  React.CSSProperties;
}) {
  return (
    <div style={{
      width, height, borderRadius, background: 'var(--border)',
      animation: 'skeletonPulse 1.5s ease-in-out infinite',
      ...style,
    }} />
  );
}

/** Mimics a `SectionCard`-shaped form section (title + a stack of
 *  label/input rows) — the shape shared by the Brand Kit pages
 *  (identity/market/strategy). */
export function FormSectionSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <div style={{ marginBottom: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
      <SkeletonBlock width={160} height={15} style={{ marginBottom: 20 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[...Array(fields)].map((_, i) => (
          <div key={i}>
            <SkeletonBlock width={90} height={11} style={{ marginBottom: 8 }} />
            <SkeletonBlock height={38} borderRadius={8} />
          </div>
        ))}
      </div>
    </div>
  );
}
