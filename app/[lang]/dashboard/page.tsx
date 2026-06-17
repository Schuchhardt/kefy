'use client';

import { useEffect, useState, Suspense } from 'react';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import BrandKitWizard from '@/components/dashboard/BrandKitWizard';
import ChannelIcon    from '@/components/ui/ChannelIcon';
import SocialConnectionPanel from '@/components/dashboard/SocialConnectionPanel';

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

interface OnboardingStep {
  key: string;
  icon: string;
  title: string;
  desc: string;
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

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
function DashboardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, org, plan, loading: authLoading } = useAuth();
  const { lang } = useParams<{ lang: string }>();
  const t = T[(lang as Locale) ?? 'es'] ?? T.es;

  const [totals, setTotals]           = useState<Totals | null>(null);
  const [content, setContent]         = useState<ContentItem[]>([]);
  const [metricsLoading, setMLoading] = useState(true);
  const [hasAccounts, setHasAccounts] = useState<boolean | null>(null);
  const [brandKitHasData, setBrandKitHasData] = useState<boolean | null>(null);
  const [syncing, setSyncing]         = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  async function fetchAccounts() {
    const res = await fetch('/api/social/accounts', { credentials: 'include' });
    if (!res.ok) {
      setHasAccounts(false);
      return;
    }
    const json = await res.json() as { accounts: { id: string }[] };
    const items = json.accounts ?? [];
    setHasAccounts(items.length > 0);
  }

  useEffect(() => {
    // Check accounts
    fetchAccounts().catch(() => {
      setHasAccounts(false);
    });

    // Check brand kit
    fetch('/api/brand-kit', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) { setBrandKitHasData(false); return; }
        const { kit } = await res.json() as { kit: { mission?: string; industry?: string; tagline?: string; website_url?: string; primary_color?: string } };
        setBrandKitHasData(!!(kit?.mission || kit?.industry || kit?.tagline || kit?.website_url || kit?.primary_color));
      })
      .catch(() => setBrandKitHasData(false));

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
    if (searchParams.get('onboarding') === '1') {
      setOnboardingOpen(true);
    }
  }, [searchParams]);

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

  const isNewAccount = hasAccounts === false && brandKitHasData === false && content.length === 0;

  useEffect(() => {
    if (isNewAccount) setOnboardingOpen(true);
  }, [isNewAccount]);

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

  function closeOnboarding() {
    setOnboardingOpen(false);
    if (searchParams.get('onboarding') === '1') {
      router.replace(`/${lang}/dashboard`);
    }
  }

  const onboardingSteps: OnboardingStep[] = [
    {
      key: 'brand',
      icon: '◈',
      title: lang === 'en' ? 'Set up your Brand Kit' : 'Configura tu Brand Kit',
      desc: lang === 'en'
        ? 'Upload logo, colors, and define your brand voice.'
        : 'Sube tu logo, colores y define cómo se comunica tu marca.',
    },
    {
      key: 'content',
      icon: '✦',
      title: lang === 'en' ? 'Create your first content' : 'Crea tu primer contenido',
      desc: lang === 'en'
        ? 'Generate a post, image, or carousel with AI in seconds.'
        : 'Genera un post, imagen o carrusel con IA en segundos.',
    },
    {
      key: 'social',
      icon: '◫',
      title: lang === 'en' ? 'Connect your social networks' : 'Conecta tus redes',
      desc: lang === 'en'
        ? 'Link Instagram, LinkedIn, TikTok and publish directly.'
        : 'Enlaza Instagram, LinkedIn, TikTok y más para publicar directamente.',
    },
  ];

  return (
    <div style={{ padding: '40px 48px', maxWidth: 960, fontFamily: 'var(--font-syne), system-ui, sans-serif' }}>

      {onboardingOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 640,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '24px 24px 20px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
                {lang === 'en' ? 'Welcome to Kefy' : 'Bienvenido a Kefy'}
              </h2>
            </div>

            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 18 }}>
              {lang === 'en'
                ? 'Complete these steps to get your account ready.'
                : 'Sigue estos pasos para dejar tu cuenta lista.'}
            </p>

            <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
              {onboardingSteps.map((step, i) => (
                <div
                  key={step.key}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: i === 0 ? 'rgba(198,255,75,0.12)' : 'var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {step.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600 }}>{step.title}</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={closeOnboarding}
                style={{
                  border: 'none',
                  borderRadius: 10,
                  padding: '11px 16px',
                  background: 'var(--accent)',
                  color: 'var(--bg)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {lang === 'en' ? 'Start' : 'Empezar'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── New account setup ── */}
      {isNewAccount && (
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            {lang === 'en' ? 'Set up your account' : 'Configura tu cuenta'}
          </h2>
          <BrandKitWizard
            locale={lang ?? 'es'}
            orgName={org?.name}
            onComplete={() => setBrandKitHasData(true)}
          />
        </section>
      )}

      {/* ── Onboarding: Connect social / Create first content ── */}
      {content.length === 0 && (
        <section style={{ marginBottom: 40 }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '20px 24px',
          }}>
            <SocialConnectionPanel
              locale={(lang === 'en' ? 'en' : 'es')}
              mode="onboarding"
              contentHref={`/${lang}/dashboard/content`}
              onAccountsChange={(count) => setHasAccounts(count > 0)}
            />
          </div>
        </section>
      )}

      {/* ── Metrics ── */}
      {!isNewAccount && (
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 16px', height: 80, opacity: 0.5 }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
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
      )}

      {/* ── Recent content ── */}
      {!isNewAccount && (
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
                  color: 'var(--muted)',
                }}>
                  <ChannelIcon name={item.platform} size={14} />
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
      )}

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

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardPageInner />
    </Suspense>
  );
}
