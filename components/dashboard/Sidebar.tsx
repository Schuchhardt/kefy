'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTheme } from '@/lib/theme-context';
import { useBrand } from '@/lib/brand-context';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import BrandSwitcher from '@/components/dashboard/BrandSwitcher';
import Icon from '@/components/ui/icons';
import { dashboardNav, isNavItemActive, type DashboardNavItem } from '@/lib/dashboard-nav';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function DashboardSidebar({ lang }: { lang: string }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { activeBrand } = useBrand();
  const [collapsed, setCollapsed] = useState(false);
  const unreadCount = useUnreadCount(activeBrand?.id);
  const t = lang === 'en' ? enCommon : esCommon;

  function switchLang(targetLang: string) {
    const segments = pathname.split('/');
    segments[1] = targetLang;
    router.push(segments.join('/'));
  }

  const { main: items, settings: settingsItem, create } = dashboardNav(lang);
  const W = collapsed ? 64 : 220;

  // Lo que se ancla abajo a la izquierda (el asistente en leads) se corre
  // este ancho para no tapar los controles de abajo del sidebar.
  useEffect(() => {
    document.documentElement.style.setProperty('--dashboard-sidebar-w', `${W}px`);
  }, [W]);
  useEffect(() => () => { document.documentElement.style.removeProperty('--dashboard-sidebar-w'); }, []);

  function renderNavItem(item: DashboardNavItem) {
    const active = isNavItemActive(item, pathname, lang);
    const showBadge = item.key === 'inbox' && unreadCount > 0;
    const badgeLabel = showBadge ? t.nav.unread(unreadCount) : undefined;

    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-label={collapsed ? [item.label, badgeLabel].filter(Boolean).join('. ') : undefined}
        aria-current={active ? 'page' : undefined}
        className={`sidebar-link${active ? ' is-active' : ''}${collapsed ? ' is-collapsed' : ''}`}
      >
        <span className="sidebar-link-icon">
          <Icon name={item.icon} size={18} />
          {showBadge && collapsed && <span className="sidebar-dot" aria-hidden="true" />}
        </span>
        {!collapsed && (
          <>
            <span className="sidebar-link-label">{item.label}</span>
            {showBadge && (
              <span className="ui-count" aria-label={badgeLabel}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </>
        )}
      </Link>
    );
  }

  return (
    <aside className="dashboard-sidebar" style={{ width: W }}>
      {/* ── Kefy logo ── */}
      <div className={`sidebar-head${collapsed ? ' is-collapsed' : ''}`}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Image src="/apple-touch-icon.png" alt="" width={26} height={26} style={{ borderRadius: 6, flexShrink: 0, display: 'block' }} />
            <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              Kef<span style={{ color: 'var(--accent-text)' }}>y</span>
            </span>
          </div>
        )}
        {collapsed && (
          <Image src="/apple-touch-icon.png" alt="Kefy" width={26} height={26} style={{ borderRadius: 6, display: 'block' }} />
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? t.nav.expand : t.nav.collapse}
          aria-label={collapsed ? t.nav.expand : t.nav.collapse}
          aria-expanded={!collapsed}
          className="sidebar-icon-btn"
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={16} strokeWidth={2} />
        </button>
      </div>

      {/* ── Brand switcher ── */}
      <div style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <BrandSwitcher collapsed={collapsed} lang={lang === 'en' ? 'en' : 'es'} />
      </div>

      {/* ── Acción principal: crear contenido ── */}
      <div style={{ padding: collapsed ? '10px 0' : '12px 12px 4px', display: 'flex', justifyContent: 'center' }}>
        <Link
          href={create.href}
          className={`ui-btn ui-btn--primary${collapsed ? ' ui-btn--icon' : ' ui-btn--block'}`}
          title={collapsed ? create.label : undefined}
          aria-label={collapsed ? create.label : undefined}
        >
          <Icon name="plus" size={16} strokeWidth={2.2} />
          {!collapsed && create.label}
        </Link>
      </div>

      {/* ── Main nav ── */}
      <nav aria-label={t.nav.mainNav} style={{ flex: 1, padding: '8px 0', overflowY: 'auto', overflowX: 'hidden' }}>
        {items.map((item) => renderNavItem(item))}
      </nav>

      {/* ── Idioma + tema ── */}
      <div className={`sidebar-prefs${collapsed ? ' is-collapsed' : ''}`}>
        {!collapsed && (
          <div role="group" aria-label={t.nav.language} style={{ display: 'flex', gap: 4 }}>
            {(['es', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => switchLang(l)}
                aria-pressed={lang === l}
                disabled={lang === l}
                className="sidebar-lang-btn"
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? t.nav.themeToLight : t.nav.themeToDark}
          aria-label={theme === 'dark' ? t.nav.themeToLight : t.nav.themeToDark}
          className="sidebar-icon-btn sidebar-icon-btn--boxed"
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
        </button>
      </div>

      {/* ── Settings ── */}
      <div style={{ paddingTop: 4, paddingBottom: 4 }}>
        {renderNavItem(settingsItem)}
      </div>

      {/* ── Footer ── */}
      {!collapsed && (
        <div style={{ padding: '6px 16px 10px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Link href={`/${lang}/privacidad`} target="_blank" rel="noopener noreferrer" className="sidebar-footer-link">
              {t.nav.privacy}
            </Link>
            <Link href={`/${lang}/terminos`} target="_blank" rel="noopener noreferrer" className="sidebar-footer-link">
              {t.nav.terms}
            </Link>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>© {new Date().getFullYear()} Kefy</p>
        </div>
      )}
    </aside>
  );
}
