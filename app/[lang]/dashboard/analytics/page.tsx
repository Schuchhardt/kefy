'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import esT from '@/locales/es/dashboard/analytics';
import enT from '@/locales/en/dashboard/analytics';

const T = { es: esT, en: enT } as const;
type Locale = keyof typeof T;

// ─── Types ────────────────────────────────────────────────────────────────────

interface FollowerSnapshot {
  measured_at:     string;
  followers_count: number;
}

interface FollowerAccount {
  account: { id: string; platform: string; username: string; avatar_url: string | null };
  snapshots:        FollowerSnapshot[];
  latest_followers: number;
  latest_following: number;
}

interface FollowersResponse {
  accounts: FollowerAccount[];
  from:     string;
  to:       string;
}

interface Totals {
  impressions: number;
  reach:       number;
  likes:       number;
  comments:    number;
  shares:      number;
  clicks:      number;
  saves:       number;
  posts:       number;
}

interface PlatformStat {
  posts:           number;
  impressions:     number;
  engagement_rate: number;
}

interface TopPost {
  scheduled_post_id: string;
  platform:          string;
  body_preview:      string;
  impressions:       number;
  engagement_rate:   number;
  likes:             number;
  comments:          number;
  shares:            number;
}

interface AnalyticsResponse {
  totals:     Totals;
  byPlatform: Record<string, PlatformStat>;
  top5:       TopPost[];
  from:       string;
  to:         string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, string> = {
  linkedin:  'in',
  instagram: '◉',
  facebook:  'f',
  twitter:   '𝕏',
  tiktok:    '♪',
  threads:   '@',
  unknown:   '?',
};

const METRIC_CARD_KEYS = [
  { key: 'impressions', icon: '◎' },
  { key: 'reach',       icon: '◉' },
  { key: 'likes',       icon: '♡' },
  { key: 'comments',    icon: '◫' },
  { key: 'shares',      icon: '↗' },
  { key: 'clicks',      icon: '⊕' },
] as const;

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { lang } = useParams<{ lang: string }>();
  const t = T[(lang as Locale) ?? 'es'] ?? T.es;

  const [data, setData]             = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [range, setRange]           = useState<'7' | '30' | '90'>('30');
  const [followers, setFollowers]   = useState<FollowerAccount[]>([]);
  const [syncing, setSyncing]             = useState(false);
  const [syncingMetrics, setSyncingMetrics] = useState(false);
  const [accountsReady, setAccountsReady] = useState(false);
  const [hasAccounts, setHasAccounts]     = useState(false);

