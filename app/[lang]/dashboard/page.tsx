'use client';

import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function DashboardPage() {
  const { user, org, plan, loading } = useAuth();
  const { lang } = useParams<{ lang: string }>();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '60vh' }}>
        <span style={{ color: 'var(--muted)', fontSize: 14 }}>Cargando...</span>
      </div>
    );
  }

  const quickLinks = [
    { href: `/${lang}/dashboard/brand`,    label: 'Configurar Brand Kit',  desc: 'Define la identidad y voz de tu marca',     icon: '◈' },
    { href: `/${lang}/dashboard/content`,  label: 'Crear contenido',       desc: 'Genera texto e imágenes con IA',            icon: '✦' },
    { href: `/${lang}/dashboard/calendar`, label: 'Programar publicación', desc: 'Conecta redes y planifica tu calendario',   icon: '◫' },
  ];

  return (
    <div style={{ padding: '40px 48px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          Hola, {user?.name?.split(' ')[0] ?? 'allí'} 👋
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 15 }}>
          Bienvenido a <strong style={{ color: 'var(--text)' }}>{org?.name}</strong>. Empieza configurando tu brand kit.
        </p>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginBottom: 40 }}>
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              display: 'block',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
              textDecoration: 'none',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <span style={{ fontSize: 22, display: 'block', marginBottom: 10 }}>{link.icon}</span>
            <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{link.label}</p>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>{link.desc}</p>
          </Link>
        ))}
      </div>

      {/* Plan banner (Starter) */}
      {plan === 'starter' && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(198,255,75,0.06) 0%, rgba(255,140,66,0.06) 100%)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Plan gratuito activo</p>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              20 piezas/mes · 1 marca · 2 canales. Actualiza a Pro para acceso ilimitado.
            </p>
          </div>
          <Link
            href={`/${lang}/dashboard/settings/billing`}
            style={{
              background: 'var(--accent)',
              color: 'var(--bg)',
              fontWeight: 700,
              fontSize: 13,
              padding: '8px 16px',
              borderRadius: 8,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Ver planes
          </Link>
        </div>
      )}
    </div>
  );
}
