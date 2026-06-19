'use client';

import { useEffect, useState, Suspense } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useParams, useSearchParams } from 'next/navigation';
import type { Locale } from '@/types/i18n';
import SocialConnectionPanel from '@/components/dashboard/SocialConnectionPanel';

import esT from '@/locales/es/dashboard/settings';
import enT from '@/locales/en/dashboard/settings';

const T = { es: esT, en: enT } as const;

// ─── Constants ────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 14,
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--muted)',
  display: 'block',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      marginBottom: 28,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '20px 24px',
    }}>
      <h2 style={{
        fontFamily: 'var(--font-syne)', fontSize: 15, fontWeight: 700,
        marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--border)',
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function SettingsPageInner() {
  const { user, org, plan, refresh } = useAuth();
  const { lang } = useParams<{ lang: string }>();
  const t = T[(lang as Locale) ?? 'es'] ?? T.es;
  const searchParams = useSearchParams();

  // Billing
  const [billingLoading, setBillingLoading] = useState<string | null>(null);
  const [billingNotice, setBillingNotice]   = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);

  // Handle redirect back from OAuth callback + Stripe billing callback
  useEffect(() => {
    const billing   = searchParams.get('billing');

    if (billing === 'success') {
      setBillingNotice({ type: 'success', msg: t.billingSuccess });
      window.history.replaceState({}, '', window.location.pathname);
      // Refresh auth context so plan badge updates immediately
      refresh().catch(() => {});
    } else if (billing === 'canceled') {
      setBillingNotice({ type: 'info', msg: t.billingCanceled });
      window.history.replaceState({}, '', window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Profile form
  const [name, setName]   = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved]   = useState(false);
  const [profileError, setProfileError]   = useState<string | null>(null);

  const [orgName, setOrgName] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgSaved, setOrgSaved] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Lead scoring state
  type ScoringDefaults  = Record<string, number>;
  type ScoringThresholds = Record<string, number>;
  const defaultScores: ScoringDefaults  = { comment: 5, review: 10, dm: 15, mention: 8, follow: 3, share: 12, click: 2, manual: 0 };
  const defaultThresholds: ScoringThresholds = { tibio: 20, caliente: 50, contactado: 70, convertido: 100 };
  const [scoringDefaults,    setScoringDefaults]    = useState<ScoringDefaults>(defaultScores);
  const [scoringThresholds,  setScoringThresholds]  = useState<ScoringThresholds>(defaultThresholds);
  const [scoringLoading,     setScoringLoading]     = useState(true);
  const [scoringSaving,      setScoringSaving]      = useState(false);
  const [scoringSaved,       setScoringSaved]       = useState(false);
  const [scoringError,       setScoringError]       = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/automations/leads/scoring', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.config) {
          setScoringDefaults(d.config.defaults   ?? defaultScores);
          setScoringThresholds(d.config.thresholds ?? defaultThresholds);
        }
      })
      .catch(() => {})
      .finally(() => setScoringLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveScoring(e: React.FormEvent) {
    e.preventDefault();
    setScoringSaving(true); setScoringError(null); setScoringSaved(false);
    try {
      const res = await fetch('/api/automations/leads/scoring', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaults: scoringDefaults, thresholds: scoringThresholds }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setScoringSaved(true);
      setTimeout(() => setScoringSaved(false), 2500);
    } catch (err) {
      setScoringError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setScoringSaving(false);
    }
  }

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user]);

  useEffect(() => {
    if (org?.name) setOrgName(org.name);
  }, [org?.name]);

  async function handleUpgrade(targetPlan: string) {
    setBillingLoading(targetPlan);
    setBillingNotice(null);
    try {
      const res  = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetPlan }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? t.billingError);
      window.location.href = data.url!;
    } catch (err) {
      setBillingNotice({ type: 'error', msg: err instanceof Error ? err.message : t.billingError });
      setBillingLoading(null);
    }
  }

  async function handleManageSubscription() {
    setBillingLoading('portal');
    setBillingNotice(null);
    try {
      const res  = await fetch('/api/billing/portal', { method: 'POST', credentials: 'include' });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? t.billingError);
      window.location.href = data.url!;
    } catch (err) {
      setBillingNotice({ type: 'error', msg: err instanceof Error ? err.message : t.billingError });
      setBillingLoading(null);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingProfile(true);
    setProfileError(null);

    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error');
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    setSavingOrg(true);
    setOrgError(null);

    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_name: orgName.trim() }),
      });

      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error');

      await refresh();
      setOrgSaved(true);
      setTimeout(() => setOrgSaved(false), 3000);
    } catch (err) {
      setOrgError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSavingOrg(false);
    }
  }

  return (
    <div style={{ padding: '40px 48px', maxWidth: 720 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700 }}>{t.title}</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{t.subtitle}</p>
      </div>

      {/* Profile */}
      <Section title={t.sectionProfile}>
        <form onSubmit={handleSaveProfile}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>{t.nameLabel}</label>
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.nameLabel} />
            </div>
            <div>
              <label style={labelStyle}>{t.emailLabel}</label>
              <input style={{ ...inputStyle, opacity: 0.6 }} value={user?.email ?? ''} disabled />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit" disabled={savingProfile}
              style={{
                background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
                padding: '9px 20px', fontWeight: 600, fontSize: 13,
                cursor: savingProfile ? 'not-allowed' : 'pointer', opacity: savingProfile ? 0.7 : 1,
              }}
            >
              {savingProfile ? t.saving : t.save}
            </button>
            {profileSaved && <span style={{ color: 'var(--accent)', fontSize: 13 }}>{t.saved}</span>}
            {profileError && <span style={{ color: '#ff6b6b', fontSize: 13 }}>{profileError}</span>}
          </div>
        </form>
      </Section>

      {/* Organization */}
      <Section title={t.sectionOrg}>
        <form onSubmit={handleSaveOrg}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>{t.nameLabel}</label>
            <input
              style={inputStyle}
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder={lang === 'en' ? 'Organization name' : 'Nombre de la organización'}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit"
              disabled={savingOrg}
              style={{
                background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
                padding: '9px 20px', fontWeight: 600, fontSize: 13,
                cursor: savingOrg ? 'not-allowed' : 'pointer', opacity: savingOrg ? 0.7 : 1,
              }}
            >
              {savingOrg ? t.saving : t.save}
            </button>
            {orgSaved && <span style={{ color: 'var(--accent)', fontSize: 13 }}>{t.saved}</span>}
            {orgError && <span style={{ color: '#ff6b6b', fontSize: 13 }}>{orgError}</span>}
          </div>
        </form>
      </Section>

      {/* Plan & billing */}
      <Section title={t.sectionBilling}>
        {billingNotice && (
          <div style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            background: billingNotice.type === 'success' ? 'rgba(76,175,80,0.12)'
                      : billingNotice.type === 'error'   ? 'rgba(255,107,107,0.12)'
                      : 'rgba(198,255,75,0.08)',
            color: billingNotice.type === 'success' ? '#4caf50'
                 : billingNotice.type === 'error'   ? '#ff6b6b'
                 : 'var(--accent)',
            border: `1px solid ${billingNotice.type === 'success' ? 'rgba(76,175,80,0.3)'
                               : billingNotice.type === 'error'   ? 'rgba(255,107,107,0.3)'
                               : 'rgba(198,255,75,0.2)'}`,
          }}>
            {billingNotice.msg}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {([
            { key: 'starter',  name: t.planStarterName,  price: t.planStarterPrice,  features: t.planStarterFeatures, popular: false },
            { key: 'pro',      name: t.planProName,       price: t.planProPrice,      features: t.planProFeatures,     popular: true  },
            { key: 'business', name: t.planBusinessName,  price: t.planBusinessPrice, features: t.planBusinessFeatures, popular: false },
          ] as const).map((p) => {
            const isCurrent = (plan ?? org?.plan ?? 'starter') === p.key;
            const isLoading = billingLoading === p.key;
            const anyLoading = billingLoading !== null;
            return (
              <div key={p.key} style={{
                background: isCurrent ? 'rgba(198,255,75,0.06)' : 'var(--bg)',
                border: `1px solid ${isCurrent ? 'rgba(198,255,75,0.35)' : 'var(--border)'}`,
                borderRadius: 10,
                padding: '16px',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}>
                {p.popular && !isCurrent && (
                  <span style={{
                    position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--accent)', color: '#000',
                    fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                    letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>
                    {lang === 'en' ? 'Most popular' : 'Más popular'}
                  </span>
                )}
                {isCurrent && (
                  <span style={{
                    position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--accent)', color: '#000',
                    fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                    letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>
                    {t.currentPlanBadge}
                  </span>
                )}

                <div>
                  <p style={{ fontFamily: 'var(--font-syne)', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                    {p.name}
                  </p>
                  <p style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
                    {p.price}
                    <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', marginLeft: 3 }}>
                      {t.planPer}
                    </span>
                  </p>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                  {p.features.map((f, i) => (
                    <li key={i} style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <span style={{ color: 'var(--accent)', flexShrink: 0 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <button
                    onClick={handleManageSubscription}
                    disabled={anyLoading}
                    style={{
                      width: '100%', background: 'none',
                      border: '1px solid var(--border)', borderRadius: 7,
                      padding: '8px', fontSize: 12, fontWeight: 600,
                      cursor: anyLoading ? 'not-allowed' : 'pointer',
                      color: 'var(--text)', opacity: anyLoading ? 0.6 : 1,
                    }}
                  >
                    {billingLoading === 'portal' ? t.billingRedirecting : t.manage}
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpgrade(p.key)}
                    disabled={anyLoading}
                    style={{
                      width: '100%',
                      background: p.popular ? 'var(--accent)' : 'var(--surface)',
                      border: `1px solid ${p.popular ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 7,
                      padding: '8px', fontSize: 12, fontWeight: 700,
                      cursor: anyLoading ? 'not-allowed' : 'pointer',
                      color: p.popular ? '#000' : 'var(--text)',
                      opacity: anyLoading ? 0.6 : 1,
                    }}
                  >
                    {isLoading ? t.billingRedirecting : `${t.upgrade} ${p.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Social accounts */}
      <Section title={t.sectionSocial}>
        <SocialConnectionPanel
          locale={(lang === 'en' ? 'en' : 'es')}
          mode="settings"
        />
      </Section>

      {/* ── Lead Scoring ── */}
      <Section title={lang === 'en' ? 'Lead Scoring' : 'Scoring de Leads'}>
        {scoringLoading ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>⏳</p>
        ) : (
          <form onSubmit={handleSaveScoring} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Points per interaction */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {lang === 'en' ? 'Points per interaction type' : 'Puntos por tipo de interacción'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {Object.entries(scoringDefaults).map(([key, val]) => (
                  <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize' }}>{key}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="range" min={0} max={50} value={val}
                        onChange={e => setScoringDefaults(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                        style={{ flex: 1, accentColor: 'var(--accent)' }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 700, minWidth: 28, textAlign: 'right' }}>{val}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Stage thresholds */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {lang === 'en' ? 'Stage thresholds (min. score)' : 'Umbrales por etapa (score mínimo)'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {Object.entries(scoringThresholds).map(([key, val]) => (
                  <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize' }}>{key}</span>
                    <input
                      type="number" min={0} max={1000} value={val}
                      onChange={e => setScoringThresholds(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                      style={{
                        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                        padding: '7px 10px', color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                type="submit" disabled={scoringSaving}
                style={{
                  background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
                  padding: '9px 22px', fontWeight: 700, fontSize: 13,
                  cursor: scoringSaving ? 'wait' : 'pointer',
                }}
              >
                {scoringSaving ? (lang === 'en' ? 'Saving...' : 'Guardando...') : (lang === 'en' ? 'Save scoring' : 'Guardar scoring')}
              </button>
              {scoringSaved  && <span style={{ fontSize: 13, color: 'var(--accent)' }}>✓ {lang === 'en' ? 'Saved' : 'Guardado'}</span>}
              {scoringError  && <span style={{ fontSize: 13, color: '#ff4b4b' }}>{scoringError}</span>}
            </div>
          </form>
        )}
      </Section>
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
