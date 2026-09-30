'use client';

// ─── Home del dashboard ──────────────────────────────────────────────────────
//
// Antes (docs/auditoria-ux.md §5.6): un modal «Bienvenido» que se reabría en
// cada visita, el wizard de 20 pasos incrustado (que desaparecía para siempre
// en cuanto la cuenta dejaba de ser «nueva»), el panel de redes, la tarjeta
// «Conecta redes» y la acción rápida «Completa tu identidad» a la vez —tres
// CTA para lo mismo— y el aviso de plan (incluido el pago fallido) al final de
// la página, tres pantallas abajo en móvil.
//
// Ahora, de arriba abajo: cabecera con qué hace Kefy y el botón de crear,
// aviso de plan, «Primeros pasos» con estado real (se puede ocultar y se
// recuerda por usuario), métricas, contenido reciente, lo que mejor funciona
// y accesos rápidos.

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useBrand } from '@/lib/brand-context';
import { useDataChanged } from '@/lib/data-events';
import { brandCompleteness, type BrandCompleteness } from '@/lib/brand-setup';
import { ButtonLink } from '@/components/ui/Button';
import Button from '@/components/ui/Button';
import Icon, { type IconName } from '@/components/ui/icons';
import StatusBadge from '@/components/ui/StatusBadge';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import WelcomeChecklist, { type WelcomeStep } from '@/components/dashboard/WelcomeChecklist';
import esHome from '@/locales/es/dashboard/home';
import enHome from '@/locales/en/dashboard/home';
import type { Totals, RecentContentItem, TopPost, ContentPerformance } from '@/types/content';
import styles from './page.module.css';

type MetricKey = Exclude<keyof Totals, 'top_posts'>;

const METRICS: { key: MetricKey; icon: IconName }[] = [
  { key: 'impressions', icon: 'eye' },
  { key: 'reach', icon: 'reach' },
  { key: 'likes', icon: 'heart' },
  { key: 'comments', icon: 'comment' },
  { key: 'shares', icon: 'share' },
  { key: 'clicks', icon: 'click' },
];

function formatCompact(n: number, lang: string): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-CL', {
    notation: 'compact', maximumFractionDigits: 1,
  }).format(n);
}

/** La lista de primeros pasos se oculta por usuario y dispositivo. */
function hiddenKey(userId: string) { return `kefy:welcome-hidden:${userId}`; }

function readHidden(userId: string): boolean {
  try { return window.localStorage.getItem(hiddenKey(userId)) === '1'; } catch { return false; }
}

function MetricsSkeleton() {
  return (
    <div className="auto-grid" style={{ ['--min' as string]: '140px' }}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={styles.metric}>
          <SkeletonBlock width={20} height={20} style={{ marginBottom: 10 }} />
          <SkeletonBlock width={56} height={22} style={{ marginBottom: 6 }} />
          <SkeletonBlock width={72} height={12} />
        </div>
      ))}
    </div>
  );
}

function DashboardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, org, subscription, usage, loading: authLoading } = useAuth();
  const { activeBrand } = useBrand();
  const { lang } = useParams<{ lang: string }>();
  const t = lang === 'en' ? enHome : esHome;
  const base = `/${lang}/dashboard`;

  const [hasAccounts, setHasAccounts] = useState<boolean | null>(null);
  const [brand, setBrand] = useState<BrandCompleteness | null>(null);
  const [content, setContent] = useState<RecentContentItem[] | null>(null);
  const [hasPublished, setHasPublished] = useState<boolean | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [perfById, setPerfById] = useState<Map<string, ContentPerformance>>(new Map());
  const [syncing, setSyncing] = useState(false);
  const [welcomeHidden, setWelcomeHidden] = useState(true);

  // Los enlaces antiguos (registro anterior, correos) llevaban ?onboarding=1:
  // ahora el primer paso es su propia página.
  useEffect(() => {
    if (searchParams.get('onboarding') === '1') router.replace(`/${lang}/onboarding`);
  }, [searchParams, router, lang]);

  useEffect(() => {
    if (user?.id) setWelcomeHidden(readHidden(user.id));
  }, [user?.id]);

  function hideWelcome() {
    setWelcomeHidden(true);
    if (user?.id) {
      try { window.localStorage.setItem(hiddenKey(user.id), '1'); } catch { /* sin almacenamiento: solo esta visita */ }
    }
  }

  const fetchRecentContent = useCallback(() => {
    fetch('/api/content?limit=5', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) { setContent([]); return; }
        const json = await res.json() as { items?: RecentContentItem[]; content?: RecentContentItem[] };
        const items = json.items ?? json.content ?? [];
        setContent(items);
        if (items.some((c) => c.status === 'published' || c.status === 'scheduled')) {
          setHasPublished(true);
          return;
        }
        // Lo reciente puede ser todo borradores aunque ya se haya publicado antes.
        const [pub, sched] = await Promise.all(['published', 'scheduled'].map((status) =>
          fetch(`/api/content?limit=1&status=${status}`, { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => ((j?.items ?? j?.content ?? []) as unknown[]).length > 0)
            .catch(() => false)));
        setHasPublished(pub || sched);
      })
      .catch(() => setContent([]));
  }, []);

  const fetchTotals = useCallback(() => {
    const to = new Date();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return fetch(`/api/analytics?from=${from.toISOString()}&to=${to.toISOString()}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        // `top_posts` llega como hermano de `totals` (AnalyticsOverview en
        // lib/services/analytics.ts).
        const json = await res.json() as { totals: Totals; top_posts?: TopPost[] };
        setTotals(json.totals ? { ...json.totals, top_posts: json.top_posts ?? [] } : null);
      })
      .catch(() => {});
  }, []);

  // Métricas de lo publicado, para enseñarlas junto al contenido reciente.
  const fetchPerformance = useCallback(() => {
    fetch('/api/analytics/posts?limit=20', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json() as {
          data?: Array<{ content: { id: string | null }; latest_metrics: ContentPerformance | null }>;
        };
        const map = new Map<string, ContentPerformance>();
        for (const row of json.data ?? []) {
          if (row.content.id && row.latest_metrics) map.set(row.content.id, row.latest_metrics);
        }
        setPerfById(map);
      })
      .catch(() => {});
  }, []);

  const loadBrandScoped = useCallback(() => {
    // Al cambiar de marca todo vuelve a «cargando»: si no, se veían un instante
    // los datos de la marca anterior.
    setHasAccounts(null);
    setBrand(null);
    setContent(null);
    setHasPublished(null);
    setTotals(null);
    setMetricsLoading(true);

    fetch('/api/social/accounts', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) { setHasAccounts(false); return; }
        const json = await res.json() as { accounts?: unknown[] };
        setHasAccounts((json.accounts ?? []).length > 0);
      })
      .catch(() => setHasAccounts(false));

    fetch('/api/brand-kit', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setBrand(brandCompleteness(json?.kit ?? null)))
      .catch(() => setBrand(brandCompleteness(null)));

    fetchRecentContent();
  }, [fetchRecentContent]);

  useEffect(() => { loadBrandScoped(); }, [loadBrandScoped, activeBrand?.id]);

  useEffect(() => {
    if (hasAccounts === null) return;
    if (!hasAccounts) { setMetricsLoading(false); return; }
    void fetchTotals().finally(() => setMetricsLoading(false));
    fetchPerformance();
  }, [hasAccounts, fetchTotals, fetchPerformance]);

  // El asistente creó contenido o sincronizó métricas: se recargan.
  useDataChanged(['analytics', 'content'], () => {
    fetchRecentContent();
    if (hasAccounts) { void fetchTotals(); fetchPerformance(); }
  });
  useDataChanged(['brand-kit'], () => {
    fetch('/api/brand-kit', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (json?.kit) setBrand(brandCompleteness(json.kit)); })
      .catch(() => {});
  });

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch('/api/analytics/sync', { method: 'POST', credentials: 'include' });
      await fetchTotals();
      fetchPerformance();
    } catch { /* no crítico: las métricas siguen como estaban */ }
    setSyncing(false);
  }

  // ── Aviso de plan: uno solo, el más urgente ──
  // No poder crear pesa más que quedarse sin créditos, y eso más que un trial
  // que aún corre. Va arriba: antes estaba al final de la página.
  const planNotice: { title: string; desc: string; urgent: boolean } | null = (() => {
    if (subscription && !subscription.canCreate) {
      return subscription.reason === 'payment_failed'
        ? { title: t.plan.paymentFailed, desc: t.plan.paymentFailedDesc, urgent: true }
        : { title: t.plan.trialEnded, desc: t.plan.trialEndedDesc, urgent: true };
    }
    if (usage && usage.remaining <= 0) {
      return { title: t.plan.creditsOut(usage.limit), desc: t.plan.creditsOutDesc, urgent: true };
    }
    // Umbral del 20 %: margen para reaccionar sin avisar el primer día del mes.
    if (usage && usage.remaining <= usage.limit * 0.2) {
      return { title: t.plan.creditsLow(usage.remaining, usage.limit), desc: t.plan.creditsLowDesc, urgent: false };
    }
    if (subscription?.isTrialing) {
      const days = subscription.trialDaysLeft ?? 0;
      return days <= 1
        ? { title: t.plan.trialLastDay, desc: t.plan.trialEndedDesc, urgent: true }
        : { title: t.plan.trialActive(days), desc: t.plan.trialActiveDesc, urgent: days <= 3 };
    }
    return null;
  })();

  const dataReady = hasAccounts !== null && brand !== null && content !== null && hasPublished !== null;

  const steps: WelcomeStep[] = dataReady ? [
    { key: 'posts', done: content.length > 0, href: `/${lang}/onboarding` },
    {
      key: 'brand', done: brand.complete, href: `${base}/brand/setup`,
      desc: brand.percent > 0 ? t.welcome.steps.brand.descPercent(brand.percent) : undefined,
    },
    { key: 'social', done: hasAccounts, href: `${base}/settings#social` },
    { key: 'publish', done: hasPublished, href: `${base}/content` },
  ] : [];
  const allDone = steps.length > 0 && steps.every((s) => s.done);
  const showWelcome = dataReady && !welcomeHidden && !allDone;

  if (authLoading) {
    return (
      <div className={styles.loading} role="status">
        <span>{t.loading}</span>
      </div>
    );
  }

  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <div className={`page ${styles.home}`}>
      <header className="page-header">
        <div>
          <h1>{firstName ? t.hello(firstName) : t.helloAnonymous}</h1>
          <p>{org?.name ? t.intro(org.name) : t.introNoOrg}</p>
        </div>
        <div className="page-header-actions">
          <ButtonLink href={`${base}/content/create?new=1`} variant="primary" icon={<Icon name="plus" size={16} />}>
            {t.create}
          </ButtonLink>
        </div>
      </header>

      {planNotice && (
        <div className={styles.plan} data-urgent={planNotice.urgent}>
          <Icon name={planNotice.urgent ? 'alert' : 'info'} size={20} />
          <div className={styles.planText}>
            <p className={styles.planTitle}>{planNotice.title}</p>
            <p className={styles.planDesc}>{planNotice.desc}</p>
          </div>
          <ButtonLink href={`${base}/settings#billing`} variant={planNotice.urgent ? 'primary' : 'secondary'} size="sm">
            {t.plan.viewPlans}
          </ButtonLink>
        </div>
      )}

      {showWelcome && <WelcomeChecklist lang={lang} steps={steps} onHide={hideWelcome} />}

      {/* ── Métricas ── */}
      {hasAccounts !== false && (
        <section className={styles.section} aria-labelledby="home-metrics">
          <div className={styles.sectionHead}>
            <h2 id="home-metrics" className={styles.sectionTitle}>{t.metrics.title}</h2>
            {hasAccounts && (
              <Button size="sm" variant="secondary" loading={syncing} onClick={() => void handleSync()}
                icon={<Icon name="refresh" size={14} />}>
                {syncing ? t.metrics.syncing : t.metrics.sync}
              </Button>
            )}
          </div>
          {metricsLoading || hasAccounts === null ? <MetricsSkeleton /> : (
            <div className="auto-grid" style={{ ['--min' as string]: '140px' }}>
              {METRICS.map(({ key, icon }) => (
                <div key={key} className={styles.metric}>
                  <Icon name={icon} size={18} className={styles.metricIcon} />
                  <p className={styles.metricValue}>{totals ? formatCompact(totals[key], lang) : '—'}</p>
                  <p className={styles.metricLabel}>{t.metrics[key]}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {hasAccounts === false && !showWelcome && (
        <p className={styles.inlineNotice}>
          <Icon name="link" size={16} />
          <span>{t.metrics.noAccounts}</span>
          <Link href={`${base}/settings#social`}>{t.metrics.connect}</Link>
        </p>
      )}

      {/* ── Contenido reciente ── */}
      <section className={styles.section} aria-labelledby="home-recent">
        <div className={styles.sectionHead}>
          <h2 id="home-recent" className={styles.sectionTitle}>{t.recent.title}</h2>
          <Link href={`${base}/content`} className={styles.more}>
            {t.recent.all} <Icon name="arrow-right" size={14} />
          </Link>
        </div>
        {content === null ? (
          <div className={styles.list}>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className={styles.row}>
                <SkeletonBlock width={40} height={40} borderRadius={8} />
                <SkeletonBlock height={12} style={{ flex: 1 }} />
              </div>
            ))}
          </div>
        ) : content.length === 0 ? (
          <p className={styles.empty}>{t.recent.empty}</p>
        ) : (
          <ul className={styles.list}>
            {content.map((item) => {
              const perf = perfById.get(item.id);
              const isVideo = (item.content_type === 'reel' || item.content_type === 'story') && !!item.video_url;
              return (
                <li key={item.id}>
                  <Link href={`${base}/content/${item.id}`} className={`${styles.row} ui-hoverable`}>
                    <span
                      className={styles.thumb}
                      style={item.image_url ? { backgroundImage: `url(${item.image_url})` } : undefined}
                      aria-hidden="true"
                    >
                      {!item.image_url && <ChannelIcon name={item.channel} size={14} />}
                      {isVideo && <span className={styles.play}><Icon name="play" size={14} /></span>}
                    </span>
                    <span className={styles.body}>
                      {item.body?.slice(0, 120) || '—'}
                      {isVideo && <span className="sr-only"> ({t.recent.video})</span>}
                    </span>
                    {item.status === 'published' && perf && (
                      <span className={styles.perf}>
                        {t.recent.perf(formatCompact(perf.impressions, lang), formatCompact(perf.likes, lang))}
                      </span>
                    )}
                    <StatusBadge status={item.status} lang={lang} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Mejor rendimiento ── */}
      {!!totals?.top_posts?.length && (
        <section className={styles.section} aria-labelledby="home-top">
          <h2 id="home-top" className={styles.sectionTitle}>{t.top.title}</h2>
          <ul className="auto-grid" style={{ ['--min' as string]: '170px', listStyle: 'none', padding: 0, margin: '16px 0 0' }}>
            {totals.top_posts.map((post) => {
              const inner = (
                <>
                  <span
                    className={styles.topImage}
                    style={post.image_url ? { backgroundImage: `url(${post.image_url})` } : undefined}
                    aria-hidden="true"
                  >
                    <span className={styles.topChannel}><ChannelIcon name={post.platform} size={11} /></span>
                  </span>
                  <span className={styles.topText}>
                    <span className={styles.topBody}>{post.body_preview || '—'}</span>
                    <span className={styles.topPerf}>
                      {t.top.perf(
                        formatCompact(post.impressions, lang),
                        formatCompact(post.likes, lang),
                        `${(post.engagement_rate * 100).toFixed(1)} %`,
                      )}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={post.scheduled_post_id}>
                  {post.content_id ? (
                    <Link href={`${base}/content/${post.content_id}`} className={`${styles.top} ui-link-card`}>{inner}</Link>
                  ) : (
                    <div className={styles.top}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Accesos rápidos (con la lista de primeros pasos visible sobran) ── */}
      {!showWelcome && (
        <section className={styles.section} aria-labelledby="home-quick">
          <h2 id="home-quick" className={styles.sectionTitle}>{t.quick.title}</h2>
          <ul className="auto-grid" style={{ ['--min' as string]: '200px', listStyle: 'none', padding: 0, margin: '16px 0 0' }}>
            {([
              { href: `${base}/brand`, icon: 'brand', ...t.quick.brand },
              { href: `${base}/content/create?new=1`, icon: 'sparkles', ...t.quick.content },
              { href: `${base}/conversations`, icon: 'inbox', ...t.quick.inbox },
              { href: `${base}/automations`, icon: 'bolt', ...t.quick.automations },
            ] as const).map((a) => (
              <li key={a.href}>
                <Link href={a.href} className={`${styles.quick} ui-link-card`}>
                  <Icon name={a.icon} size={20} className={styles.quickIcon} />
                  <span className={styles.quickLabel}>{a.label}</span>
                  <span className={styles.quickDesc}>{a.desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
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
