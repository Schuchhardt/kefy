'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

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


export default function UserAvatar({ lang }: { lang: string }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
