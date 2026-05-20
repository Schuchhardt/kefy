'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';

/* ─── SVG Icons ─────────────────────────────────────────────────────────── */
const icons = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  ),
  brand: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  ),
  strategy: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="8"/>
      <line x1="12" y1="16" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="8" y2="12"/>
      <line x1="16" y1="12" x2="22" y2="12"/>
    </svg>
  ),
  content: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18"/>
      <path d="M9 21V9"/>
    </svg>
  ),
  calendar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  analytics: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  ),
  autopilot: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  inbox: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>
  ),
  engage: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  ads: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  chevronLeft: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  chevronRight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  logout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  sun: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  ),
  moon: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
} as const;

/* ─── Nav items ──────────────────────────────────────────────────────────── */
const NAV_LABELS: Record<string, { es: string; en: string }> = {
  dashboard:  { es: 'Inicio',     en: 'Home'      },
  brand:      { es: 'Brand Kit',  en: 'Brand Kit'  },
  strategy:   { es: 'Estrategia', en: 'Strategy'   },
  content:    { es: 'Contenido',  en: 'Content'    },
  calendar:   { es: 'Calendario', en: 'Calendar'   },
  analytics:  { es: 'Analytics',  en: 'Analytics'  },
  autopilot:  { es: 'Autopilot',  en: 'Autopilot'  },
  inbox:      { es: 'Inbox',      en: 'Inbox'      },
  engage:     { es: 'Engage',     en: 'Engage'     },
  ads:        { es: 'Ads',        en: 'Ads'        },
  settings:   { es: 'Ajustes',    en: 'Settings'   },
};

type IconKey = keyof typeof icons;

interface NavItem {
  href: string;
  label: string;
  iconKey: IconKey;
  soon?: boolean;
}

