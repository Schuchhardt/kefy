'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { ReactNode } from 'react';

const LABELS = {
  es: { identity: 'Identidad', market: 'Mercado', strategy: 'Estrategia' },
  en: { identity: 'Identity', market: 'Market', strategy: 'Strategy' },
};

export default function BrandLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const lang = (params.lang as string) || 'es';
  const t = lang === 'en' ? LABELS.en : LABELS.es;

  const tabs = [
    { key: 'identity', label: t.identity, href: `/${lang}/dashboard/brand/identity` },
    { key: 'market',   label: t.market,   href: `/${lang}/dashboard/brand/market`   },
    { key: 'strategy', label: t.strategy, href: `/${lang}/dashboard/brand/strategy` },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Tab bar */}
      <div style={{
        borderBottom: '1px solid var(--border)',
        padding: '0 48px',
        display: 'flex',
        gap: 0,
        background: 'var(--bg)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        {tabs.map((tab) => {
          const isBase = pathname === `/${lang}/dashboard/brand`;
          const active = pathname === tab.href
            || pathname.startsWith(tab.href + '/')
            || (isBase && tab.key === 'identity');
          return (
            <Link
              key={tab.key}
              href={tab.href}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '14px 20px',
                fontSize: 14,
                fontFamily: 'var(--font-syne), sans-serif',
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--text)' : 'var(--muted)',
                textDecoration: 'none',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'color 0.15s, border-color 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Page content */}
      <div style={{ flex: 1 }}>
        {children}
      </div>
    </div>
  );
}
