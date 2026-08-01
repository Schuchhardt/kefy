'use client';

export function ImageGeneratingSpinner({
  label,
  height = 200,
  accentColor = '#c6ff4b',
}: {
  label?:       string;
  height?:      number | string;
  accentColor?: string;
}) {
  return (
    <div style={{
      width: '100%', height, background: '#0a0a0f',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: `3px solid ${accentColor}30`,
        borderTop: `3px solid ${accentColor}`,
        animation: 'kefy-spin 1s linear infinite',
      }} />
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center', margin: 0, padding: '0 12px' }}>
        {label ?? 'Generando imagen…'}
      </p>
      <style>{`@keyframes kefy-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
