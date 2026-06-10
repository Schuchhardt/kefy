'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import ChannelIcon from '@/components/ui/ChannelIcon';

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

  const today = useMemo(() => new Date(), []);
  const [posts, setPosts]         = useState<ScheduledPost[]>([]);
  const [accounts, setAccounts]   = useState<SocialAccount[]>([]);
  const [loading, setLoading]     = useState(true);

  // Calendar navigation
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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
    const [postsRes, accountsRes] = await Promise.all([
      fetch('/api/social/schedule?limit=100', { credentials: 'include' }),
      fetch('/api/social/accounts', { credentials: 'include' }),
    ]);
    const postsData    = await postsRes.json()    as { posts: ScheduledPost[] };
    const accountsData = await accountsRes.json() as { accounts: SocialAccount[] };
    setPosts(postsData.posts ?? []);
    setAccounts(accountsData.accounts ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const postsByDay = useMemo(() => {
    const map: Record<string, ScheduledPost[]> = {};
    for (const post of posts) {
      if (!post.scheduled_at) continue;
      const d = new Date(post.scheduled_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map[key]) map[key] = [];
      map[key].push(post);
    }
    return map;
  }, [posts]);

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const startOffset     = (firstDayOfMonth + 6) % 7;
  const daysInMonth     = new Date(viewYear, viewMonth + 1, 0).getDate();
  const totalCells      = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  function goToPrevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
    setSelectedDate(null);
  }
  function goToNextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
    setSelectedDate(null);
  }
  function goToToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(null);
  }

  const selectedDayPosts = selectedDate ? (postsByDay[selectedDate] ?? []) : null;

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

  return (
    <div style={{ padding: '40px 48px', maxWidth: 960 }}>
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
        <div style={{ marginBottom: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {accounts.map((acc) => (
            <div key={acc.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 12px', fontSize: 13,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, opacity: 0.7 }}>
                <ChannelIcon name={acc.platform} size={16} />
              </span>
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
                    {acc.username}
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

      {/* No accounts warning */}
      {!loading && accounts.length === 0 && (
        <div style={{
          background: 'rgba(255,183,77,0.08)', border: '1px solid rgba(255,183,77,0.3)',
          borderRadius: 10, padding: '14px 18px', marginBottom: 24, fontSize: 14,
        }}>
          <strong>{t.noAccounts}</strong>{' '}
          {t.noAccountsGo} <a href="settings" style={{ color: 'var(--accent)' }}>{t.noAccountsLink}</a> {t.noAccountsHint}
        </div>
      )}

      {/* ── Monthly Calendar Grid ─────────────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 28 }}>

        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={goToPrevMonth}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            &#8249;
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: 'var(--font-syne)', fontSize: 16, fontWeight: 700 }}>
              {t.monthNames[viewMonth]} {viewYear}
            </span>
            {(viewYear !== today.getFullYear() || viewMonth !== today.getMonth()) && (
              <button
                onClick={goToToday}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--muted)' }}
              >
                {t.today}
              </button>
            )}
          </div>
          <button
            onClick={goToNextMonth}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            &#8250;
          </button>
        </div>

        {/* Status legend */}
        <div style={{ display: 'flex', gap: 16, padding: '8px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {(['scheduled', 'published', 'failed', 'pending'] as PostStatus[]).map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[s] }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{STATUS_LABELS[s]}</span>
            </div>
          ))}
        </div>

        {/* Day-of-week headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {t.dayNames.map((day) => (
            <div key={day} style={{ textAlign: 'center', padding: '8px 4px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {day}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)', fontSize: 14 }}>{t.loading}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {Array.from({ length: totalCells }, (_, i) => {
              const dayNum  = i - startOffset + 1;
              const isValid = dayNum >= 1 && dayNum <= daysInMonth;
              const dateKey = isValid
                ? `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
                : '';
              const dayPosts   = isValid ? (postsByDay[dateKey] ?? []) : [];
              const isToday    = isValid && viewYear === today.getFullYear() && viewMonth === today.getMonth() && dayNum === today.getDate();
              const isSelected = dateKey !== '' && dateKey === selectedDate;
              return (
                <div
                  key={i}
                  onClick={() => { if (isValid) setSelectedDate(isSelected ? null : dateKey); }}
                  style={{
                    minHeight: 84,
                    padding: '8px',
                    borderTop: '1px solid var(--border)',
                    borderRight: i % 7 !== 6 ? '1px solid var(--border)' : undefined,
                    cursor: isValid ? 'pointer' : 'default',
                    background: isSelected ? 'rgba(198,255,75,0.06)' : 'transparent',
                    transition: 'background 0.12s',
                    boxSizing: 'border-box',
                    opacity: isValid ? 1 : 0,
                  }}
                >
                  {isValid && (
                    <>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%',
                        background: isToday ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: isToday || isSelected ? 700 : 400,
                        color: isToday ? '#000' : 'var(--text)',
                        marginBottom: 5,
                      }}>
                        {dayNum}
                      </div>
                      {dayPosts.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
                          {dayPosts.slice(0, 4).map((post) => (
                            <div
                              key={post.id}
                              title={`${post.kefy_social_accounts?.platform ?? ''} · ${STATUS_LABELS[post.status]}`}
                              style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[post.status], flexShrink: 0 }}
                            />
                          ))}
                          {dayPosts.length > 4 && (
                            <span style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1, marginLeft: 1 }}>+{dayPosts.length - 4}</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Day Detail Panel ───────────────────────────────────────────────── */}
      {selectedDate === null ? (
        posts.length > 0 && !loading && (
          <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', paddingBottom: 16 }}>
            {t.selectDayHint}
          </p>
        )
      ) : (
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          {selectedDayPosts!.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ color: 'var(--muted)', fontSize: 15 }}>{t.noPosts}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedDayPosts!.map((post) => (
                <div key={post.id} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '14px 16px',
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                }}>
                  <div style={{ flexShrink: 0, width: 48, textAlign: 'center' }}>
                    <p style={{ fontSize: 13, fontWeight: 700 }}>
                      {post.scheduled_at
                        ? new Date(post.scheduled_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
                        : '--:--'}
                    </p>
                  </div>
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
                    <ChannelIcon name={post.kefy_social_accounts?.platform ?? ''} size={20} />
                  </div>
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
          )}
        </div>
      )}
    </div>
  );
}
