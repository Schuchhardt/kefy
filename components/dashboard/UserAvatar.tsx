'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useId } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import Icon from '@/components/ui/icons';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

export default function UserAvatar({ lang }: { lang: string }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const t = lang === 'en' ? enCommon : esCommon;

  function switchLang(targetLang: string) {
    const segments = pathname.split('/');
    segments[1] = targetLang;
    router.push(segments.join('/'));
  }

  // Se cierra al tocar fuera y con Escape (devolviendo el foco al avatar).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const userInitial = (user?.name ?? user?.email ?? '?')[0].toUpperCase();

  return (
    <div ref={ref} className="top-fixed" style={{ right: 16 }}>
      {/* ── Avatar button ── */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.nav.account}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={`avatar-btn${open ? ' is-open' : ''}`}
      >
        <span aria-hidden="true">{userInitial}</span>
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div id={menuId} className="avatar-menu">
          {user && (
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <p className="avatar-menu-name">{user.name ?? user.email}</p>
              {user.name && <p className="avatar-menu-email">{user.email}</p>}
            </div>
          )}

          <div style={{ padding: '4px 0' }}>
            <Link href={`/${lang}/dashboard/profile`} onClick={() => setOpen(false)} className="avatar-menu-item">
              <Icon name="user" size={15} style={{ color: 'var(--muted)' }} />
              {t.nav.profile}
            </Link>
            {/* Ajustes: en escritorio vive en el sidebar. */}
            <Link
              href={`/${lang}/dashboard/settings`}
              onClick={() => setOpen(false)}
              className="avatar-menu-item user-avatar-settings-mobile"
            >
              <Icon name="settings" size={15} style={{ color: 'var(--muted)' }} />
              {t.nav.settings}
            </Link>
          </div>

          {/* Idioma y tema: en escritorio viven en el sidebar. */}
          <div className="user-avatar-settings-mobile avatar-menu-prefs">
            <div role="group" aria-label={t.nav.language} style={{ display: 'flex', gap: 4 }}>
              {(['es', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => { setOpen(false); switchLang(l); }}
                  aria-pressed={lang === l}
                  disabled={lang === l}
                  className="sidebar-lang-btn"
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? t.nav.themeToLight : t.nav.themeToDark}
              className="sidebar-icon-btn sidebar-icon-btn--boxed"
              style={{ width: 36, height: 36 }}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', padding: '4px 0' }}>
            <button
              type="button"
              onClick={async () => { setOpen(false); await logout(); }}
              className="avatar-menu-item avatar-menu-item--danger"
            >
              <Icon name="logout" size={15} />
              {t.nav.logout}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
