'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBrand } from '@/lib/brand-context';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import Icon from '@/components/ui/icons';
import { dashboardNav, isNavItemActive } from '@/lib/dashboard-nav';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

// Navegación inferior en móvil. Mismos destinos y nombres que el Sidebar
// (lib/dashboard-nav.ts) y el aviso de mensajes sin responder, que antes solo
// existía en el Sidebar —oculto en móvil—.

export default function BottomNav({ lang }: { lang: string }) {
  const pathname = usePathname() ?? '';
  const { activeBrand } = useBrand();
  const unread = useUnreadCount(activeBrand?.id);
  const t = lang === 'en' ? enCommon : esCommon;
  const { main: items } = dashboardNav(lang);

  return (
    <nav className="bottom-nav" aria-label={t.nav.mainNav}>
      {items.map((item) => {
        const active = isNavItemActive(item, pathname, lang);
        const showBadge = item.key === 'inbox' && unread > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`bottom-nav-item${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="bottom-nav-icon">
              <Icon name={item.icon} size={21} />
              {showBadge && (
                <span className="ui-count bottom-nav-badge">
                  <span aria-hidden="true">{unread > 99 ? '99+' : unread}</span>
                  <span className="sr-only">{t.nav.unread(unread)}</span>
                </span>
              )}
            </span>
            <span className="bottom-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
