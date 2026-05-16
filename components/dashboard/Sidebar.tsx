'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  soon?: boolean;
}

function navItems(lang: string): NavItem[] {
  return [
    { href: `/${lang}/dashboard`,           label: 'Inicio',       icon: '⌂' },
    { href: `/${lang}/dashboard/brand`,     label: 'Brand Kit',    icon: '◈' },
    { href: `/${lang}/dashboard/content`,   label: 'Contenido',    icon: '✦' },
    { href: `/${lang}/dashboard/calendar`,  label: 'Calendario',   icon: '◫' },
    { href: `/${lang}/dashboard/analytics`, label: 'Analytics',    icon: '◉' },
    { href: `/${lang}/dashboard/autopilot`, label: 'Autopilot',    icon: '◎' },
    { href: `/${lang}/dashboard/inbox`,     label: 'Inbox',        icon: '✉' },
    { href: `/${lang}/dashboard/engage`,    label: 'Engage',       icon: '◫' },
    { href: `/${lang}/dashboard/ads`,       label: 'Ads',          icon: '⚡' },
    { href: `/${lang}/dashboard/settings`,  label: 'Ajustes',      icon: '⚙' },
  ];
}

export default function DashboardSidebar({ lang }: { lang: string }) {
  const pathname = usePathname();
  const { user, org, plan, logout } = useAuth();

  const items = navItems(lang);

  const planBadge: Record<string, string> = {
    starter: 'Starter',
    pro: 'Pro',
    business: 'Business',
  };

  return (
    <aside
      style={{
        width: 220,
        minHeight: '100vh',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 0',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '0 20px 24px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 22, color: 'var(--accent)' }}>
          kefy
        </span>
        {org && (
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {org.name}
          </p>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 0' }}>
        {items.map((item) => {
          const isActive = item.href === `/${lang}/dashboard`
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.soon ? '#' : item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 20px',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--accent)' : item.soon ? 'var(--muted)' : 'var(--text)',
                background: isActive ? 'rgba(198,255,75,0.06)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: item.soon ? 'default' : 'pointer',
                transition: 'all 0.15s',
                textDecoration: 'none',
              }}
            >
              <span style={{ fontSize: 15, opacity: isActive ? 1 : 0.7 }}>{item.icon}</span>
              {item.label}
              {item.soon && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)', background: 'var(--border)', padding: '1px 6px', borderRadius: 4 }}>
                  soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer: plan + user */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
        {plan && (
          <div style={{ marginBottom: 12 }}>
            <Link
              href={`/${lang}/dashboard/settings/billing`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                fontWeight: 600,
                color: plan === 'starter' ? 'var(--muted)' : 'var(--accent)',
                background: plan === 'starter' ? 'var(--border)' : 'rgba(198,255,75,0.12)',
                padding: '3px 8px',
                borderRadius: 6,
                textDecoration: 'none',
              }}
            >
              {planBadge[plan] ?? plan}
              {plan === 'starter' && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· Actualizar</span>}
            </Link>
          </div>
        )}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ overflow: 'hidden' }}>
              <p style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.name ?? user.email}
              </p>
              <p style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
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
                fontSize: 16,
                padding: 4,
                flexShrink: 0,
              }}
            >
              ↪
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