function navItems(lang: string): NavItem[] {
  const l = (key: string) => NAV_LABELS[key]?.[lang as 'es' | 'en'] ?? NAV_LABELS[key]?.es ?? key;
  return [
    { href: `/${lang}/dashboard`,           label: l('dashboard'),  iconKey: 'home'      },
    { href: `/${lang}/dashboard/brand`,     label: l('brand'),      iconKey: 'brand'     },
    { href: `/${lang}/dashboard/strategy`,  label: l('strategy'),   iconKey: 'strategy'  },
    { href: `/${lang}/dashboard/content`,   label: l('content'),    iconKey: 'content'   },
    { href: `/${lang}/dashboard/calendar`,  label: l('calendar'),   iconKey: 'calendar'  },
    { href: `/${lang}/dashboard/analytics`, label: l('analytics'),  iconKey: 'analytics' },
    { href: `/${lang}/dashboard/autopilot`, label: l('autopilot'),  iconKey: 'autopilot' },
    { href: `/${lang}/dashboard/inbox`,     label: l('inbox'),      iconKey: 'inbox'     },
    { href: `/${lang}/dashboard/engage`,    label: l('engage'),     iconKey: 'engage'    },
    { href: `/${lang}/dashboard/ads`,       label: l('ads'),        iconKey: 'ads'       },
    { href: `/${lang}/dashboard/settings`,  label: l('settings'),   iconKey: 'settings'  },
  ];
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function DashboardSidebar({ lang }: { lang: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, org, plan, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  const items = navItems(lang);
  const W = collapsed ? 64 : 220;

  const planBadge: Record<string, string> = {
    starter: 'Starter',
    pro: 'Pro',
    business: 'Business',
  };

  const switchLang = (targetLang: string) => {
    const segments = pathname.split('/');
    segments[1] = targetLang;
    router.push(segments.join('/'));
  };

  return (
    <aside
      style={{
        width: W,
        minHeight: '100vh',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: 'var(--font-syne), system-ui, sans-serif',
      }}
    >
      {/* ── Header: logo + toggle ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '18px 0' : '18px 16px',
          borderBottom: '1px solid var(--border)',
          minHeight: 60,
          flexShrink: 0,
        }}
      >
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', flex: 1, minWidth: 0 }}>
            <Image src="/apple-touch-icon.png" alt="Kefy" width={26} height={26} style={{ borderRadius: 6, flexShrink: 0, display: 'block' }} />
            <div style={{ overflow: 'hidden', lineHeight: 1 }}>
              <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)', letterSpacing: '-0.02em', display: 'block', lineHeight: 1 }}>
                Kef<span style={{ color: 'var(--accent)' }}>y</span>
              </span>
              {org && (
                <span style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110, display: 'block' }}>
                  {org.name}
                </span>
              )}
            </div>
          </div>
        )}
        {collapsed && (
          <Image src="/apple-touch-icon.png" alt="Kefy" width={26} height={26} style={{ borderRadius: 6, flexShrink: 0, display: 'block' }} />
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Expandir' : 'Colapsar'}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 6,
            borderRadius: 6,
            transition: 'color 0.15s, background 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--border)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
        >
          {collapsed ? icons.chevronRight : icons.chevronLeft}
        </button>
      </div>

      {/* ── Nav ── */}
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto', overflowX: 'hidden' }}>
        {items.map((item) => {
          const isActive = item.href === `/${lang}/dashboard`
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.soon ? '#' : item.href}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: collapsed ? 0 : 10,
                padding: collapsed ? '10px 0' : '9px 16px',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--accent)' : item.soon ? 'var(--muted)' : 'var(--text)',
                background: isActive ? 'rgba(198,255,75,0.06)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: item.soon ? 'default' : 'pointer',
                transition: 'color 0.15s, background 0.15s',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  opacity: isActive ? 1 : 0.6,
                  color: isActive ? 'var(--accent)' : 'inherit',
                  transition: 'opacity 0.15s',
                }}
              >
                {icons[item.iconKey]}
              </span>
              {!collapsed && (
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                  {item.label}
                </span>
              )}
              {!collapsed && item.soon && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)', background: 'var(--border)', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>
                  soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          padding: collapsed ? '12px 0' : '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          flexShrink: 0,
        }}
      >
        {/* Theme + Lang (only expanded) */}
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {(['es', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => switchLang(l)}
                  style={{
                    padding: '2px 7px',
                    fontSize: 10,
                    fontWeight: lang === l ? 700 : 400,
                    borderRadius: 4,
                    background: lang === l ? 'var(--accent)' : 'var(--border)',
                    color: lang === l ? 'var(--bg)' : 'var(--muted)',
                    cursor: lang === l ? 'default' : 'pointer',
                    border: 'none',
                    transition: 'all 0.15s',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Cambiar a claro' : 'Cambiar a oscuro'}
              style={{
                background: 'var(--border)',
                border: 'none',
                borderRadius: 6,
                color: 'var(--muted)',
                cursor: 'pointer',
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 0.15s',
              }}
            >
              {theme === 'dark' ? icons.sun : icons.moon}
            </button>
          </div>
        )}

        {/* Plan badge (only expanded) */}
        {!collapsed && plan && (
          <Link
            href={`/${lang}/dashboard/settings/billing`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              fontWeight: 600,
              color: plan === 'starter' ? 'var(--muted)' : 'var(--accent)',
              background: plan === 'starter' ? 'var(--border)' : 'rgba(198,255,75,0.1)',
              padding: '3px 8px',
              borderRadius: 5,
              textDecoration: 'none',
              width: 'fit-content',
            }}
          >
            {planBadge[plan] ?? plan}
            {plan === 'starter' && <span style={{ fontWeight: 400, opacity: 0.7 }}>· Actualizar</span>}
          </Link>
        )}

        {/* User row */}
        {user && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'space-between',
              gap: 8,
              minWidth: 0,
            }}
          >
            {/* Avatar initials */}
            <div
              title={collapsed ? (user.name ?? user.email) : undefined}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'rgba(198,255,75,0.12)',
                color: 'var(--accent)',
                fontSize: 11,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                letterSpacing: '0.04em',
              }}
            >
              {(user.name ?? user.email ?? '?')[0].toUpperCase()}
            </div>
            {!collapsed && (
              <>
                <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                    {user.name ?? user.email}
                  </p>
                </div>
                <button
                  onClick={logout}
                  title="Cerrar sesión"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 4,
                    borderRadius: 5,
                    flexShrink: 0,
                    transition: 'color 0.15s',
                  }}
                >
                  {icons.logout}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
