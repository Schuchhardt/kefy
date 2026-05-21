'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { useParams } from 'next/navigation';

/* ─── Types ────────────────────────────────────────────────────────────────── */
interface Totals {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
}

interface ContentItem {
  id: string;
  platform: string;
  body: string;
  status: 'published' | 'scheduled' | 'draft';
  published_at: string | null;
  created_at: string;
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const PLATFORM_ICONS: Record<string, string> = {
  linkedin: 'in', instagram: '◉', facebook: 'f',
  twitter: '𝕏', tiktok: '♪', threads: '@',
};

const T = {
  es: {
    loading: 'Cargando…', hello: 'Hola', there: 'ahí', welcome: 'Bienvenido a tu dashboard',
    metricsTitle: 'Resumen (últimos 30 días)',
    syncMetrics: 'Sincronizar métricas', syncing: 'Sincronizando…',
    impressions: 'Impresiones', reach: 'Alcance', likes: 'Likes',
    comments: 'Comentarios', shares: 'Compartidos', clicks: 'Clics',
    recentContent: 'Contenido reciente',
    noContent: 'Aún no tienes contenido publicado.',
    createFirst: 'Crear contenido',
    quickActions: 'Acciones rápidas',
    actionBrand: 'Mi marca', actionBrandDesc: 'Completa tu identidad de marca',
    actionContent: 'Crear contenido', actionContentDesc: 'Genera posts con IA',
    actionConv: 'Conversaciones', actionConvDesc: 'Revisa DMs y comentarios',
    actionAuto: 'Automatizaciones', actionAutoDesc: 'Configura reglas de engagement',
    freePlan: 'Estás en el plan gratuito', freePlanDesc: 'Actualiza para desbloquear más funciones',
    viewPlans: 'Ver planes',
    noAccounts: 'Conecta redes sociales', noAccountsDesc: 'Ve a Ajustes para conectar tus cuentas y ver métricas.',
    goSettings: 'Ir a Ajustes',
    statusPublished: 'Publicado', statusScheduled: 'Programado', statusDraft: 'Borrador',
  },
  en: {
    loading: 'Loading…', hello: 'Hello', there: 'there', welcome: 'Welcome to your dashboard',
    metricsTitle: 'Summary (last 30 days)',
    syncMetrics: 'Sync metrics', syncing: 'Syncing…',
    impressions: 'Impressions', reach: 'Reach', likes: 'Likes',
    comments: 'Comments', shares: 'Shares', clicks: 'Clicks',
    recentContent: 'Recent content',
    noContent: 'No published content yet.',
    createFirst: 'Create content',
    quickActions: 'Quick actions',
    actionBrand: 'My Brand', actionBrandDesc: 'Complete your brand identity',
    actionContent: 'Create content', actionContentDesc: 'Generate posts with AI',
    actionConv: 'Conversations', actionConvDesc: 'Check DMs and comments',
    actionAuto: 'Automations', actionAutoDesc: 'Set up engagement rules',
    freePlan: "You're on the free plan", freePlanDesc: 'Upgrade to unlock more features',
    viewPlans: 'View plans',
    noAccounts: 'Connect social networks', noAccountsDesc: 'Go to Settings to connect your accounts and view metrics.',
    goSettings: 'Go to Settings',
    statusPublished: 'Published', statusScheduled: 'Scheduled', statusDraft: 'Draft',
  },
} as const;
type Locale = keyof typeof T;

/* ─── Page ─────────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const { user, org, plan, loading: authLoading } = useAuth();
  const { lang } = useParams<{ lang: string }>();
  const t = T[(lang as Locale) ?? 'es'] ?? T.es;

  const [totals, setTotals]         = useState<Totals | null>(null);
  const [content, setContent]       = useState<ContentItem[]>([]);
  const [metricsLoading, setMLoading] = useState(true);
  const [hasAccounts, setHasAccounts] = useState<boolean | null>(null);
  const [syncing, setSyncing]       = useState(false);

  useEffect(() => {
    // Check accounts
    fetch('/api/social/accounts', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) { setHasAccounts(false); return; }
        const json = await res.json() as { accounts: { id: string }[] };
        setHasAccounts((json.accounts ?? []).length > 0);
      })
      .catch(() => setHasAccounts(false));

    // Fetch content
    fetch('/api/content?limit=5&status=published', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json() as { items?: ContentItem[]; content?: ContentItem[] };
        setContent(json.items ?? json.content ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (hasAccounts === null) return;
    if (!hasAccounts) { setMLoading(false); return; }
    const to   = new Date();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    fetch(`/api/analytics?from=${from.toISOString()}&to=${to.toISOString()}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json() as { totals: Totals };
        setTotals(json.totals ?? null);
      })
      .catch(() => {})
      .finally(() => setMLoading(false));
  }, [hasAccounts]);

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch('/api/analytics/sync', { method: 'POST', credentials: 'include' });
      const to   = new Date();
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const res  = await fetch(`/api/analytics?from=${from.toISOString()}&to=${to.toISOString()}`, { credentials: 'include' });
      if (res.ok) {
        const json = await res.json() as { totals: Totals };
        setTotals(json.totals ?? null);
      }
    } catch { /* non-critical */ }
    setSyncing(false);
  }

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <span style={{ color: 'var(--muted)', fontSize: 14 }}>{t.loading}</span>
      </div>
    );
  }

  const metricKeys: { key: keyof Totals; label: string; icon: string }[] = [
    { key: 'impressions', label: t.impressions, icon: '◎' },
    { key: 'reach',       label: t.reach,       icon: '◉' },
    { key: 'likes',       label: t.likes,       icon: '♡' },
    { key: 'comments',    label: t.comments,    icon: '◫' },
    { key: 'shares',      label: t.shares,      icon: '↗' },
    { key: 'clicks',      label: t.clicks,      icon: '⊕' },
  ];

  const quickActions = [
    { href: `/${lang}/dashboard/brand`,         icon: '◈', label: t.actionBrand,    desc: t.actionBrandDesc    },
    { href: `/${lang}/dashboard/content`,       icon: '✦', label: t.actionContent,  desc: t.actionContentDesc  },
    { href: `/${lang}/dashboard/conversations`, icon: '◉', label: t.actionConv,     desc: t.actionConvDesc     },
    { href: `/${lang}/dashboard/automations`,   icon: '⚡', label: t.actionAuto,     desc: t.actionAutoDesc     },
  ];

  const statusColor: Record<string, string> = {
    published: 'var(--accent)', scheduled: '#60a5fa', draft: 'var(--muted)',
  };
  const statusLabel: Record<string, string> = {
    published: t.statusPublished, scheduled: t.statusScheduled, draft: t.statusDraft,
  };

  return (
    <div style={{ padding: '40px 48px', maxWidth: 960, fontFamily: 'var(--font-syne), system-ui, sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6, letterSpacing: '-0.02em' }}>
          {t.hello}, {user?.name?.split(' ')[0] ?? t.there} 👋
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 15 }}>
          <strong style={{ color: 'var(--text)' }}>{org?.name}</strong>
          {org?.name ? ' · ' : ''}{t.welcome}
        </p>
      </div>

      {/* ── Metrics ── */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{t.metricsTitle}</h2>
          {hasAccounts && (
            <button onClick={handleSync} disabled={syncing} style={{
              fontSize: 12, padding: '6px 14px', borderRadius: 7,
              background: syncing ? 'var(--border)' : 'var(--surface)',
              border: '1px solid var(--border)', color: syncing ? 'var(--muted)' : 'var(--text)',
              cursor: syncing ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
            }}>
              {syncing ? t.syncing : t.syncMetrics}
            </button>
          )}
        </div>

        {hasAccounts === false ? (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '24px', textAlign: 'center',
          }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>{t.noAccounts}</p>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>{t.noAccountsDesc}</p>
            <Link href={`/${lang}/dashboard/settings`} style={{
              display: 'inline-block', background: 'var(--accent)', color: 'var(--bg)',
              fontWeight: 700, fontSize: 13, padding: '8px 18px', borderRadius: 8, textDecoration: 'none',
            }}>{t.goSettings}</Link>
          </div>
        ) : metricsLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 16px', height: 80, opacity: 0.5 }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {metricKeys.map(({ key, label, icon }) => (
              <div key={key} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '18px 16px',
              }}>
                <span style={{ fontSize: 18, display: 'block', marginBottom: 8, opacity: 0.5 }}>{icon}</span>
                <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 2 }}>
                  {totals ? fmt(totals[key]) : '—'}
                </p>
                <p style={{ color: 'var(--muted)', fontSize: 12 }}>{label}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Recent content ── */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{t.recentContent}</h2>
          <Link href={`/${lang}/dashboard/content`} style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
            {t.createFirst} →
          </Link>
        </div>
        {content.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t.noContent}</p>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {content.map((item, idx) => (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
                borderBottom: idx < content.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, color: 'var(--muted)',
                }}>
                  {PLATFORM_ICONS[item.platform] ?? item.platform?.slice(0, 2) ?? '?'}
                </span>
                <p style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)', margin: 0 }}>
                  {item.body?.slice(0, 80) ?? '—'}
                </p>
                <span style={{
                  fontSize: 10, fontWeight: 600, flexShrink: 0,
                  padding: '2px 8px', borderRadius: 5,
                  background: `${statusColor[item.status] ?? 'var(--muted)'}18`,
                  color: statusColor[item.status] ?? 'var(--muted)',
                }}>
                  {statusLabel[item.status] ?? item.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Quick actions ── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t.quickActions}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {quickActions.map((a) => (
            <Link key={a.href} href={a.href} style={{
              display: 'block', background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '18px 16px', textDecoration: 'none', transition: 'border-color 0.15s',
            }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <span style={{ fontSize: 20, display: 'block', marginBottom: 10, opacity: 0.7 }}>{a.icon}</span>
              <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{a.label}</p>
              <p style={{ color: 'var(--muted)', fontSize: 12 }}>{a.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Plan banner ── */}
      {plan === 'starter' && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(198,255,75,0.06) 0%, rgba(255,140,66,0.06) 100%)',
          border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{t.freePlan}</p>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t.freePlanDesc}</p>
          </div>
          <Link href={`/${lang}/dashboard/settings`} style={{
            background: 'var(--accent)', color: 'var(--bg)', fontWeight: 700,
            fontSize: 13, padding: '8px 18px', borderRadius: 8, textDecoration: 'none',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {t.viewPlans}
          </Link>
        </div>
      )}
    </div>
  );
}
