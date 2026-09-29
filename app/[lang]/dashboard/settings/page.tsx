'use client';

// ─── Ajustes ─────────────────────────────────────────────────────────────────
//
// Siete secciones en un solo scroll, con un índice que lleva a cada una: lista
// fija a la izquierda en escritorio ancho, fila de chips en el resto. Cada
// sección tiene un id estable (#profile, #org, #billing, #social, #team,
// #api-keys, #lead-scoring) porque otras pantallas enlazan directo a ellas
// (p. ej. /{lang}/dashboard/settings#social para conectar cuentas).
//
// El nombre de la persona se edita solo en Mi perfil; aquí se muestra con un
// enlace. Los planes salen de lib/plans.ts: nada de precios ni features en el
// locale de ajustes.

import { Suspense, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { toLocale } from '@/lib/i18n';
import {
  FEATURED_PLAN, PLAN_ORDER, PLAN_PRICES_USD, isBillingPlan, planHighlights, planIncluded, planName,
} from '@/lib/plans';
import type { BillingPlan } from '@/types/billing';
import SocialConnectionPanel from '@/components/dashboard/SocialConnectionPanel';
import TeamPanel from '@/components/dashboard/TeamPanel';
import ApiKeysSection from '@/components/dashboard/settings/ApiKeysSection';
import SectionCard from '@/components/ui/SectionCard';
import Button, { ButtonLink, Spinner } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import Notice, { type NoticeTone } from '@/components/ui/Notice';
import Icon from '@/components/ui/icons';
import styles from './page.module.css';

import esT from '@/locales/es/dashboard/settings';
import enT from '@/locales/en/dashboard/settings';
import esPlans from '@/locales/es/plans';
import enPlans from '@/locales/en/plans';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

const T = { es: esT, en: enT } as const;
const PLANS_COPY = { es: esPlans, en: enPlans } as const;
const COMMON = { es: esCommon, en: enCommon } as const;

type SectionId = 'profile' | 'org' | 'billing' | 'social' | 'team' | 'api-keys' | 'lead-scoring';

// ─── Scoring de leads ────────────────────────────────────────────────────────
// Las claves son las de kefy_lead_scoring_config. Postgres devuelve el JSONB
// con las claves reordenadas: se muestran en un orden fijo y las que no se
// conozcan, al final con su clave legible.

const INTERACTION_ORDER = ['comment', 'dm', 'mention', 'review', 'share', 'follow', 'click', 'manual'];
const STAGE_ORDER = ['tibio', 'caliente', 'contactado', 'convertido'];
const DEFAULT_SCORES: Record<string, number> = { comment: 5, review: 10, dm: 15, mention: 8, follow: 3, share: 12, click: 2, manual: 0 };
const DEFAULT_THRESHOLDS: Record<string, number> = { tibio: 20, caliente: 50, contactado: 70, convertido: 100 };

function orderedKeys(values: Record<string, number>, order: string[]): string[] {
  const keys = Object.keys(values);
  return [...order.filter((k) => keys.includes(k)), ...keys.filter((k) => !order.includes(k))];
}

function humanize(key: string): string {
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Contenedor que hace scroll (en el dashboard, .dashboard-main); null = la ventana. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

const CURRENT_BADGE = { '--badge-color': 'var(--on-accent)', '--badge-bg': 'var(--accent)' } as CSSProperties;
const POPULAR_BADGE = { '--badge-color': 'var(--accent-text)', '--badge-bg': 'var(--accent-soft)' } as CSSProperties;

/**
 * «Guardado» junto al botón. La región viva está siempre en el DOM: una que
 * aparece a la vez que su texto no siempre se anuncia.
 */
function SavedStatus({ show, label }: { show: boolean; label: string }) {
  return (
    <span role="status" className={styles.saved}>
      {show && (
        <>
          <Icon name="check" size={14} strokeWidth={2.4} />
          {label}
        </>
      )}
    </span>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────

function SettingsPageInner() {
  const { user, org, plan, role, subscription, loading: authLoading, refresh } = useAuth();
  const { lang } = useParams<{ lang: string }>();
  const locale = toLocale(lang);
  const t = T[locale];
  const tc = COMMON[locale];
  const tp = PLANS_COPY[locale];
  const ts = t.leadScoring;
  const searchParams = useSearchParams();

  const canManage = role === 'owner' || role === 'admin';
  // Mientras carga la sesión el rol es null: no se trata a nadie como miembro
  // hasta saberlo.
  const isMember = role !== null && !canManage;

  // ── Índice de secciones ──────────────────────────────────────────────────
  const sections: { id: SectionId; label: string }[] = [
    { id: 'profile', label: t.sections.profile },
    { id: 'org', label: t.sections.org },
    { id: 'billing', label: t.sections.billing },
    { id: 'social', label: t.sections.social },
    { id: 'team', label: t.sections.team },
    // /api/api-keys responde 403 a los miembros: la sección no se muestra.
    ...(canManage ? [{ id: 'api-keys' as const, label: t.apiKeys.sectionTitle }] : []),
    { id: 'lead-scoring', label: t.sections.leadScoring },
  ];
  const sectionKey = sections.map((s) => s.id).join(',');
  const [activeSection, setActiveSection] = useState<SectionId>('profile');

  // La sección en pantalla se marca en el índice (aria-current): la última
  // cuyo borde superior ya pasó el primer tercio de la pantalla, o la última
  // de todas al llegar al final (una sección corta al fondo nunca llega arriba).
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ids = sectionKey.split(',') as SectionId[];
    const scroller = scrollParent(pageRef.current);
    const target: HTMLElement | Window = scroller ?? window;
    let frame = 0;

    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.3;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      const atBottom = scroller
        ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4
        : window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
      const scrolled = scroller ? scroller.scrollTop > 0 : window.scrollY > 0;
      if (atBottom && scrolled) current = ids[ids.length - 1];
      setActiveSection(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    target.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      target.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [sectionKey]);

  // Enlaces desde otras pantallas (/settings#social): la página se pinta en el
  // cliente y al cargar el navegador todavía no encuentra el ancla. Se hace
  // una vez, cuando la sección ya existe (#api-keys depende del rol).
  const hashHandled = useRef(false);
  useEffect(() => {
    if (hashHandled.current) return;
    let id = '';
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { id = ''; }
    if (!id) { hashHandled.current = true; return; }
    const el = document.getElementById(id);
    if (!el) return;
    hashHandled.current = true;
    el.scrollIntoView?.({ block: 'start' });
    if (sectionKey.split(',').includes(id)) setActiveSection(id as SectionId);
  }, [sectionKey]);

  // ── Plan y facturación ───────────────────────────────────────────────────
  const [billingLoading, setBillingLoading] = useState<string | null>(null);
  const [billingNotice, setBillingNotice] = useState<{ tone: NoticeTone; msg: string } | null>(null);

  // Vuelta del checkout de Stripe.
  useEffect(() => {
    const billing = searchParams.get('billing');
    if (billing !== 'success' && billing !== 'canceled') return;

    if (billing === 'success') {
      setBillingNotice({ tone: 'success', msg: t.billing.success });
      // Refresca la sesión para que el plan nuevo se vea ya.
      refresh().catch(() => {});
    } else {
      setBillingNotice({ tone: 'info', msg: t.billing.canceled });
    }
    window.history.replaceState({}, '', window.location.pathname);
    // El aviso vive en la sección de facturación, que en móvil queda lejos.
    requestAnimationFrame(() => document.getElementById('billing')?.scrollIntoView?.({ block: 'start' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orgPlan = org?.plan;
  const currentPlan: BillingPlan = isBillingPlan(plan) ? plan : isBillingPlan(orgPlan) ? orgPlan : 'starter';

  // Con una suscripción de Stripe detrás (activa o con el cobro fallido) el
  // plan actual se gestiona en el portal. En el mes gratis, o sin suscripción,
  // no hay nada que gestionar: el portal respondía «No Stripe customer found»
  // y no había forma de contratar el plan en el que se estaba. Si no se pudo
  // leer la suscripción, se ofrece el portal, como antes.
  const hasStripeSubscription = subscription
    ? !subscription.isTrialing && subscription.status !== 'canceled'
    : true;

  const subscriptionNotice: { tone: NoticeTone; msg: string } | null = (() => {
    if (!subscription) return null;
    if (subscription.reason === 'payment_failed') return { tone: 'danger', msg: t.billing.status.paymentFailed };
    if (!subscription.canCreate) {
      return {
        tone: 'warning',
        msg: subscription.reason === 'trial_expired' ? t.billing.status.trialEnded : t.billing.status.inactive,
      };
    }
    if (subscription.isTrialing) return { tone: 'info', msg: t.billing.status.trial(subscription.trialDaysLeft ?? 0) };
    return null;
  })();

  async function handleCheckout(target: BillingPlan) {
    setBillingLoading(target);
    setBillingNotice(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: target, lang: lang === 'en' ? 'en' : 'es' }),
      });
      const data = await res.json().catch(() => ({})) as { url?: string };
      if (!res.ok || !data.url) {
        setBillingNotice({ tone: 'danger', msg: res.status === 403 ? t.billing.onlyManagers : t.billing.checkoutError });
        setBillingLoading(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setBillingNotice({ tone: 'danger', msg: t.billing.checkoutError });
      setBillingLoading(null);
    }
  }

  async function handleManageSubscription() {
    setBillingLoading('portal');
    setBillingNotice(null);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: lang === 'en' ? 'en' : 'es' }),
      });
      const data = await res.json().catch(() => ({})) as { url?: string };
      if (!res.ok || !data.url) {
        setBillingNotice(
          res.status === 400 ? { tone: 'info', msg: t.billing.noCustomer }
          : res.status === 403 ? { tone: 'danger', msg: t.billing.onlyManagers }
          : { tone: 'danger', msg: t.billing.portalError },
        );
        setBillingLoading(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setBillingNotice({ tone: 'danger', msg: t.billing.portalError });
      setBillingLoading(null);
    }
  }

  // ── Organización ─────────────────────────────────────────────────────────
  const [orgName, setOrgName] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgSaved, setOrgSaved] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  useEffect(() => {
    if (org?.name) setOrgName(org.name);
  }, [org?.name]);

  async function handleSaveOrg(e: FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    setSavingOrg(true);
    setOrgError(null);
    setOrgSaved(false);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_name: orgName.trim() }),
      });
      if (!res.ok) {
        setOrgError(res.status === 403 ? t.org.readOnly : t.org.saveError);
        return;
      }
      await refresh();
      setOrgSaved(true);
      setTimeout(() => setOrgSaved(false), 3000);
    } catch {
      setOrgError(t.org.saveError);
    } finally {
      setSavingOrg(false);
    }
  }

  // ── Scoring de leads ─────────────────────────────────────────────────────
  const [scoringDefaults, setScoringDefaults] = useState<Record<string, number>>(DEFAULT_SCORES);
  const [scoringThresholds, setScoringThresholds] = useState<Record<string, number>>(DEFAULT_THRESHOLDS);
  const [scoringLoading, setScoringLoading] = useState(true);
  const [scoringSaving, setScoringSaving] = useState(false);
  const [scoringSaved, setScoringSaved] = useState(false);
  const [scoringError, setScoringError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/automations/leads/scoring', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.config) {
          setScoringDefaults(d.config.defaults ?? DEFAULT_SCORES);
          setScoringThresholds(d.config.thresholds ?? DEFAULT_THRESHOLDS);
        }
      })
      .catch(() => {})
      .finally(() => setScoringLoading(false));
  }, []);

  async function handleSaveScoring(e: FormEvent) {
    e.preventDefault();
    setScoringSaving(true);
    setScoringError(null);
    setScoringSaved(false);
    try {
      const res = await fetch('/api/automations/leads/scoring', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaults: scoringDefaults, thresholds: scoringThresholds }),
      });
      if (!res.ok) {
        setScoringError(res.status === 403 ? ts.readOnly : ts.saveError);
        return;
      }
      setScoringSaved(true);
      setTimeout(() => setScoringSaved(false), 2500);
    } catch {
      setScoringError(ts.saveError);
    } finally {
      setScoringSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div ref={pageRef} className="page" style={{ maxWidth: 1000 }}>
      <header className="page-header">
        <div>
          <h1 style={{ fontFamily: 'var(--font-syne), system-ui, sans-serif' }}>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
      </header>

      <div className={styles.layout}>
        <nav aria-label={t.indexLabel} className={styles.index}>
          <ul className={styles.indexList}>
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={styles.indexLink}
                  aria-current={activeSection === s.id ? 'location' : undefined}
                  onClick={() => setActiveSection(s.id)}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.sections}>
          {/* ── Perfil: el nombre se edita en /dashboard/profile ── */}
          <SectionCard
            id="profile"
            className={styles.section}
            title={t.sections.profile}
            subtitle={t.profile.subtitle}
            actions={
              <ButtonLink
                href={`/${locale}/dashboard/profile`}
                variant="secondary"
                size="sm"
                icon={<Icon name="edit" size={14} />}
              >
                {t.profile.edit}
              </ButtonLink>
            }
          >
            <dl className={styles.facts}>
              <div>
                <dt>{t.profile.nameLabel}</dt>
                <dd>{authLoading ? '…' : (user?.name || t.profile.noName)}</dd>
              </div>
              <div>
                <dt>{t.profile.emailLabel}</dt>
                <dd>{authLoading ? '…' : (user?.email ?? '—')}</dd>
              </div>
            </dl>
          </SectionCard>

          {/* ── Organización ── */}
          <SectionCard id="org" className={styles.section} title={t.sections.org} subtitle={t.org.subtitle}>
            {isMember ? (
              <div className={styles.form}>
                <dl className={styles.facts}>
                  <div>
                    <dt>{t.org.nameLabel}</dt>
                    <dd>{org?.name ?? '—'}</dd>
                  </div>
                </dl>
                <p className={styles.hint}>{t.org.readOnly}</p>
              </div>
            ) : (
              <form onSubmit={handleSaveOrg} className={styles.form}>
                <Field label={t.org.nameLabel}>
                  <Input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    required
                    maxLength={100}
                    autoComplete="organization"
                  />
                </Field>
                <div className={styles.actions}>
                  <Button type="submit" variant="primary" loading={savingOrg}>
                    {savingOrg ? tc.actions.saving : tc.actions.save}
                  </Button>
                  <SavedStatus show={orgSaved} label={t.org.saved} />
                </div>
                {orgError && <Notice tone="danger">{orgError}</Notice>}
              </form>
            )}
          </SectionCard>

          {/* ── Plan y facturación ── */}
          <SectionCard id="billing" className={styles.section} title={t.sections.billing}>
            <div className={styles.billingNotices}>
              {billingNotice && (
                <Notice
                  tone={billingNotice.tone}
                  icon={billingNotice.tone === 'success' ? <Icon name="check-circle" size={16} /> : undefined}
                >
                  {billingNotice.msg}
                </Notice>
              )}
              {subscriptionNotice && (
                <Notice tone={subscriptionNotice.tone} live={false}>{subscriptionNotice.msg}</Notice>
              )}
              {isMember && <Notice live={false}>{t.billing.onlyManagers}</Notice>}
            </div>

            <ul className={`auto-grid ${styles.plans}`} style={{ '--min': '200px', '--gap': '12px' } as CSSProperties}>
              {PLAN_ORDER.map((p) => {
                const name = planName(p, locale);
                const isCurrent = p === currentPlan;
                const featured = p === FEATURED_PLAN;
                const portal = isCurrent && hasStripeSubscription;
                const higher = PLAN_ORDER.indexOf(p) > PLAN_ORDER.indexOf(currentPlan);
                const label = portal ? t.billing.manage
                  : isCurrent ? t.billing.subscribe(name)
                  : higher ? t.billing.upgrade(name)
                  : t.billing.change(name);
                const busyKey = portal ? 'portal' : p;
                const busy = billingLoading === busyKey;
                return (
                  <li
                    key={p}
                    className={styles.plan}
                    data-current={isCurrent || undefined}
                    data-featured={featured || undefined}
                  >
                    <div className={styles.planHead}>
                      <h3 className={styles.planName}>{name}</h3>
                      {isCurrent ? (
                        <span className="ui-badge" style={CURRENT_BADGE}>{t.billing.current}</span>
                      ) : featured ? (
                        <span className="ui-badge" style={POPULAR_BADGE}>{tp.popular}</span>
                      ) : null}
                    </div>
                    <p className={styles.planPrice}>
                      <span className={styles.planAmount}>${PLAN_PRICES_USD[p]}</span>
                      <span className={styles.planPer}>{tp.per}</span>
                    </p>
                    <ul className={styles.features}>
                      {planHighlights(p, locale).map((f) => (
                        <li key={f}>
                          <Icon name="check" size={14} strokeWidth={2.4} className={styles.check} />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {!isMember && (
                      <Button
                        block
                        variant={portal ? 'secondary' : isCurrent || featured ? 'primary' : 'secondary'}
                        loading={busy}
                        disabled={billingLoading !== null || authLoading}
                        onClick={() => void (portal ? handleManageSubscription() : handleCheckout(p))}
                      >
                        {busy ? t.billing.redirecting : label}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className={styles.included}>
              <p className={styles.includedTitle}>{t.billing.includedTitle}</p>
              <ul className={styles.features}>
                {planIncluded(locale).map((f) => (
                  <li key={f}>
                    <Icon name="check" size={14} strokeWidth={2.4} className={styles.check} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </SectionCard>

          {/* ── Cuentas sociales (otras pantallas enlazan a #social) ── */}
          <SectionCard id="social" className={styles.section} title={t.sections.social}>
            <SocialConnectionPanel locale={locale} mode="settings" autoConnectFromQuery />
          </SectionCard>

          {/* ── Equipo ── */}
          <SectionCard id="team" className={styles.section} title={t.sections.team}>
            <TeamPanel locale={locale} role={role ?? 'member'} />
          </SectionCard>

          {/* ── API y MCP ── Solo dueño y administradores: /api/api-keys responde 403
              al resto, así que a los miembros no se les muestra la sección. */}
          {canManage && (
            <SectionCard id="api-keys" className={styles.section} title={t.apiKeys.sectionTitle}>
              <ApiKeysSection lang={locale} />
            </SectionCard>
          )}

          {/* ── Scoring de leads ── */}
          <SectionCard id="lead-scoring" className={styles.section} title={t.sections.leadScoring} subtitle={ts.subtitle}>
            {scoringLoading ? (
              <p className={styles.loading}><Spinner size={14} /> {tc.actions.loading}</p>
            ) : (
              <form onSubmit={handleSaveScoring} className={styles.form} style={{ gap: 24 }}>
                <fieldset className={styles.fieldset} disabled={isMember}>
                  <legend className={styles.legend}>{ts.pointsTitle}</legend>
                  <div
                    className={`auto-grid ${styles.fieldsetBody}`}
                    style={{ '--min': '200px', '--gap': '14px 20px' } as CSSProperties}
                  >
                    {orderedKeys(scoringDefaults, INTERACTION_ORDER).map((key) => {
                      const value = scoringDefaults[key];
                      return (
                        <Field key={key} label={ts.interactions[key] ?? humanize(key)}>
                          {(control) => (
                            <div className={styles.rangeRow}>
                              <input
                                {...control}
                                type="range"
                                min={0}
                                max={50}
                                step={1}
                                value={value}
                                onChange={(e) => setScoringDefaults((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                                aria-valuetext={ts.points(value)}
                                className={styles.range}
                              />
                              <span className={styles.rangeValue} aria-hidden="true">{value}</span>
                            </div>
                          )}
                        </Field>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset className={styles.fieldset} disabled={isMember}>
                  <legend className={styles.legend}>{ts.thresholdsTitle}</legend>
                  <div
                    className={`auto-grid ${styles.fieldsetBody}`}
                    style={{ '--min': '150px', '--gap': '12px' } as CSSProperties}
                  >
                    {orderedKeys(scoringThresholds, STAGE_ORDER).map((key) => (
                      <Field key={key} label={ts.stages[key] ?? humanize(key)}>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={1000}
                          value={scoringThresholds[key]}
                          onChange={(e) => setScoringThresholds((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                        />
                      </Field>
                    ))}
                  </div>
                </fieldset>

                {isMember ? (
                  <p className={styles.hint}>{ts.readOnly}</p>
                ) : (
                  <div className={styles.actions}>
                    <Button type="submit" variant="primary" loading={scoringSaving}>
                      {scoringSaving ? tc.actions.saving : ts.save}
                    </Button>
                    <SavedStatus show={scoringSaved} label={ts.saved} />
                  </div>
                )}
                {scoringError && <Notice tone="danger">{scoringError}</Notice>}
              </form>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  );
}
