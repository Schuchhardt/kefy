'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

import esT from '@/locales/es/dashboard/calendar';
import enT from '@/locales/en/dashboard/calendar';

const T = { es: esT, en: enT } as const;
type Locale = keyof typeof T;

// ─── Types ────────────────────────────────────────────────────────────────────

type PostStatus = 'pending' | 'scheduled' | 'published' | 'failed' | 'cancelled';

interface SocialAccount {
  id:         string;
  platform:   string;
  username:   string;
  avatar_url: string | null;
  status:     string;
}

interface ContentItem {
  id:      string;
  channel: string;
  title:   string | null;
  body:    string | null;
}

interface ScheduledPost {
  id:             string;
  status:         PostStatus;
  scheduled_at:   string | null;
  published_at:   string | null;
  error_message:  string | null;
  created_at:     string;
  kefy_content_items:  ContentItem | null;
  kefy_social_accounts: SocialAccount | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<PostStatus, string> = {
  pending:   '#888',
  scheduled: '#ffb74d',
  published: 'var(--accent)',
  failed:    '#ff6b6b',
  cancelled: '#555',
};

const STATUS_LABELS_BASE: Record<PostStatus, { es: string; en: string }> = {
  pending:   { es: 'Pendiente',  en: 'Pending'   },
  scheduled: { es: 'Programado', en: 'Scheduled'  },
  published: { es: 'Publicado',  en: 'Published'  },
  failed:    { es: 'Fallido',    en: 'Failed'     },
  cancelled: { es: 'Cancelado',  en: 'Cancelled'  },
};

const PLATFORM_ICONS: Record<string, string> = {
  linkedin:  'in',
  instagram: '◉',
  facebook:  'f',
  twitter:   '𝕏',
  tiktok:    '♪',
  threads:   '@',
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { lang } = useParams<{ lang: string }>();
  const t = T[(lang as Locale) ?? 'es'] ?? T.es;
  const locale = lang === 'en' ? 'en-US' : 'es-ES';
  const STATUS_LABELS = Object.fromEntries(
    (Object.keys(STATUS_LABELS_BASE) as PostStatus[]).map((k) => [k, STATUS_LABELS_BASE[k][lang === 'en' ? 'en' : 'es']])
  ) as Record<PostStatus, string>;

  const [posts, setPosts]         = useState<ScheduledPost[]>([]);
  const [accounts, setAccounts]   = useState<SocialAccount[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filterStatus, setFilterStatus] = useState<PostStatus | ''>('');

  // Schedule form
  const [showForm, setShowForm]   = useState(false);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [formContentId, setFormContentId]   = useState('');
  const [formAccountId, setFormAccountId]   = useState('');
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [schedError, setSchedError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (filterStatus) params.set('status', filterStatus);

    const [postsRes, accountsRes] = await Promise.all([
      fetch(`/api/social/schedule?${params}`, { credentials: 'include' }),
      fetch('/api/social/accounts', { credentials: 'include' }),
    ]);

    const postsData    = await postsRes.json()    as { posts: ScheduledPost[] };
    const accountsData = await accountsRes.json() as { accounts: SocialAccount[] };

    setPosts(postsData.posts ?? []);
    setAccounts(accountsData.accounts ?? []);
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function openForm() {
    // Fetch draft/approved content items for the schedule form
    const res = await fetch('/api/content?limit=50&status=approved', { credentials: 'include' });
    const { items } = await res.json() as { items: ContentItem[] };
    // Also include drafts
    const res2 = await fetch('/api/content?limit=50&status=draft', { credentials: 'include' });
    const { items: drafts } = await res2.json() as { items: ContentItem[] };
    setContentItems([...(items ?? []), ...(drafts ?? [])]);
    setShowForm(true);
  }

  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!formContentId || !formAccountId || !formScheduledAt) return;
    setScheduling(true);
    setSchedError(null);

    try {
      const res = await fetch('/api/social/schedule', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_item_id:   formContentId,
          social_account_id: formAccountId,
          scheduled_at:      new Date(formScheduledAt).toISOString(),
        }),
      });
      const data = await res.json() as { post?: ScheduledPost; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al programar');
      setShowForm(false);
      fetchData();
    } catch (err) {
      setSchedError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setScheduling(false);
    }
  }

  async function handleCancel(postId: string) {
    if (!confirm('¿Cancelar esta publicación programada?')) return;
    await fetch(`/api/social/schedule/${postId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    fetchData();
  }

  // Group posts by date for display
  const grouped = posts.reduce<Record<string, ScheduledPost[]>>((acc, post) => {
    const key = post.scheduled_at
      ? new Date(post.scheduled_at).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : t.noText;
    if (!acc[key]) acc[key] = [];
    acc[key].push(post);
    return acc;
  }, {});

  return (
    <div style={{ padding: '40px 48px', maxWidth: 880 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700 }}>{t.title}</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{t.subtitle}</p>
        </div>
        <button
          onClick={openForm}
          style={{
            background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
            padding: '9px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer', flexShrink: 0,
          }}
        >
          {t.scheduleBtn}
        </button>
      </div>

      {/* Connected accounts */}
      {accounts.length > 0 && (
        <div style={{ marginBottom: 28, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {accounts.map((acc) => (
            <div key={acc.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 12px', fontSize: 13,
            }}>
              <span style={{ fontWeight: 700, opacity: 0.7 }}>{PLATFORM_ICONS[acc.platform] ?? '◉'}</span>
              <span>{acc.username}</span>
              <span style={{
                fontSize: 11, padding: '1px 6px', borderRadius: 4,
                background: acc.status === 'active' ? 'rgba(198,255,75,0.12)' : 'var(--bg)',
                color: acc.status === 'active' ? 'var(--accent)' : 'var(--muted)',
              }}>
                {acc.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Schedule form */}
      {showForm && (
        <form onSubmit={handleSchedule} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '20px 24px', marginBottom: 28,
        }}>
          <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
            {t.newScheduled}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{t.contentLabel}</label>
              <select style={inputStyle} value={formContentId} onChange={(e) => setFormContentId(e.target.value)} required>
                <option value="">{t.selectContent}</option>
                {contentItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title ?? (item.body?.slice(0, 60) ?? item.id)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{t.accountLabel}</label>
              <select style={inputStyle} value={formAccountId} onChange={(e) => setFormAccountId(e.target.value)} required>
                <option value="">{t.selectAccount}</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {PLATFORM_ICONS[acc.platform] ?? '◉'} {acc.username}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{t.dateLabel}</label>
            <input
              type="datetime-local"
              style={inputStyle}
              value={formScheduledAt}
              onChange={(e) => setFormScheduledAt(e.target.value)}
              required
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit" disabled={scheduling}
              style={{
                background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
                padding: '9px 20px', fontWeight: 600, fontSize: 13,
                cursor: scheduling ? 'not-allowed' : 'pointer', opacity: scheduling ? 0.7 : 1,
              }}
            >
              {scheduling ? t.scheduling : t.schedule}
            </button>
            <button
              type="button" onClick={() => setShowForm(false)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 16px', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}
            >
              {t.cancel}
            </button>
            {schedError && <span style={{ color: '#ff6b6b', fontSize: 13 }}>{schedError}</span>}
          </div>
        </form>
      )}

      {/* Filter */}
      <div style={{ marginBottom: 20 }}>
        <select style={{ ...inputStyle, width: 'auto' }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as PostStatus | '')}>
          <option value="">{t.allStatuses}</option>
          {(Object.keys(STATUS_LABELS) as PostStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* No accounts warning */}
      {!loading && accounts.length === 0 && (
        <div style={{
          background: 'rgba(255,183,77,0.08)', border: '1px solid rgba(255,183,77,0.3)',
          borderRadius: 10, padding: '14px 18px', marginBottom: 20, fontSize: 14,
        }}>
          <strong>{t.noAccounts}</strong>{' '}
          {t.noAccountsGo} <a href="settings" style={{ color: 'var(--accent)' }}>{t.noAccountsLink}</a> {t.noAccountsHint}
        </div>
      )}

      {/* Calendar posts */}
      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t.loading}</p>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ color: 'var(--muted)', fontSize: 15 }}>{t.noPosts}</p>
        </div>
      ) : (
        Object.entries(grouped).map(([date, group]) => (
          <div key={date} style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              {date}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.map((post) => (
                <div key={post.id} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '14px 16px',
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                }}>
                  {/* Time */}
                  <div style={{ flexShrink: 0, width: 48, textAlign: 'center' }}>
                    <p style={{ fontSize: 13, fontWeight: 700 }}>
                      {post.scheduled_at
                        ? new Date(post.scheduled_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
                        : '--:--'}
                    </p>
                  </div>
                  {/* Platform */}
                  <div style={{ flexShrink: 0 }}>
                    <span style={{ fontSize: 20 }}>
                      {PLATFORM_ICONS[post.kefy_social_accounts?.platform ?? ''] ?? '◉'}
                    </span>
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                      {post.kefy_content_items?.body?.slice(0, 80) ?? post.kefy_content_items?.title ?? t.noText}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {post.kefy_social_accounts?.username ?? t.unknownAccount}
                    </p>
                    {post.error_message && (
                      <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 4 }}>{post.error_message}</p>
                    )}
                  </div>
                  {/* Status */}
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, borderRadius: 4, padding: '2px 8px',
                      background: `${STATUS_COLORS[post.status]}22`,
                      color: STATUS_COLORS[post.status],
                    }}>
                      {STATUS_LABELS[post.status]}
                    </span>
                    {post.status === 'scheduled' && (
                      <button
                        onClick={() => handleCancel(post.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, cursor: 'pointer', padding: 0 }}
                      >
                        {t.cancelPost}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
