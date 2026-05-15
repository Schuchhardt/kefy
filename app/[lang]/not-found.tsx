export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-syne), serif',
          fontWeight: 800,
          fontSize: '88px',
          letterSpacing: '-0.04em',
          color: 'rgba(255,255,255,0.04)',
          lineHeight: 1,
        }}
      >
        404
      </span>
      <p style={{ fontFamily: 'var(--font-syne), serif', fontWeight: 600, fontSize: '20px' }}>
        Page not found
      </p>
      <a
        href="/"
        style={{
          marginTop: '12px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '11px 18px',
          borderRadius: '8px',
          background: 'var(--accent)',
          color: '#0A0A0A',
          fontWeight: 600,
          fontSize: '14px',
          textDecoration: 'none',
        }}
      >
        Go home
      </a>
    </div>
  );
}
