'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import ChannelIcon from '@/components/ui/ChannelIcon';

import esInbox from '@/locales/es/dashboard/inbox';
import enInbox from '@/locales/en/dashboard/inbox';
import esEngage from '@/locales/es/dashboard/engage';
import enEngage from '@/locales/en/dashboard/engage';

import type { MessagingPlatform, ThreadPreview, Message, CommentItem, ReviewItem, FilterType } from '@/types/conversations';
import type { SocialAccount } from '@/types/social';
import type { Locale } from '@/types/i18n';

// ─── Constants ────────────────────────────────────────────────────────────────

const TI = { es: esInbox,  en: enInbox  } as const;
const TE = { es: esEngage, en: enEngage } as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReplyBox({
  onSend, disabled, placeholder, sendLabel, errorFallback,
}: {
  onSend: (text: string) => Promise<{ error?: string } | void>;
  disabled?: boolean; placeholder?: string; sendLabel?: string; errorFallback?: string;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    if (!text.trim()) return;
    setSending(true); setError(null);
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
        <input value={text} onChange={(e) => setText(e.target.value)}
          placeholder={placeholder ?? 'Reply...'} disabled={disabled || sending}
          onKeyDown={(e) => { if (e.key === 'Enter') void handle(); }}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13,
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }} />
        <button onClick={handle} disabled={!text.trim() || sending || disabled}
          style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: text.trim() && !disabled ? 'var(--accent)' : 'var(--border)',
            color: text.trim() && !disabled ? '#000' : 'var(--muted)',
            border: 'none', cursor: text.trim() && !disabled ? 'pointer' : 'default',
            opacity: sending ? 0.6 : 1 }}>
          {sending ? '...' : (sendLabel ?? 'Reply')}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConversationsPage() {
  const { lang } = useParams<{ lang: string }>();
  const locale: Locale = (lang as Locale) === 'en' ? 'en' : 'es';
  const ti = TI[locale];
  const te = TE[locale];

  const PLATFORMS: { value: MessagingPlatform | 'all'; label: string }[] = [
    { value: 'all',       label: locale === 'es' ? 'Todos'     : 'All'       },
    { value: 'linkedin',  label: 'LinkedIn'  },
    { value: 'instagram', label: 'Instagram' },
    { value: 'facebook',  label: 'Facebook'  },
    { value: 'twitter',   label: 'X/Twitter' },
    { value: 'tiktok',    label: 'TikTok'    },
    { value: 'threads',   label: 'Threads'   },
  ];

  const FILTER_LABELS: Record<FilterType, string> = {
    dms:      locale === 'es' ? 'DMs'         : 'DMs',
    comments: locale === 'es' ? 'Comentarios' : 'Comments',
    reviews:  locale === 'es' ? 'Reseñas'     : 'Reviews',
  };

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return ti.timeNow;
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    return ti.timeAgo(m, h, d);
  }

  // ── Global filters ──
  const [filterType, setFilterType] = useState<FilterType>('dms');
  const [platformFilter, setPlatformFilter] = useState<MessagingPlatform | 'all'>('all');

  // ── DMs state ──
  const [threads, setThreads]             = useState<ThreadPreview[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [unreadOnly, setUnreadOnly]       = useState(false);
  const [activeThread, setActiveThread]   = useState<ThreadPreview | null>(null);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [activeAccount, setActiveAccount] = useState<SocialAccount | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyText, setReplyText]         = useState('');
  const [sending, setSending]             = useState(false);
  const [sendError, setSendError]         = useState<string | null>(null);
  const [syncing, setSyncing]             = useState(false);
  const [syncMsg, setSyncMsg]             = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Comments state ──
  const [comments, setComments]           = useState<CommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [replyingComment, setReplyingComment] = useState<string | null>(null);
  const [showReplied, setShowReplied]     = useState(false);

  // ── Reviews state ──
  const [reviews, setReviews]             = useState<ReviewItem[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [replyingReview, setReplyingReview] = useState<string | null>(null);

  // ── Data fetching ──
  const fetchThreads = useCallback(() => {
    setThreadsLoading(true);
    const qs = new URLSearchParams();
    if (platformFilter !== 'all') qs.set('platform', platformFilter);
    if (unreadOnly) qs.set('unread', 'true');
    fetch(`/api/messaging?${qs.toString()}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json() as { threads: ThreadPreview[] };
        setThreads(json.threads ?? []);
      })
      .catch(() => { /* ignore */ })
      .finally(() => setThreadsLoading(false));
  }, [platformFilter, unreadOnly]);

  const fetchComments = useCallback(() => {
    setCommentsLoading(true);
    const qs = new URLSearchParams({ limit: '50' });
    if (platformFilter !== 'all') qs.set('platform', platformFilter);
    if (!showReplied) qs.set('replied', 'false');
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
    const qs = new URLSearchParams({ limit: '50' });
    if (platformFilter !== 'all') qs.set('platform', platformFilter);
    if (!showReplied) qs.set('replied', 'false');
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
    if (filterType === 'dms') fetchThreads();
    else if (filterType === 'comments') fetchComments();
    else fetchReviews();
  }, [filterType, fetchThreads, fetchComments, fetchReviews]);

  // ── DM actions ──
  async function handleSync() {
    setSyncing(true); setSyncMsg(null);
    try {
      const res = await fetch('/api/messaging/sync', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setSyncMsg(err.error ?? ti.syncError); return;
      }
      const json = await res.json() as { synced: number };
      setSyncMsg(ti.syncDone(json.synced));
      fetchThreads();
      setTimeout(() => setSyncMsg(null), 4000);
    } catch { setSyncMsg(ti.syncError); }
    finally { setSyncing(false); }
  }

  function openThread(thread: ThreadPreview) {
    setActiveThread(thread); setMessages([]); setThreadLoading(true);
    setSendError(null); setReplyText('');
    const accountId = thread.kefy_social_accounts.id;
    fetch(`/api/messaging/${encodeURIComponent(thread.platform_thread_id)}?account_id=${accountId}`,
      { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json() as { messages: Message[]; account: SocialAccount };
        setMessages(json.messages); setActiveAccount(json.account);
        setThreads((prev) => prev.map((t) =>
          t.platform_thread_id === thread.platform_thread_id && t.kefy_social_accounts.id === accountId
            ? { ...t, read_at: new Date().toISOString() } : t,
        ));
      })
      .catch(() => { /* ignore */ })
      .finally(() => {
        setThreadLoading(false);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      });
  }

  async function handleSend() {
    if (!activeThread || !replyText.trim()) return;
    setSending(true); setSendError(null);
    const accountId = activeThread.kefy_social_accounts.id;
    const threadId = activeThread.platform_thread_id;
    try {
      const res = await fetch(`/api/messaging/${encodeURIComponent(threadId)}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, text: replyText.trim() }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setSendError(err.error ?? ti.errorSend); return;
      }
      setReplyText('');
      const messagesRes = await fetch(
        `/api/messaging/${encodeURIComponent(threadId)}?account_id=${accountId}`,
        { credentials: 'include' },
      );
      if (messagesRes.ok) {
        const refreshed = await messagesRes.json() as { messages: Message[] };
        setMessages(refreshed.messages ?? []);
      }
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch { setSendError(ti.errorConn); }
    finally { setSending(false); }
  }

  // ── Comment/Review reply actions ──
  async function replyComment(commentId: string, text: string): Promise<{ error?: string } | void> {
    const res = await fetch(`/api/comments/${commentId}/reply`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      return { error: err.error ?? te.errorSend };
    }
    setComments((prev) => prev.map((c) =>
      c.id === commentId ? { ...c, replied_at: new Date().toISOString(), reply_body: text } : c,
    ));
    setReplyingComment(null);
  }

  async function replyReview(reviewId: string, text: string): Promise<{ error?: string } | void> {
    const res = await fetch(`/api/reviews/${reviewId}/reply`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      return { error: err.error ?? te.errorSend };
    }
    setReviews((prev) => prev.map((r) =>
      r.id === reviewId ? { ...r, replied_at: new Date().toISOString(), reply_body: text } : r,
    ));
    setReplyingReview(null);
  }

  const dmUnread = threads.filter((t) => !t.read_at && t.direction === 'inbound').length;

  // ─── Shared header ─────────────────────────────────────────────────────────

  const HeaderBar = (
    <div style={{ padding: '24px 32px 0', background: 'var(--bg)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          {locale === 'es' ? 'Conversaciones' : 'Conversations'}
        </h1>
      </div>

      {/* Type filter pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingBottom: 14 }}>
        {(Object.entries(FILTER_LABELS) as [FilterType, string][]).map(([key, label]) => {
          const active = filterType === key;
          const badge = key === 'dms' && dmUnread > 0 ? dmUnread : null;
          return (
            <button key={key} onClick={() => setFilterType(key)}
              style={{ display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'rgba(198,255,75,0.12)' : 'var(--surface)',
                color: active ? 'var(--accent)' : 'var(--muted)', transition: 'all 0.12s' }}>
              {label}
              {badge && (
                <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 10,
                  fontWeight: 700, borderRadius: 10, padding: '0 5px', minWidth: 16, textAlign: 'center' }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* Platform filter */}
        {PLATFORMS.map(({ value, label }) => (
          <button key={value} onClick={() => setPlatformFilter(value as MessagingPlatform | 'all')}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${platformFilter === value ? 'var(--accent)' : 'var(--border)'}`,
              background: platformFilter === value ? 'rgba(198,255,75,0.1)' : 'var(--surface)',
              color: platformFilter === value ? 'var(--accent)' : 'var(--muted)' }}>
            {label}
          </button>
        ))}

        {/* Extra toggles depending on type */}
        {filterType === 'dms' && (
          <>
            <button onClick={() => setUnreadOnly((v) => !v)}
              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${unreadOnly ? 'var(--accent)' : 'var(--border)'}`,
                background: unreadOnly ? 'rgba(198,255,75,0.1)' : 'var(--surface)',
                color: unreadOnly ? 'var(--accent)' : 'var(--muted)' }}>
              {ti.unreadOnly}
            </button>
            <button onClick={() => void handleSync()} disabled={syncing || threadsLoading}
              style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, cursor: syncing ? 'not-allowed' : 'pointer',
                border: `1px solid ${syncing ? 'var(--border)' : 'var(--accent)'}`,
                background: syncing ? 'var(--surface)' : 'var(--accent)',
                color: syncing ? 'var(--muted)' : '#000', fontWeight: 600, opacity: syncing ? 0.6 : 1 }}>
              {syncing ? ti.syncing : ti.syncBtn}
            </button>
          </>
        )}
        {(filterType === 'comments' || filterType === 'reviews') && (
          <button onClick={() => setShowReplied((v) => !v)}
            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${showReplied ? 'var(--accent)' : 'var(--border)'}`,
              background: showReplied ? 'rgba(198,255,75,0.1)' : 'var(--surface)',
              color: showReplied ? 'var(--accent)' : 'var(--muted)' }}>
            {showReplied ? te.showAll : te.unansweredOnly}
          </button>
        )}
      </div>

      {syncMsg && (
        <p style={{ fontSize: 11, paddingBottom: 8,
          color: syncMsg === ti.syncError ? '#ff6b6b' : 'var(--accent)' }}>{syncMsg}</p>
      )}
    </div>
  );

  // ─── DMs view (split panel) ────────────────────────────────────────────────

  if (filterType === 'dms') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        {HeaderBar}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Thread list */}
          <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflowY: 'auto' }}>
            {threadsLoading && <p style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>{ti.loading}</p>}
            {!threadsLoading && threads.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>{ti.noMessages}</p>
                <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{ti.noMessagesHint}</p>
              </div>
            )}
            {threads.map((thread) => {
              const isUnread = !thread.read_at && thread.direction === 'inbound';
              const isActive = activeThread?.platform_thread_id === thread.platform_thread_id
                && activeThread?.kefy_social_accounts.id === thread.kefy_social_accounts.id;
              return (
                <button key={`${thread.kefy_social_accounts.id}::${thread.platform_thread_id}`}
                  onClick={() => openThread(thread)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '14px 18px',
                    background: isActive ? 'rgba(198,255,75,0.06)' : 'transparent',
                    borderTop: 'none', borderRight: 'none',
                    borderBottom: '1px solid var(--border)',
                    borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 15, fontWeight: 700, color: 'var(--text)',
                      backgroundImage: thread.sender_avatar ? `url(${thread.sender_avatar})` : undefined,
                      backgroundSize: 'cover' }}>
                      {!thread.sender_avatar && (thread.sender_name?.[0]?.toUpperCase() ?? '?')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: isUnread ? 700 : 500,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {thread.sender_name ?? thread.sender_id}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                          {timeAgo(thread.created_at)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <span style={{ display: 'flex', alignItems: 'center', fontSize: 11, color: 'var(--muted)' }}>
                          <ChannelIcon name={thread.platform} size={11} />
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {thread.body.slice(0, 50)}{thread.body.length > 50 ? '…' : ''}
                        </span>
                        {isUnread && (
                          <span style={{ width: 7, height: 7, borderRadius: '50%',
                            background: 'var(--accent)', flexShrink: 0 }} />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Conversation panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!activeThread ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 32 }}>✉</p>
                <p style={{ color: 'var(--muted)', fontSize: 14 }}>{ti.selectMessage}</p>
              </div>
            ) : (
              <>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)',
                  background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700,
                    backgroundImage: activeThread.sender_avatar ? `url(${activeThread.sender_avatar})` : undefined,
                    backgroundSize: 'cover' }}>
                    {!activeThread.sender_avatar && (activeThread.sender_name?.[0]?.toUpperCase() ?? '?')}
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{activeThread.sender_name ?? activeThread.sender_id}</p>
                    <p style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ChannelIcon name={activeThread.platform} size={12} /> {activeThread.platform}
                      {activeAccount && ` · @${activeAccount.username}`}
                    </p>
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px',
                  display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {threadLoading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>{ti.loadingConvo}</p>}
                  {!threadLoading && messages.map((msg) => {
                    const isOut = msg.direction === 'outbound';
                    return (
                      <div key={msg.id} style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth: '70%',
                          background: isOut ? 'rgba(198,255,75,0.15)' : 'var(--surface)',
                          border: `1px solid ${isOut ? 'rgba(198,255,75,0.3)' : 'var(--border)'}`,
                          borderRadius: isOut ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                          padding: '10px 14px' }}>
                          {!isOut && msg.sender_name && (
                            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>
                              {msg.sender_name}
                            </p>
                          )}
                          <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {msg.body}
                          </p>
                          <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4,
                            textAlign: isOut ? 'right' : 'left' }}>
                            {timeAgo(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                  {sendError && <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 8 }}>{sendError}</p>}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)}
                      placeholder={ti.replyPlaceholder} rows={2}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                      style={{ flex: 1, resize: 'none', background: 'var(--bg)', border: '1px solid var(--border)',
                        borderRadius: 10, padding: '10px 14px', fontSize: 14, color: 'var(--text)',
                        outline: 'none', fontFamily: 'inherit' }} />
                    <button onClick={() => void handleSend()} disabled={sending || !replyText.trim()}
                      style={{ padding: '10px 20px', borderRadius: 10,
                        background: replyText.trim() ? 'var(--accent)' : 'var(--border)',
                        color: replyText.trim() ? '#000' : 'var(--muted)',
                        border: 'none', cursor: replyText.trim() ? 'pointer' : 'default',
                        fontWeight: 600, fontSize: 14, alignSelf: 'flex-end', opacity: sending ? 0.6 : 1 }}>
                      {sending ? '...' : ti.sendBtn}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Comments view ─────────────────────────────────────────────────────────

  if (filterType === 'comments') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        {HeaderBar}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          <div style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {commentsLoading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>{te.loadingComments}</p>}
            {!commentsLoading && comments.length === 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '40px 24px', textAlign: 'center' }}>
                <p style={{ color: 'var(--muted)', fontSize: 14 }}>{te.noComments}</p>
                <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{te.noCommentsHint}</p>
              </div>
            )}
            {comments.map((c) => (
              <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700,
                    backgroundImage: c.author_avatar ? `url(${c.author_avatar})` : undefined,
                    backgroundSize: 'cover' }}>
                    {!c.author_avatar && (c.author_name?.[0]?.toUpperCase() ?? '?')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{c.author_name ?? c.author_id}</span>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: 'var(--border)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <ChannelIcon name={c.platform} size={10} /> {c.platform}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>{timeAgo(c.created_at)}</span>
                    </div>
                    <p style={{ fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word' }}>{c.body}</p>
                    {c.replied_at && c.reply_body && (
                      <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8,
                        background: 'rgba(198,255,75,0.07)', border: '1px solid rgba(198,255,75,0.2)' }}>
                        <p style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 4 }}>
                          {te.yourReply} · {timeAgo(c.replied_at)}
                        </p>
                        <p style={{ fontSize: 13 }}>{c.reply_body}</p>
                      </div>
                    )}
                    {!c.replied_at && (
                      replyingComment === c.id ? (
                        <ReplyBox onSend={(text) => replyComment(c.id, text)}
                          placeholder={te.replyPlaceholder} sendLabel={te.replyBtnSend} errorFallback={te.errorSend} />
                      ) : (
                        <button onClick={() => setReplyingComment(c.id)}
                          style={{ marginTop: 8, fontSize: 12, padding: '4px 10px', borderRadius: 6,
                            border: '1px solid var(--border)', background: 'transparent',
                            color: 'var(--muted)', cursor: 'pointer' }}>
                          {te.replyBtn}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Reviews view ──────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {HeaderBar}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <div style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reviewsLoading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>{te.loadingReviews}</p>}
          {!reviewsLoading && reviews.length === 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '40px 24px', textAlign: 'center' }}>
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>{te.noReviews}</p>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{te.noReviewsHint}</p>
            </div>
          )}
          {reviews.map((r) => (
            <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700,
                  backgroundImage: r.reviewer_avatar ? `url(${r.reviewer_avatar})` : undefined,
                  backgroundSize: 'cover' }}>
                  {!r.reviewer_avatar && (r.reviewer_name?.[0]?.toUpperCase() ?? '?')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{r.reviewer_name ?? r.reviewer_id}</span>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4,
                      background: 'var(--border)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <ChannelIcon name={r.platform} size={10} /> {r.platform}
                    </span>
                    <span style={{ fontSize: 13, letterSpacing: 1 }}>
                      {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
                      {timeAgo(r.published_at ?? r.created_at)}
                    </span>
                  </div>
                  {r.body && <p style={{ fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word' }}>{r.body}</p>}
                  {r.replied_at && r.reply_body && (
                    <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(198,255,75,0.07)', border: '1px solid rgba(198,255,75,0.2)' }}>
                      <p style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 4 }}>
                        {te.yourReply} · {timeAgo(r.replied_at)}
                      </p>
                      <p style={{ fontSize: 13 }}>{r.reply_body}</p>
                    </div>
                  )}
                  {!r.replied_at && (
                    replyingReview === r.id ? (
                      <ReplyBox onSend={(text) => replyReview(r.id, text)}
                        placeholder={te.replyPlaceholder} sendLabel={te.replyBtnSend} errorFallback={te.errorSend} />
                    ) : (
                      <button onClick={() => setReplyingReview(r.id)}
                        style={{ marginTop: 8, fontSize: 12, padding: '4px 10px', borderRadius: 6,
                          border: '1px solid var(--border)', background: 'transparent',
                          color: 'var(--muted)', cursor: 'pointer' }}>
                        {te.replyBtn}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
