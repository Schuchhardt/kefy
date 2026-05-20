'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

import esT from '@/locales/es/dashboard/ads';
import enT from '@/locales/en/dashboard/ads';

const T = { es: esT, en: enT } as const;
type Locale = keyof typeof T;

// ─── Types ────────────────────────────────────────────────────────────────────

type BoostObjective = 'reach' | 'engagement' | 'traffic' | 'leads';
type BoostStatus    = 'pending' | 'active' | 'completed' | 'cancelled' | 'failed';

interface PublishedPost {
  id:                  string;
  platform_post_id:    string | null;
  status:              string;
  scheduled_at:        string | null;
  published_at:        string | null;
  kefy_content_items:  { id: string; title?: string; body?: string; image_url?: string | null } | null;
  kefy_social_accounts: { id: string; platform: string; username: string } | null;
}

interface AdBoost {
  id:               string;
  budget_cents:     number;
  currency:         string;
  duration_days:    number;
  objective:        BoostObjective;
  status:           BoostStatus;
  zernio_boost_id:  string | null;
  platform_ad_id:   string | null;
  started_at:       string | null;
  ended_at:         string | null;
  created_at:       string;
  kefy_scheduled_posts: {
    id: string;
    platform_post_id: string | null;
    kefy_content_items?: { id: string; title?: string; body?: string } | null;
    kefy_social_accounts?: { id: string; platform: string; username: string } | null;
  } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, string> = {
  linkedin: 'in', instagram: '◉', facebook: 'f',
  twitter: '𝕏', tiktok: '♪', threads: '@',
};

// OBJECTIVE_LABELS and STATUS_LABELS are now locale-aware via T[locale]
// Keep type-only constants for static typing
const OBJECTIVE_LABEL_KEYS = ['reach', 'engagement', 'traffic', 'leads'] as const;
void OBJECTIVE_LABEL_KEYS; // suppress unused warning

function fmt(cents: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 })
    .format(cents / 100);
}

// ─── Boost Modal ──────────────────────────────────────────────────────────────

interface BoostModalProps {
  post:     PublishedPost;
  t:        typeof T.es;
  locale:   string;
  onClose:  () => void;
  onBoost:  (data: {
    budget_cents: number; currency: string;
    duration_days: number; objective: BoostObjective;
  }) => Promise<{ error?: string } | void>;
}

