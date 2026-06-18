'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';

const iconProfile = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const iconLogout = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

const iconSettings = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

const iconSun = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
);

const iconMoon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);


export default function UserAvatar({ lang }: { lang: string }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function switchLang(targetLang: string) {
    const segments = pathname.split('/');
    segments[1] = targetLang;
    router.push(segments.join('/'));
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const userInitial = (user?.name ?? user?.email ?? '?')[0].toUpperCase();

  return (
    <div ref={ref} style={{ position: 'fixed', top: 13, right: 16, zIndex: 300 }}>
      {/* ── Avatar button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Mi cuenta"
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: 'var(--surface)',
          border: `1.5px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
          padding: 0,
          transition: 'border-color 0.15s',
          fontFamily: 'var(--font-syne), sans-serif',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
          {userInitial}
        </span>
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          width: 228,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          fontFamily: 'var(--font-syne), sans-serif',
          zIndex: 300,
        }}>

          {/* User info */}
          {user && (
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <p style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text)',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {user.name ?? user.email}
              </p>
              {user.name && (
                <p style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  margin: '2px 0 0',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {user.email}
                </p>
              )}
            </div>
          )}

          {/* Profile link */}
          <div style={{ padding: '4px 0' }}>
            <Link
              href={`/${lang}/dashboard/profile`}
              onClick={() => setOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 14px',
                fontSize: 13,
                color: 'var(--text)',
                textDecoration: 'none',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}
            >
              <span style={{ color: 'var(--muted)', display: 'flex' }}>{iconProfile}</span>
              Ver perfil
            </Link>

            {/* Settings — only on mobile (sidebar is hidden) */}
            <Link
              href={`/${lang}/dashboard/settings`}
              onClick={() => setOpen(false)}
              className="user-avatar-settings-mobile"
              style={{
                alignItems: 'center',
                gap: 9,
                padding: '8px 14px',
                fontSize: 13,
                color: 'var(--text)',
                textDecoration: 'none',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}
            >
              <span style={{ color: 'var(--muted)', display: 'flex' }}>{iconSettings}</span>
              {lang === 'en' ? 'Settings' : 'Ajustes'}
            </Link>
          </div>

          {/* Lang + Theme — only on mobile (sidebar is hidden) */}
          <div
            className="user-avatar-settings-mobile"
            style={{
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 14px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', gap: 4 }}>
              {(['es', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => { setOpen(false); switchLang(l); }}
                  style={{
                    padding: '3px 10px',
                    fontSize: 10,
                    fontWeight: lang === l ? 700 : 400,
                    borderRadius: 5,
                    border: 'none',
                    background: lang === l ? 'var(--accent)' : 'var(--border)',
                    color: lang === l ? '#fff' : 'var(--muted)',
                    cursor: lang === l ? 'default' : 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontFamily: 'var(--font-syne), sans-serif',
                    transition: 'all 0.15s',
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? (lang === 'en' ? 'Switch to light' : 'Cambiar a claro') : (lang === 'en' ? 'Switch to dark' : 'Cambiar a oscuro')}
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
                transition: 'background 0.15s, color 0.15s',
                flexShrink: 0,
              }}
            >
              {theme === 'dark' ? iconSun : iconMoon}
            </button>
          </div>

          {/* Logout */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '4px 0' }}>
            <button
              onClick={async () => { setOpen(false); await logout(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 14px',
                width: '100%',
                fontSize: 13,
                color: '#f87171',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'var(--font-syne), sans-serif',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.08)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <span style={{ display: 'flex' }}>{iconLogout}</span>
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
