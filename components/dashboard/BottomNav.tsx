'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LABELS: Record<string, { es: string; en: string }> = {
  dashboard:     { es: 'Home',     en: 'Home'    },
  brand:         { es: 'Marca',    en: 'Brand'   },
  content:       { es: 'Contenido', en: 'Content' },
  conversations: { es: 'Chat',     en: 'Chat'    },
  automations:   { es: 'Auto',     en: 'Auto'    },
};

const icons = {
  home: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  ),
  brand: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  ),
  content: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18"/>
      <path d="M9 21V9"/>
    </svg>
  ),
  conversations: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  automations: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
} as const;

type IconKey = keyof typeof icons;

interface BottomNavItem {
  href: string;
  label: string;
  iconKey: IconKey;
}

export default function BottomNav({ lang }: { lang: string }) {
  const pathname = usePathname();
  const l = (key: string) => NAV_LABELS[key]?.[lang as 'es' | 'en'] ?? NAV_LABELS[key]?.es ?? key;

  const items: BottomNavItem[] = [
    { href: `/${lang}/dashboard`,               label: l('dashboard'),     iconKey: 'home'          },
    { href: `/${lang}/dashboard/brand`,         label: l('brand'),         iconKey: 'brand'         },
    { href: `/${lang}/dashboard/content`,       label: l('content'),       iconKey: 'content'       },
    { href: `/${lang}/dashboard/conversations`, label: l('conversations'), iconKey: 'conversations' },
    { href: `/${lang}/dashboard/automations`,   label: l('automations'),   iconKey: 'automations'   },
  ];

  function isActive(item: BottomNavItem) {
    if (item.href === `/${lang}/dashboard`) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  return (
    <nav className="bottom-nav" style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      alignItems: 'stretch',
      paddingBottom: 'env(safe-area-inset-bottom)',
      fontFamily: 'var(--font-syne), system-ui, sans-serif',
    }}>
      {items.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              padding: '10px 0',
              textDecoration: 'none',
              color: active ? 'var(--accent)' : 'var(--muted)',
              transition: 'color 0.15s',
              position: 'relative',
            }}
          >
            {active && (
              <span style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 24,
                height: 2,
                borderRadius: '0 0 2px 2px',
                background: 'var(--accent)',
              }} />
            )}
            <span style={{
              opacity: active ? 1 : 0.55,
              transition: 'opacity 0.15s',
              display: 'flex',
            }}>
              {icons[item.iconKey]}
            </span>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, letterSpacing: '0.01em' }}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
