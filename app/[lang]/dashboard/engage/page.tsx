'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

import esT from '@/locales/es/dashboard/engage';
import enT from '@/locales/en/dashboard/engage';

const T = { es: esT, en: enT } as const;
type Locale = keyof typeof T;

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = 'linkedin' | 'instagram' | 'facebook' | 'twitter' | 'tiktok' | 'threads';

interface SocialAccount { id: string; platform: Platform; username: string }

interface CommentItem {
  id:                  string;
  platform:            Platform;
  platform_post_id:    string;
  platform_comment_id: string;
  author_id:           string;
  author_name:         string | null;
  author_avatar:       string | null;
  body:                string;
  replied_at:          string | null;
  reply_body:          string | null;
  created_at:          string;
  kefy_social_accounts: SocialAccount;
  kefy_scheduled_posts?: { id: string; kefy_content_items?: { title?: string } } | null;
}

interface ReviewItem {
  id:                string;
  platform:          Platform;
  reviewer_id:       string;
  reviewer_name:     string | null;
  reviewer_avatar:   string | null;
  rating:            number;
  body:              string | null;
  replied_at:        string | null;
  reply_body:        string | null;
  published_at:      string | null;
  created_at:        string;
  kefy_social_accounts: SocialAccount;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<Platform | 'unknown', string> = {
  linkedin:  'in', instagram: '◉', facebook: 'f',
  twitter:   '𝕏',  tiktok:    '♪', threads:  '@', unknown: '?',
};

const PLATFORMS_BASE: { value: Platform | 'all'; label: string }[] = [
  { value: 'linkedin',  label: 'LinkedIn'  },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook',  label: 'Facebook'  },
  { value: 'twitter',   label: 'X/Twitter' },
  { value: 'tiktok',    label: 'TikTok'    },
  { value: 'threads',   label: 'Threads'   },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReplyBox({
  onSend,
  disabled,
  placeholder,
  sendLabel,
  errorFallback,
}: {
  onSend: (text: string) => Promise<{ error?: string } | void>;
  disabled?: boolean;
  placeholder?: string;
  sendLabel?: string;
  errorFallback?: string;
}) {
  const [text, setText]     = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handle() {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    const result = await onSend(text.trim());
    if (result && 'error' in result) {
      setError(result.error ?? (errorFallback ?? 'Error'));
    } else {
      setText('');
    }
    setSending(false);
  }

  return (
    <div style={{ marginTop: 10 }}>
      {error && <p style={{ fontSize: 11, color: '#ff6b6b', marginBottom: 4 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder ?? 'Reply...'}
          disabled={disabled || sending}
          onKeyDown={(e) => { if (e.key === 'Enter') handle(); }}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13,
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text)', outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button
          onClick={handle}
          disabled={!text.trim() || sending || disabled}
          style={{
            padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: text.trim() && !disabled ? 'var(--accent)' : 'var(--border)',
            color: text.trim() && !disabled ? '#000' : 'var(--muted)',
            border: 'none', cursor: text.trim() && !disabled ? 'pointer' : 'default',
            opacity: sending ? 0.6 : 1,
          }}
        >
          {sending ? '...' : (sendLabel ?? 'Reply')}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EngagePage() {
  const { lang } = useParams<{ lang: string }>();
  const t = T[(lang as Locale) ?? 'es'] ?? T.es;
  const PLATFORMS: { value: Platform | 'all'; label: string }[] = [
    { value: 'all', label: t.all },
    ...PLATFORMS_BASE,
  ];
  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return t.timeNow;
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    return t.timeAgo(m, h, d);
  }
  const [tab, setTab]             = useState<'comments' | 'reviews'>('comments');
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
  const [showReplied, setShowReplied] = useState(false);

  // Comments
  const [comments, setComments]   = useState<CommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [replyingComment, setReplyingComment] = useState<string | null>(null);

  // Reviews
  const [reviews, setReviews]     = useState<ReviewItem[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [replyingReview, setReplyingReview] = useState<string | null>(null);

  const fetchComments = useCallback(() => {
    setCommentsLoading(true);
    const qs = new URLSearchParams();
    if (platformFilter !== 'all') qs.set('platform', platformFilter);
    if (!showReplied) qs.set('replied', 'false');
    qs.set('limit', '50');
    fetch(`/api/comments?${qs.toString()}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json() as { comments: CommentItem[] };
        setComments(json.comments ?? []);
      })
      .catch(() => { /* ignore */ })
      .finally(() => setCommentsLoading(false));
  }, [platformFilter, showReplied]);

  const fetchReviews = useCallback(() => {
    setReviewsLoading(true);
    const qs = new URLSearchParams();
    if (platformFilter !== 'all') qs.set('platform', platformFilter);
    if (!showReplied) qs.set('replied', 'false');
    qs.set('limit', '50');
    fetch(`/api/reviews?${qs.toString()}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json() as { reviews: ReviewItem[] };
        setReviews(json.reviews ?? []);
      })
      .catch(() => { /* ignore */ })
      .finally(() => setReviewsLoading(false));
  }, [platformFilter, showReplied]);

  useEffect(() => {
    if (tab === 'comments') fetchComments();
    else fetchReviews();
  }, [tab, fetchComments, fetchReviews]);

  async function replyComment(commentId: string, text: string): Promise<{ error?: string } | void> {
    const res = await fetch(`/api/comments/${commentId}/reply`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      return { error: err.error ?? t.errorSend };
    }
    setComments((prev) => prev.map((c) =>
      c.id === commentId ? { ...c, replied_at: new Date().toISOString(), reply_body: text } : c,
    ));
    setReplyingComment(null);
  }

  async function replyReview(reviewId: string, text: string): Promise<{ error?: string } | void> {
    const res = await fetch(`/api/reviews/${reviewId}/reply`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      return { error: err.error ?? t.errorSend };
    }
    setReviews((prev) => prev.map((r) =>
      r.id === reviewId ? { ...r, replied_at: new Date().toISOString(), reply_body: text } : r,
    ));
    setReplyingReview(null);
  }

  return (
    <div style={{ padding: '40px 48px', maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700 }}>Engage</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
          Gestiona comentarios y reseñas de todas tus plataformas
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, gap: 4 }}>
          {(['comments', 'reviews'] as const).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              style={{
                padding: '6px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                border: 'none',
                background: tab === tabKey ? 'var(--accent)' : 'transparent',
                color: tab === tabKey ? '#000' : 'var(--muted)',
                fontWeight: tab === tabKey ? 600 : 400,
              }}
            >
              {tabKey === 'comments' ? t.tabComments : t.tabReviews}
            </button>
          ))}
        </div>

        {/* Platform */}
        {PLATFORMS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setPlatformFilter(value as Platform | 'all')}
            style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${platformFilter === value ? 'var(--accent)' : 'var(--border)'}`,
              background: platformFilter === value ? 'rgba(198,255,75,0.1)' : 'var(--surface)',
              color: platformFilter === value ? 'var(--accent)' : 'var(--muted)',
            }}
          >
            {label}
          </button>
        ))}

        {/* Toggle replied */}
        <button
          onClick={() => setShowReplied((v) => !v)}
          style={{
            fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', marginLeft: 'auto',
            border: `1px solid ${showReplied ? 'var(--accent)' : 'var(--border)'}`,
            background: showReplied ? 'rgba(198,255,75,0.1)' : 'var(--surface)',
            color: showReplied ? 'var(--accent)' : 'var(--muted)',
          }}
        >
          {showReplied ? t.showAll : t.unansweredOnly}
        </button>
      </div>

      {/* ── Comments tab ──────────────────────────────────────────────────── */}
      {tab === 'comments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {commentsLoading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t.loadingComments}</p>}
          {!commentsLoading && comments.length === 0 && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '40px 24px', textAlign: 'center',
            }}>
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t.noComments}</p>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                {t.noCommentsHint}
              </p>
            </div>
          )}
          {comments.map((c) => (
            <div key={c.id} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '16px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700,
                  backgroundImage: c.author_avatar ? `url(${c.author_avatar})` : undefined,
                  backgroundSize: 'cover',
                }}>
                  {!c.author_avatar && (c.author_name?.[0]?.toUpperCase() ?? '?')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.author_name ?? c.author_id}</span>
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 4,
                      background: 'var(--border)', color: 'var(--muted)',
                    }}>
                      {PLATFORM_ICONS[c.platform] ?? '◉'} {c.platform}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
                      {timeAgo(c.created_at)}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word' }}>{c.body}</p>

                  {/* Already replied */}
                  {c.replied_at && c.reply_body && (
                    <div style={{
                      marginTop: 10, padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(198,255,75,0.07)', border: '1px solid rgba(198,255,75,0.2)',
                    }}>
                      <p style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 4 }}>
                        {t.yourReply} · {timeAgo(c.replied_at)}
                      </p>
                      <p style={{ fontSize: 13 }}>{c.reply_body}</p>
                    </div>
                  )}

                  {/* Reply input */}
                  {!c.replied_at && (
                    replyingComment === c.id ? (
                      <ReplyBox
                        onSend={(text) => replyComment(c.id, text)}
                        placeholder={t.replyPlaceholder}
                        sendLabel={t.replyBtnSend}
                        errorFallback={t.errorSend}
                      />
                    ) : (
                      <button
                        onClick={() => setReplyingComment(c.id)}
                        style={{
                          marginTop: 8, fontSize: 12, padding: '4px 10px', borderRadius: 6,
                          border: '1px solid var(--border)', background: 'transparent',
                          color: 'var(--muted)', cursor: 'pointer',
                        }}
                      >
                        {t.replyBtn}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Reviews tab ───────────────────────────────────────────────────── */}
      {tab === 'reviews' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reviewsLoading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t.loadingReviews}</p>}
          {!reviewsLoading && reviews.length === 0 && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '40px 24px', textAlign: 'center',
            }}>
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t.noReviews}</p>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                {t.noReviewsHint}
              </p>
            </div>
          )}
          {reviews.map((r) => (
            <div key={r.id} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '16px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700,
                  backgroundImage: r.reviewer_avatar ? `url(${r.reviewer_avatar})` : undefined,
                  backgroundSize: 'cover',
                }}>
                  {!r.reviewer_avatar && (r.reviewer_name?.[0]?.toUpperCase() ?? '?')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{r.reviewer_name ?? r.reviewer_id}</span>
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 4,
                      background: 'var(--border)', color: 'var(--muted)',
                    }}>
                      {PLATFORM_ICONS[r.platform] ?? '◉'} {r.platform}
                    </span>
                    {/* Stars */}
                    <span style={{ fontSize: 13, letterSpacing: 1 }}>
                      {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
                      {timeAgo(r.published_at ?? r.created_at)}
                    </span>
                  </div>
                  {r.body && (
                    <p style={{ fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word' }}>{r.body}</p>
                  )}

                  {/* Already replied */}
                  {r.replied_at && r.reply_body && (
                    <div style={{
                      marginTop: 10, padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(198,255,75,0.07)', border: '1px solid rgba(198,255,75,0.2)',
                    }}>
                      <p style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 4 }}>
                        {t.yourReply} · {timeAgo(r.replied_at)}
                      </p>
                      <p style={{ fontSize: 13 }}>{r.reply_body}</p>
                    </div>
                  )}

                  {/* Reply input */}
                  {!r.replied_at && (
                    replyingReview === r.id ? (
                      <ReplyBox
                        onSend={(text) => replyReview(r.id, text)}
                        placeholder={t.replyPlaceholder}
                        sendLabel={t.replyBtnSend}
                        errorFallback={t.errorSend}
                      />
                    ) : (
                      <button
                        onClick={() => setReplyingReview(r.id)}
                        style={{
                          marginTop: 8, fontSize: 12, padding: '4px 10px', borderRadius: 6,
                          border: '1px solid var(--border)', background: 'transparent',
                          color: 'var(--muted)', cursor: 'pointer',
                        }}
                      >
                        {t.replyBtn}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