  // Check connected accounts first
  useEffect(() => {
    fetch('/api/social/accounts', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json() as { accounts: { id: string }[] };
        setHasAccounts((json.accounts ?? []).length > 0);
      })
      .catch(() => {})
      .finally(() => setAccountsReady(true));
  }, []);

  useEffect(() => {
    if (!accountsReady) return;
    if (!hasAccounts) { setLoading(false); return; }
    setLoading(true);
    const to   = new Date();
    const from = new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000);

    fetch(
      `/api/analytics?from=${from.toISOString()}&to=${to.toISOString()}`,
      { credentials: 'include' },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error('Error al cargar analytics');
        const raw = await res.json() as {
          totals: AnalyticsResponse['totals'];
          by_platform: AnalyticsResponse['byPlatform'];
          top_posts: AnalyticsResponse['top5'];
          from: string;
          to: string;
          period?: { from: string; to: string };
        };
        return {
          totals:     raw.totals,
          byPlatform: raw.by_platform ?? {},
          top5:       raw.top_posts   ?? [],
          from:       raw.period?.from ?? raw.from,
          to:         raw.period?.to   ?? raw.to,
        } satisfies AnalyticsResponse;
      })
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [range, accountsReady, hasAccounts]);

  // Fetch follower data (latest snapshot per account)
  useEffect(() => {
    const to   = new Date();
    const from = new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000);
    fetch(
      `/api/analytics/followers?from=${from.toISOString()}&to=${to.toISOString()}`,
      { credentials: 'include' },
    )
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json() as FollowersResponse;
        setFollowers(json.accounts ?? []);
      })
      .catch(() => { /* non-critical, ignore */ });
  }, [range]);

  function handleSyncMetrics() {
    setSyncingMetrics(true);
    fetch('/api/analytics/sync', {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return;
        // Re-fetch analytics after sync
        const to   = new Date();
        const from = new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000);
        return fetch(
          `/api/analytics?from=${from.toISOString()}&to=${to.toISOString()}`,
          { credentials: 'include' },
        ).then(async (r) => {
          if (!r.ok) return;
          const raw = await r.json() as {
            totals: AnalyticsResponse['totals'];
            by_platform: AnalyticsResponse['byPlatform'];
            top_posts: AnalyticsResponse['top5'];
            period?: { from: string; to: string };
            from: string; to: string;
          };
          setData({
            totals:     raw.totals,
            byPlatform: raw.by_platform ?? {},
            top5:       raw.top_posts   ?? [],
            from:       raw.period?.from ?? raw.from,
            to:         raw.period?.to   ?? raw.to,
          });
        });
      })
      .catch(() => { /* ignore */ })
      .finally(() => setSyncingMetrics(false));
  }

  function handleSyncFollowers() {
    setSyncing(true);
    fetch('/api/analytics/sync/followers', {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return;
        // Re-fetch after sync
        const to   = new Date();
        const from = new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000);
        return fetch(
          `/api/analytics/followers?from=${from.toISOString()}&to=${to.toISOString()}`,
          { credentials: 'include' },
        ).then(async (r) => {
          if (!r.ok) return;
          const json = await r.json() as FollowersResponse;
          setFollowers(json.accounts ?? []);
        });
      })
      .catch(() => { /* ignore */ })
      .finally(() => setSyncing(false));
  }

  return (
    <div style={{ padding: '40px 48px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700 }}>Analytics</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
            {t.subtitle}
          </p>
        </div>
        {/* Range selector + sync metrics */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {hasAccounts && (
            <button
              onClick={handleSyncMetrics}
              disabled={syncingMetrics}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 13,
                cursor: syncingMetrics ? 'default' : 'pointer',
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: syncingMetrics ? 'var(--muted)' : 'var(--text)',
                opacity: syncingMetrics ? 0.6 : 1, marginRight: 6,
              }}
            >
              {syncingMetrics ? t.syncingMetrics : t.syncMetrics}
            </button>
          )}
          {(['7', '30', '90'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                border: `1px solid ${range === r ? 'var(--accent)' : 'var(--border)'}`,
                background: range === r ? 'rgba(198,255,75,0.1)' : 'var(--surface)',
                color: range === r ? 'var(--accent)' : 'var(--text)',
                fontWeight: range === r ? 600 : 400,
              }}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t.loading}</p>
      )}
      {error && (
        <p style={{ color: '#ff6b6b', fontSize: 14 }}>{error}</p>
      )}

      {/* No connected accounts */}
      {accountsReady && !hasAccounts && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '48px 32px', textAlign: 'center', maxWidth: 480,
        }}>
          <p style={{ fontSize: 32, marginBottom: 16 }}>📊</p>
          <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            {t.noAccountsTitle}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
            {t.noAccountsDesc}
          </p>
          <a
            href="../social"
            style={{
              display: 'inline-block', padding: '10px 24px', borderRadius: 10,
              background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 14,
              textDecoration: 'none',
            }}
          >
            {t.noAccountsCta}
          </a>
        </div>
      )}

      {accountsReady && hasAccounts && data && !loading && (
        <>
          {/* Totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 32 }}>
            {METRIC_CARD_KEYS.map(({ key, icon }) => {
              const label = t.metricLabels[key] ?? key;
              return (
              <div key={key} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '18px 20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 16, opacity: 0.6 }}>{icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {label}
                  </span>
                </div>
                <p style={{ fontFamily: 'var(--font-syne)', fontSize: 28, fontWeight: 700 }}>
                  {fmt(data.totals[key])}
                </p>
              </div>
            );
            })}

            {/* Posts published */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(198,255,75,0.08) 0%, rgba(255,140,66,0.06) 100%)',
              border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 16, opacity: 0.6 }}>✦</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t.posts}
                </span>
              </div>
              <p style={{ fontFamily: 'var(--font-syne)', fontSize: 28, fontWeight: 700 }}>
                {data.totals.posts}
              </p>
            </div>
          </div>

          {/* Per-platform */}
          {Object.keys(data.byPlatform).length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
                {t.byPlatform}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(data.byPlatform).map(([platform, stats]) => (
                  <div key={platform} style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '14px 18px',
                    display: 'flex', alignItems: 'center', gap: 16,
                  }}>
                    <span style={{ fontSize: 18, width: 28, textAlign: 'center' }}>
                      {PLATFORM_ICONS[platform] ?? '◉'}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 14, textTransform: 'capitalize', width: 100 }}>
                      {platform}
                    </span>
                    <div style={{ flex: 1, display: 'flex', gap: 24 }}>
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{t.postsLabel}</p>
                        <p style={{ fontSize: 15, fontWeight: 600 }}>{stats.posts}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{t.impressions}</p>
                        <p style={{ fontSize: 15, fontWeight: 600 }}>{fmt(stats.impressions)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{t.engagement}</p>
                        <p style={{ fontSize: 15, fontWeight: 600 }}>{(stats.engagement_rate * 100).toFixed(2)}%</p>
                      </div>
                    </div>
                    {/* Bar */}
                    <div style={{ width: 120, background: 'var(--border)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 4, background: 'var(--accent)',
                        width: `${Math.min(100, stats.engagement_rate * 1000)}%`,
                        transition: 'width 0.4s',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top posts */}
          {data.top5.length > 0 && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
                {t.topPosts}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.top5.map((post, i) => (
                  <div key={post.scheduled_post_id} style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '14px 18px',
                    display: 'flex', alignItems: 'flex-start', gap: 14,
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-syne)', fontSize: 18, fontWeight: 800,
                      color: i === 0 ? 'var(--accent)' : 'var(--muted)', width: 28, flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>
                      {PLATFORM_ICONS[post.platform] ?? '◉'}
                    </span>
                    <p style={{ flex: 1, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                      {post.body_preview || t.noText}
                    </p>
                    <div style={{ flexShrink: 0, display: 'flex', gap: 16 }}>
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: 11, color: 'var(--muted)' }}>Imp.</p>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{fmt(post.impressions)}</p>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: 11, color: 'var(--muted)' }}>Eng.</p>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{(post.engagement_rate * 100).toFixed(2)}%</p>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: 11, color: 'var(--muted)' }}>♡</p>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{fmt(post.likes)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.totals.posts === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <p style={{ color: 'var(--muted)', fontSize: 15 }}>{t.noData}</p>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                {t.noDataHint}
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Followers section (always visible) ─────────────────────────── */}
      <div style={{ marginTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 16, fontWeight: 700 }}>
            {t.followers}
          </h2>
          <button
            onClick={handleSyncFollowers}
            disabled={syncing}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: syncing ? 'default' : 'pointer',
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: syncing ? 'var(--muted)' : 'var(--text)', opacity: syncing ? 0.6 : 1,
            }}
          >
            {syncing ? t.syncing : t.sync}
          </button>
        </div>

        {followers.length === 0 ? (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '32px 24px', textAlign: 'center',
          }}>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>
              {t.noFollowers}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {followers.map((fa) => {
              const first = fa.snapshots[0]?.followers_count ?? 0;
              const last  = fa.latest_followers;
              const delta = last - first;
              const pct   = first > 0 ? ((delta / first) * 100).toFixed(1) : null;

              return (
                <div key={fa.account.id} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '18px 20px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 18 }}>{PLATFORM_ICONS[fa.account.platform] ?? '◉'}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>
                      {fa.account.platform}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>@{fa.account.username}</p>
                  <p style={{ fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
                    {fmt(last)}
                  </p>
                  {delta !== 0 && (
                    <p style={{ fontSize: 12, color: delta > 0 ? 'var(--accent)' : '#ff6b6b' }}>
                      {delta > 0 ? '▲' : '▼'} {fmt(Math.abs(delta))}
                      {pct !== null && ` (${pct}%)`}
                      <span style={{ color: 'var(--muted)', marginLeft: 4 }}>{t.vsStart}</span>
                    </p>
                  )}
                  {fa.snapshots.length > 1 && (
                    <div style={{ marginTop: 10, height: 32, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                      {fa.snapshots.slice(-14).map((s, i) => {
                        const max = Math.max(...fa.snapshots.map((x) => x.followers_count), 1);
                        const h = Math.round((s.followers_count / max) * 32);
                        return (
                          <div
                            key={i}
                            style={{
                              flex: 1, height: h, borderRadius: 2,
                              background: i === fa.snapshots.slice(-14).length - 1
                                ? 'var(--accent)' : 'var(--border)',
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
