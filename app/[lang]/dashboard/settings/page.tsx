'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useParams, useSearchParams } from 'next/navigation';

import esT from '@/locales/es/dashboard/settings';
import enT from '@/locales/en/dashboard/settings';

const T = { es: esT, en: enT } as const;
type Locale = keyof typeof T;

// ─── Types ────────────────────────────────────────────────────────────────────

interface SocialAccount {
  id:              string;
  platform:        string;
  username:        string;
  avatar_url:      string | null;
  status:          string;
  token_expires_at: string | null;
  created_at:      string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORMS = ['linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads'] as const;
type Platform = typeof PLATFORMS[number];

const PLATFORM_ICONS: Record<Platform, string> = {
  linkedin:  'in',
  instagram: '◉',
  facebook:  'f',
  twitter:   '𝕏',
  tiktok:    '♪',
  threads:   '@',
};

const PLATFORM_LABELS: Record<Platform, string> = {
  linkedin:  'LinkedIn',
  instagram: 'Instagram',
  facebook:  'Facebook',
  twitter:   'X / Twitter',
  tiktok:    'TikTok',
  threads:   'Threads',
};

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
  const { user, org } = useAuth();
  const { lang } = useParams<{ lang: string }>();
  const t = T[(lang as Locale) ?? 'es'] ?? T.es;
  const dateLocale = lang === 'en' ? 'en-US' : 'es-ES';
  const searchParams = useSearchParams();

  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loadingAccts, setLoadingAccts] = useState(true);

  // Connecting OAuth
  const [connecting, setConnecting] = useState<Platform | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    const res = await fetch('/api/social/accounts', { credentials: 'include' });
    const { accounts: data } = await res.json() as { accounts: SocialAccount[] };
    setAccounts(data ?? []);
    setLoadingAccts(false);
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  // Handle redirect back from OAuth callback
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error     = searchParams.get('error');
    if (connected) {
      setConnectSuccess(connected);
      fetchAccounts();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (error) {
      setConnectError(error === 'oauth_failed' ? t.oauthError : t.unknownError);
      window.history.replaceState({}, '', window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Profile form
  const [name, setName]   = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved]   = useState(false);
  const [profileError, setProfileError]   = useState<string | null>(null);

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

  async function handleConnectPlatform(platform: Platform) {
    setConnecting(platform);
    setConnectError(null);

    try {
      const state = crypto.randomUUID();
      sessionStorage.setItem('oauth_state', state);

      const res = await fetch(
        `/api/social/oauth/url?platform=${platform}&state=${state}`,
        { credentials: 'include' },
      );
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? t.oauthError);
      window.location.href = data.url!;
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : t.unknownError);
      setConnecting(null);
    }
  }

  async function handleDisconnect(accountId: string) {
    if (!confirm(t.confirmDisconnect)) return;
    await fetch(`/api/social/accounts/${accountId}`, { method: 'DELETE', credentials: 'include' });
    setAccounts((prev) => prev.filter((a) => a.id !== accountId));
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
                background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>{t.nameLabel}</label>
            <input style={{ ...inputStyle, opacity: 0.6 }} value={org?.name ?? ''} disabled />
          </div>
          <div>
            <label style={labelStyle}>{t.planLabel}</label>
            <input style={{ ...inputStyle, opacity: 0.6 }} value={org?.plan ?? ''} disabled />
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
          {t.planChangeNote}{' '}
          <a href="mailto:hola@kefy.app" style={{ color: 'var(--accent)' }}>hola@kefy.app</a>
        </p>
      </Section>

      {/* Social accounts */}
      <Section title={t.sectionSocial}>
        {connectError && (
          <p style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 12 }}>{connectError}</p>
        )}
        {connectSuccess && (
          <p style={{ color: '#4caf50', fontSize: 13, marginBottom: 12 }}>
            ✓ {connectSuccess.charAt(0).toUpperCase() + connectSuccess.slice(1)} conectado correctamente
          </p>
        )}

        {/* Connected accounts */}
        {!loadingAccts && accounts.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t.connected}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {accounts.map((acc) => (
                <div key={acc.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '10px 14px',
                }}>
                  <span style={{ fontSize: 18, width: 28, textAlign: 'center' }}>
                    {PLATFORM_ICONS[acc.platform as Platform] ?? '◉'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: 14 }}>{acc.username}</p>
                    <p style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize' }}>
                      {acc.platform} · {acc.status}
                      {acc.token_expires_at && (
                        <> · {t.expires} {new Date(acc.token_expires_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' })}</>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDisconnect(acc.id)}
                    style={{
                      background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                      padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: '#ff6b6b',
                    }}
                  >
                    {t.disconnect}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connect new */}
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t.connectNew}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {PLATFORMS.map((platform) => {
            const already = accounts.some((a) => a.platform === platform);
            return (
              <button
                key={platform}
                onClick={() => handleConnectPlatform(platform)}
                disabled={connecting !== null}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: already ? 'rgba(198,255,75,0.04)' : 'var(--bg)',
                  border: `1px solid ${already ? 'rgba(198,255,75,0.3)' : 'var(--border)'}`,
                  borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
                  opacity: connecting !== null ? 0.6 : 1,
                  transition: 'border-color 0.15s',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>{PLATFORM_ICONS[platform]}</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {connecting === platform ? t.redirecting : PLATFORM_LABELS[platform]}
                </span>
                {already && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)' }}>✓</span>}
              </button>
            );
          })}
        </div>
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
