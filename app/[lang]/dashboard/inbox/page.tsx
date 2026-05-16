'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = 'linkedin' | 'instagram' | 'facebook' | 'twitter' | 'tiktok' | 'threads';

interface SocialAccount {
  id:         string;
  platform:   Platform;
  username:   string;
  avatar_url: string | null;
}

interface ThreadPreview {
  id:                  string;
  platform:            Platform;
  platform_thread_id:  string;
  platform_message_id: string;
  sender_id:           string;
  sender_name:         string | null;
  sender_avatar:       string | null;
  body:                string;
  direction:           'inbound' | 'outbound';
  read_at:             string | null;
  created_at:          string;
  kefy_social_accounts: SocialAccount;
}

interface Message {
  id:           string;
  sender_id:    string;
  sender_name:  string | null;
  sender_avatar: string | null;
  body:         string;
  direction:    'inbound' | 'outbound';
  read_at:      string | null;
  created_at:   string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<Platform | 'unknown', string> = {
  linkedin:  'in',
  instagram: '◉',
  facebook:  'f',
  twitter:   '𝕏',
  tiktok:    '♪',
  threads:   '@',
  unknown:   '?',
};

const PLATFORMS: { value: Platform | 'all'; label: string }[] = [
  { value: 'all',       label: 'Todos'     },
  { value: 'linkedin',  label: 'LinkedIn'  },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook',  label: 'Facebook'  },
  { value: 'twitter',   label: 'X/Twitter' },
  { value: 'tiktok',    label: 'TikTok'    },
  { value: 'threads',   label: 'Threads'   },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'ahora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const [threads, setThreads]       = useState<ThreadPreview[]>([]);
  const [loading, setLoading]       = useState(true);
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [activeThread, setActiveThread] = useState<ThreadPreview | null>(null);
  const [messages, setMessages]         = useState<Message[]>([]);
  const [activeAccount, setActiveAccount] = useState<SocialAccount | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const [replyText, setReplyText] = useState('');
  const [sending, setSending]     = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchThreads = useCallback(() => {
    setLoading(true);
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
      .finally(() => setLoading(false));
  }, [platformFilter, unreadOnly]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  function openThread(thread: ThreadPreview) {
    setActiveThread(thread);
    setMessages([]);
    setThreadLoading(true);
    setSendError(null);
    setReplyText('');

    const accountId = thread.kefy_social_accounts.id;
    fetch(
      `/api/messaging/${encodeURIComponent(thread.platform_thread_id)}?account_id=${accountId}`,
      { credentials: 'include' },
    )
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json() as { messages: Message[]; account: SocialAccount };
        setMessages(json.messages);
        setActiveAccount(json.account);
        // Mark thread as read locally
        setThreads((prev) => prev.map((t) =>
          t.platform_thread_id === thread.platform_thread_id && t.kefy_social_accounts.id === accountId
            ? { ...t, read_at: new Date().toISOString() }
            : t,
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
    setSending(true);
    setSendError(null);

    const accountId = activeThread.kefy_social_accounts.id;
    const threadId  = activeThread.platform_thread_id;

    try {
      const res = await fetch(
        `/api/messaging/${encodeURIComponent(threadId)}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: accountId, text: replyText.trim() }),
        },
      );
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setSendError(err.error ?? 'Error al enviar');
        return;
      }
      const json = await res.json() as { message: Message };
      setMessages((prev) => [...prev, json.message]);
      setReplyText('');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch {
      setSendError('Error de conexión');
    } finally {
      setSending(false);
    }
  }

  const unreadCount = threads.filter((t) => !t.read_at && t.direction === 'inbound').length;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Left panel: thread list ─────────────────────────────────────── */}
      <div style={{
        width: 320, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface)',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 18, fontWeight: 700 }}>
              Inbox {unreadCount > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 11, fontWeight: 700,
                  background: 'var(--accent)', color: '#000',
                  borderRadius: 10, padding: '1px 7px',
                }}>
                  {unreadCount}
                </span>
              )}
            </h1>
            <button
              onClick={fetchThreads}
              style={{
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                color: 'var(--muted)', fontSize: 13,
              }}
            >
              ↻
            </button>
          </div>

          {/* Unread toggle */}
          <button
            onClick={() => setUnreadOnly((v) => !v)}
            style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${unreadOnly ? 'var(--accent)' : 'var(--border)'}`,
              background: unreadOnly ? 'rgba(198,255,75,0.1)' : 'transparent',
              color: unreadOnly ? 'var(--accent)' : 'var(--muted)',
              marginBottom: 10,
            }}
          >
            Solo no leídos
          </button>

          {/* Platform filter */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {PLATFORMS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setPlatformFilter(value as Platform | 'all')}
                style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${platformFilter === value ? 'var(--accent)' : 'var(--border)'}`,
                  background: platformFilter === value ? 'rgba(198,255,75,0.1)' : 'transparent',
                  color: platformFilter === value ? 'var(--accent)' : 'var(--muted)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Thread list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <p style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Cargando...</p>
          )}
          {!loading && threads.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sin mensajes</p>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                Los DMs llegan aquí vía webhook de Zernio
              </p>
            </div>
          )}
          {threads.map((thread) => {
            const isUnread = !thread.read_at && thread.direction === 'inbound';
            const isActive = activeThread?.platform_thread_id === thread.platform_thread_id
              && activeThread?.kefy_social_accounts.id === thread.kefy_social_accounts.id;

            return (
              <button
                key={`${thread.kefy_social_accounts.id}::${thread.platform_thread_id}`}
                onClick={() => openThread(thread)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '14px 18px',
                  background: isActive ? 'rgba(198,255,75,0.06)' : 'transparent',
                  borderTop: 'none', borderRight: 'none',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, fontWeight: 700, color: 'var(--text)',
                    backgroundImage: thread.sender_avatar ? `url(${thread.sender_avatar})` : undefined,
                    backgroundSize: 'cover',
                  }}>
                    {!thread.sender_avatar && (thread.sender_name?.[0]?.toUpperCase() ?? '?')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: isUnread ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {thread.sender_name ?? thread.sender_id}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                        {timeAgo(thread.created_at)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {PLATFORM_ICONS[thread.platform] ?? '◉'}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {thread.body.slice(0, 50)}{thread.body.length > 50 ? '…' : ''}
                      </span>
                      {isUnread && (
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: 'var(--accent)', flexShrink: 0,
                        }} />
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right panel: conversation ───────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!activeThread ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 32 }}>✉</p>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Selecciona un mensaje para verlo</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div style={{
              padding: '16px 24px', borderBottom: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 700,
                backgroundImage: activeThread.sender_avatar ? `url(${activeThread.sender_avatar})` : undefined,
                backgroundSize: 'cover',
              }}>
                {!activeThread.sender_avatar && (activeThread.sender_name?.[0]?.toUpperCase() ?? '?')}
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>
                  {activeThread.sender_name ?? activeThread.sender_id}
                </p>
                <p style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize' }}>
                  {PLATFORM_ICONS[activeThread.platform] ?? '◉'} {activeThread.platform}
                  {activeAccount && ` · @${activeAccount.username}`}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {threadLoading && (
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando conversación...</p>
              )}
              {!threadLoading && messages.map((msg) => {
                const isOut = msg.direction === 'outbound';
                return (
                  <div key={msg.id} style={{
                    display: 'flex',
                    justifyContent: isOut ? 'flex-end' : 'flex-start',
                  }}>
                    <div style={{
                      maxWidth: '70%',
                      background: isOut ? 'rgba(198,255,75,0.15)' : 'var(--surface)',
                      border: `1px solid ${isOut ? 'rgba(198,255,75,0.3)' : 'var(--border)'}`,
                      borderRadius: isOut ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                      padding: '10px 14px',
                    }}>
                      {!isOut && msg.sender_name && (
                        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>
                          {msg.sender_name}
                        </p>
                      )}
                      <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {msg.body}
                      </p>
                      <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, textAlign: isOut ? 'right' : 'left' }}>
                        {timeAgo(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply box */}
            <div style={{
              padding: '16px 24px', borderTop: '1px solid var(--border)',
              background: 'var(--surface)',
            }}>
              {sendError && (
                <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 8 }}>{sendError}</p>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Escribe una respuesta..."
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  style={{
                    flex: 1, resize: 'none',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '10px 14px',
                    fontSize: 14, color: 'var(--text)',
                    outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !replyText.trim()}
                  style={{
                    padding: '10px 20px', borderRadius: 10,
                    background: replyText.trim() ? 'var(--accent)' : 'var(--border)',
                    color: replyText.trim() ? '#000' : 'var(--muted)',
                    border: 'none', cursor: replyText.trim() ? 'pointer' : 'default',
                    fontWeight: 600, fontSize: 14, alignSelf: 'flex-end',
                    opacity: sending ? 0.6 : 1,
                  }}
                >
                  {sending ? '...' : '↑ Enviar'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
