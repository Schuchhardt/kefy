'use client';

import { useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

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

const METRIC_CARDS = [
  { key: 'impressions', label: 'Impresiones', icon: '◎' },
  { key: 'reach',       label: 'Alcance',     icon: '◉' },
  { key: 'likes',       label: 'Me gusta',    icon: '♡' },
  { key: 'comments',    label: 'Comentarios', icon: '◫' },
  { key: 'shares',      label: 'Compartidos', icon: '↗' },
  { key: 'clicks',      label: 'Clics',       icon: '⊕' },
] as const;

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [data, setData]       = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [range, setRange]     = useState<'7' | '30' | '90'>('30');

  useEffect(() => {
    setLoading(true);
    const to   = new Date();
    const from = new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000);

    fetch(
      `/api/analytics?from=${from.toISOString()}&to=${to.toISOString()}`,
      { credentials: 'include' },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error('Error al cargar analytics');
        return res.json() as Promise<AnalyticsResponse>;
      })
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [range]);

  return (
    <div style={{ padding: '40px 48px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700 }}>Analytics</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
            Rendimiento de tus publicaciones en redes sociales
          </p>
        </div>
        {/* Range selector */}
        <div style={{ display: 'flex', gap: 6 }}>
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
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Cargando datos...</p>
      )}
      {error && (
        <p style={{ color: '#ff6b6b', fontSize: 14 }}>{error}</p>
      )}

      {data && !loading && (
        <>
          {/* Totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 32 }}>
            {METRIC_CARDS.map(({ key, label, icon }) => (
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
            ))}

            {/* Posts published */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(198,255,75,0.08) 0%, rgba(255,140,66,0.06) 100%)',
              border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 16, opacity: 0.6 }}>✦</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Publicaciones
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
                Por plataforma
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
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Publicaciones</p>
                        <p style={{ fontSize: 15, fontWeight: 600 }}>{stats.posts}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Impresiones</p>
                        <p style={{ fontSize: 15, fontWeight: 600 }}>{fmt(stats.impressions)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Engagement</p>
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
                Top publicaciones
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
                      {post.body_preview || '(sin texto)'}
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
              <p style={{ color: 'var(--muted)', fontSize: 15 }}>Sin datos para este período</p>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                Publica contenido y vuelve aquí para ver tus métricas
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