function BoostModal({ post, t, locale, onClose, onBoost }: BoostModalProps) {
  const [budgetStr, setBudgetStr]   = useState('50');
  const [currency, setCurrency]     = useState('USD');
  const [duration, setDuration]     = useState(7);
  const [objective, setObjective]   = useState<BoostObjective>('reach');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function handle() {
    const budget = parseFloat(budgetStr);
    if (!Number.isFinite(budget) || budget <= 0) {
      setError(t.invalidBudget);
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await onBoost({
      budget_cents:  Math.round(budget * 100),
      currency,
      duration_days: duration,
      objective,
    });
    if (result && 'error' in result) {
      setError(result.error ?? t.errorBoost);
    } else {
      onClose();
    }
    setSubmitting(false);
  }

  const platform = post.kefy_social_accounts?.platform ?? '';
  const username = post.kefy_social_accounts?.username ?? '';
  const title    = post.kefy_content_items?.title
    ?? post.kefy_content_items?.body?.slice(0, 60)
    ?? t.modalNoTitle;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: 420, background: 'var(--bg)',
        border: '1px solid var(--border)', borderRadius: 16, padding: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 18, fontWeight: 700 }}>
            {t.modalTitle}
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}
          >
            ✕
          </button>
        </div>

        {/* Post preview */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14 }}>{PLATFORM_ICONS[platform] ?? '◉'}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>@{username}</span>
          </div>
          <p style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </p>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Budget */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              {t.budgetLabel}
              <input
                type="number"
                min="1"
                step="0.01"
                value={budgetStr}
                onChange={(e) => setBudgetStr(e.target.value)}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text)', fontSize: 14, outline: 'none',
                }}
              />
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{
                  padding: '8px 10px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text)', fontSize: 14, cursor: 'pointer', outline: 'none',
                }}
              >
                {['USD','EUR','GBP','MXN','ARS','COP'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Duration */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              {t.durationLabel(duration)} {duration === 1 ? t.day : t.days}
            </label>
            <input
              type="range"
              min={1}
              max={30}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              <span>1d</span><span>15d</span><span>30d</span>
            </div>
          </div>

          {/* Objective */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              {t.objectiveLabel}
              {(Object.entries(t.objectiveLabels) as [BoostObjective, string][]).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setObjective(value)}
                  style={{
                    padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                    border: `1px solid ${objective === value ? 'var(--accent)' : 'var(--border)'}`,
                    background: objective === value ? 'rgba(198,255,75,0.1)' : 'var(--surface)',
                    color: objective === value ? 'var(--accent)' : 'var(--text)',
                    fontWeight: objective === value ? 600 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </label>
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text)', cursor: 'pointer', fontSize: 14,
            }}
          >
            {t.cancelBtn}
          </button>
          <button
            onClick={handle}
            disabled={submitting}
            style={{
              flex: 1, padding: '10px', borderRadius: 10,
              border: 'none', background: 'var(--accent)', color: '#000',
              cursor: submitting ? 'default' : 'pointer', fontWeight: 700, fontSize: 14,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? t.creating : t.boostPay(fmt(Math.round(parseFloat(budgetStr || '0') * 100), currency, locale))}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdsPage() {
  const { lang } = useParams<{ lang: string }>();
  const t = T[(lang as Locale) ?? 'es'] ?? T.es;
  const dateLocale = lang === 'en' ? 'en-US' : 'es-ES';
  const OBJECTIVE_LABELS = t.objectiveLabels as Record<BoostObjective, string>;
  const STATUS_LABELS    = t.statusLabels    as Record<BoostStatus, { label: string; color: string }>;
  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const d = Math.floor(diff / 86_400_000);
    if (d < 1) return t.timeToday;
    if (d === 1) return t.timeYesterday;
    return t.timeAgo(d);
  }
  void dateLocale; void OBJECTIVE_LABELS;
  const [boosts, setBoosts]           = useState<AdBoost[]>([]);
  const [posts, setPosts]             = useState<PublishedPost[]>([]);
  const [loadingBoosts, setLoadingBoosts] = useState(true);
  const [loadingPosts, setLoadingPosts]   = useState(true);
  const [statusFilter, setStatusFilter]  = useState<BoostStatus | 'all'>('all');
  const [boostingPost, setBoostingPost]  = useState<PublishedPost | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
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

  const fetchBoosts = useCallback(() => {
    setLoadingBoosts(true);
    const qs = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
    fetch(`/api/ads/boost${qs}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json() as { boosts: AdBoost[] };
        setBoosts(json.boosts ?? []);
      })
      .catch(() => { /* ignore */ })
      .finally(() => setLoadingBoosts(false));
  }, [statusFilter]);

  useEffect(() => {
    fetchBoosts();
  }, [fetchBoosts]);

  // Fetch published posts (for the "new boost" flow) — correct route is /api/content
  useEffect(() => {
    fetch('/api/content?status=published&limit=50', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json() as { posts?: PublishedPost[]; items?: PublishedPost[] };
        setPosts(json.posts ?? json.items ?? []);
      })
      .catch(() => { /* ignore */ })
      .finally(() => setLoadingPosts(false));
  }, []);

  async function handleBoost(post: PublishedPost, data: {
    budget_cents: number; currency: string;
    duration_days: number; objective: BoostObjective;
  }): Promise<{ error?: string } | void> {
    const res = await fetch('/api/ads/boost', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_post_id: post.id, ...data }),
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      return { error: err.error ?? t.errorBoost };
    }
    const json = await res.json() as { boost: AdBoost };
    setBoosts((prev) => [json.boost, ...prev]);
  }

  async function handleCancel(boostId: string) {
    setCancellingId(boostId);
    await fetch(`/api/ads/boost/${boostId}`, {
      method: 'DELETE', credentials: 'include',
    });
    setBoosts((prev) => prev.map((b) =>
      b.id === boostId ? { ...b, status: 'cancelled', ended_at: new Date().toISOString() } : b,
    ));
    setCancellingId(null);
  }

  return (
    <div style={{ padding: '40px 48px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700 }}>Ads</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
            {t.subtitle}
          </p>
        </div>
      </div>

      {/* No connected accounts */}
      {accountsReady && !hasAccounts && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '48px 32px', textAlign: 'center', maxWidth: 480,
        }}>
          <p style={{ fontSize: 32, marginBottom: 16 }}>⚡</p>
          <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            {t.noAccountsTitle}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
            {t.noAccountsBody}
          </p>
          <a
            href="../social"
            style={{
              display: 'inline-block', padding: '10px 24px', borderRadius: 10,
              background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 14,
              textDecoration: 'none',
            }}
          >
            {t.connectBtn}
          </a>
        </div>
      )}

      {accountsReady && hasAccounts && (
      <>
      {/* ── Published posts — choose one to boost ───────────────────────── */}
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          {t.postsTitle}
        </h2>

        {loadingPosts && <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t.loadingPosts}</p>}
        {!loadingPosts && posts.length === 0 && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '32px 24px', textAlign: 'center',
          }}>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t.noPosts}</p>
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
              {t.noPostsHint}
            </p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {posts.map((post) => {
            const platform = post.kefy_social_accounts?.platform ?? '';
            const username = post.kefy_social_accounts?.username ?? '';
            const title    = post.kefy_content_items?.title
              ?? post.kefy_content_items?.body?.slice(0, 60)
              ?? t.noTitle;

            return (
              <div key={post.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '16px 18px',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                {post.kefy_content_items?.image_url && (
                  <div style={{
                    height: 100, borderRadius: 8, overflow: 'hidden',
                    backgroundImage: `url(${post.kefy_content_items.image_url})`,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                  }} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>{PLATFORM_ICONS[platform] ?? '◉'}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>@{username}</span>
                  {post.published_at && (
                    <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
                      {timeAgo(post.published_at)}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.4, flex: 1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {title}
                </p>
                <button
                  onClick={() => setBoostingPost(post)}
                  style={{
                    width: '100%', padding: '8px', borderRadius: 8,
                    border: '1px solid var(--accent)', background: 'rgba(198,255,75,0.1)',
                    color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}
                >
                  {t.boostBtn}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Active & past boosts ─────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 16, fontWeight: 700 }}>
            {t.boostsTitle}
          </h2>
          {/* Status filter */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'active', 'pending', 'completed', 'cancelled', 'failed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${statusFilter === s ? 'var(--accent)' : 'var(--border)'}`,
                  background: statusFilter === s ? 'rgba(198,255,75,0.1)' : 'var(--surface)',
                  color: statusFilter === s ? 'var(--accent)' : 'var(--muted)',
                }}
              >
                {s === 'all' ? t.all : STATUS_LABELS[s as BoostStatus]?.label ?? s}
              </button>
            ))}
          </div>
        </div>

        {loadingBoosts && <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t.loadingBoosts}</p>}
        {!loadingBoosts && boosts.length === 0 && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '32px 24px', textAlign: 'center',
          }}>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t.noBoosts}</p>
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
              {t.noBoostsHint}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {boosts.map((boost) => {
            const st       = STATUS_LABELS[boost.status];
            const platform = boost.kefy_scheduled_posts?.kefy_social_accounts?.platform ?? '';
            const username = boost.kefy_scheduled_posts?.kefy_social_accounts?.username ?? '';
            const title    = boost.kefy_scheduled_posts?.kefy_content_items?.title
              ?? boost.kefy_scheduled_posts?.kefy_content_items?.body?.slice(0, 60)
              ?? t.defaultPost;
            const canCancel = ['pending', 'active'].includes(boost.status);

            return (
              <div key={boost.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>{PLATFORM_ICONS[platform] ?? '◉'}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>@{username}</span>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.05)',
                      color: st.color, border: `1px solid ${st.color}`, fontWeight: 600,
                    }}>
                      {st.label}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
                      {timeAgo(boost.created_at)}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {title}
                  </p>
                </div>

                <div style={{ flexShrink: 0, display: 'flex', gap: 20, alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 11, color: 'var(--muted)' }}>{t.budgetCol}</p>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{fmt(boost.budget_cents, boost.currency, dateLocale)}</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 11, color: 'var(--muted)' }}>{t.durationCol}</p>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{boost.duration_days}d</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 11, color: 'var(--muted)' }}>{t.objectiveCol}</p>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{OBJECTIVE_LABELS[boost.objective]}</p>
                  </div>
                  {canCancel && (
                    <button
                      onClick={() => handleCancel(boost.id)}
                      disabled={cancellingId === boost.id}
                      style={{
                        padding: '6px 12px', borderRadius: 8,
                        border: '1px solid #ff6b6b', background: 'rgba(255,107,107,0.1)',
                        color: '#ff6b6b', cursor: 'pointer', fontSize: 12,
                        opacity: cancellingId === boost.id ? 0.5 : 1,
                      }}
                    >
                      {cancellingId === boost.id ? '...' : t.cancelBoost}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal */}
      {boostingPost && (
        <BoostModal
          post={boostingPost}
          t={t}
          locale={dateLocale}
          onClose={() => setBoostingPost(null)}
          onBoost={(data) => handleBoost(boostingPost, data)}
        />
      )}
      </>
      )}
    </div>
  );
}
