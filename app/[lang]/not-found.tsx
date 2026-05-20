'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import esCommon from '@/locales/es/common';
import enCommon from '@/locales/en/common';

const labels: Record<string, typeof esCommon.notFound> = {
  es: esCommon.notFound,
  en: enCommon.notFound,
};

export default function NotFound() {
  const params = useParams();
  const lang = (params?.lang as string) ?? 'es';
  const l = labels[lang] ?? labels['es'];

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
        {l.msg}
      </p>
      <Link
        href={`/${lang}`}
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
        {l.cta}
      </Link>
    </div>
  );
}

