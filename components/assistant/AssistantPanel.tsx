'use client';

// ─── Panel del asistente ─────────────────────────────────────────────────────
//
// Encabezado (marca activa, mensajes restantes del mes, historial, nueva
// conversación, cerrar), lista de mensajes y compositor. Se monta la primera
// vez que se abre y luego solo se oculta, para no perder la conversación al
// cerrarlo ni al navegar entre páginas del dashboard.
//
// En móvil ocupa toda la pantalla (ver .assistant-panel en app/globals.css).

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import esT from '@/locales/es/dashboard/assistant';
import enT from '@/locales/en/dashboard/assistant';
import { useAuth } from '@/lib/auth-context';
import { useBrand } from '@/lib/brand-context';
import { useAssistant } from '@/lib/assistant/use-assistant';
import BrandAvatar from '@/components/dashboard/BrandAvatar';
import MessageBubble from '@/components/assistant/MessageBubble';
import { Spinner } from '@/components/assistant/ToolChip';

const T = { es: esT, en: enT } as const;

const MAX_LENGTH = 4000;
const LINE_HEIGHT = 20;
const MAX_ROWS = 5;
/** Si el usuario subió más que esto, no se le arrastra al final con cada token. */
const STICK_THRESHOLD = 80;

const iconBtn = {
  width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 8, border: '1px solid transparent', background: 'transparent', color: 'var(--muted)', cursor: 'pointer',
} as const;

function isMobile(): boolean {
  try { return window.matchMedia('(max-width: 767px)').matches; } catch { return false; }
}

function relativeTime(iso: string, lang: 'es' | 'en'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  try {
    const rtf = new Intl.RelativeTimeFormat(lang === 'en' ? 'en' : 'es', { numeric: 'auto' });
    if (diff < 3600) return rtf.format(-Math.max(1, Math.round(diff / 60)), 'minute');
    if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
    if (diff < 86400 * 7) return rtf.format(-Math.round(diff / 86400), 'day');
  } catch {
    // Sin Intl.RelativeTimeFormat: fecha corta.
  }
  return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CL', { day: 'numeric', month: 'short' });
}

export default function AssistantPanel({
  lang,
  open,
  alignLeft,
  onClose,
  draftRequest,
}: {
  lang: 'es' | 'en';
  open: boolean;
  /** En páginas con un panel lateral a la derecha, el asistente se abre a la izquierda. */
  alignLeft?: boolean;
  onClose: () => void;
  /** Texto que otra página pidió dejar en el compositor (ver lib/assistant/open). */
  draftRequest?: { id: number; text: string } | null;
}) {
  const t = T[lang];
  const { subscription } = useAuth();
  const { activeBrand } = useBrand();

  // En móvil el panel tapa la página: al navegar desde el chat se cierra.
  const onNavigate = useCallback(() => { if (isMobile()) onClose(); }, [onClose]);
  const a = useAssistant(lang, { onNavigate });

  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canCreate = subscription ? subscription.canCreate : true;
  const composerDisabled = !canCreate;
  // Mientras llega una respuesta o se carga una conversación no se envía: la
  // carga reemplazaría el mensaje recién enviado. Se puede seguir escribiendo.
  const busy = a.streaming || a.loadingConversation;

  // ─── Scroll ────────────────────────────────────────────────────────────────

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [a.messages, a.streaming, view]);

  // Al abrir: foco en el compositor (en escritorio; en móvil abriría el teclado).
  useEffect(() => {
    if (!open || view !== 'chat') return;
    stickRef.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (!isMobile()) inputRef.current?.focus();
  }, [open, view]);

  // ─── Compositor ────────────────────────────────────────────────────────────

  // Borrador pedido desde fuera: solo si el compositor está vacío, para no
  // pisar lo que el usuario estaba escribiendo. No se envía solo.
  const draftRequestId = draftRequest?.id;
  const draftRequestText = draftRequest?.text;
  useEffect(() => {
    if (draftRequestId === undefined || !draftRequestText) return;
    setView('chat');
    setDraft((current) => (current.trim() ? current : draftRequestText.slice(0, MAX_LENGTH)));
    if (!isMobile()) inputRef.current?.focus();
  }, [draftRequestId, draftRequestText]);

  const resize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, LINE_HEIGHT * MAX_ROWS + 16)}px`;
  }, []);
  useLayoutEffect(resize, [draft, resize]);

  const submit = useCallback((text?: string) => {
    const value = (text ?? draft).trim();
    if (!value || busy || composerDisabled) return;
    stickRef.current = true;
    setView('chat');
    void a.send(value);
    if (text === undefined) setDraft('');
  }, [a, busy, draft, composerDisabled]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  function openHistory() {
    if (view === 'history') { setView('chat'); return; }
    setView('history');
    void a.loadConversations();
  }

  function startNew() {
    a.newChat();
    setView('chat');
    setDraft('');
    if (!isMobile()) inputRef.current?.focus();
  }

  const last = a.messages[a.messages.length - 1];
  const showThinking = a.streaming && (!last || last.role === 'user');
  // A la izquierda, el `left` lo pone .assistant-panel--left (globals.css), a
  // la derecha del sidebar de escritorio.
  const alignSide = alignLeft ? {} : { right: 24 };

  return (
    <section
      className={`assistant-panel${alignLeft ? ' assistant-panel--left' : ''}`}
      role="dialog"
      aria-label={t.title}
      style={{
        position: 'fixed', ...alignSide, bottom: 92, width: 380, maxWidth: 'calc(100vw - 32px)',
        height: 'min(600px, calc(100vh - 120px))',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, zIndex: 400,
        display: open ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', color: 'var(--text)',
      }}
    >
      {/* ─── Encabezado ─── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 12px 16px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      }}
      className="assistant-panel-header"
      >
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontFamily: 'var(--font-syne), system-ui, sans-serif', fontWeight: 700, fontSize: 14.5 }}>
            {t.title}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
            {activeBrand && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, maxWidth: 170 }}>
                <BrandAvatar brand={activeBrand} size={16} />
                <span style={{ fontSize: 11.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={t.subtitle(activeBrand.name)}>
                  {activeBrand.name}
                </span>
              </span>
            )}
            {a.usage && (
              <span
                title={t.messagesLeftTitle}
                style={{
                  fontSize: 10.5, padding: '1px 7px', borderRadius: 999, whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-jetbrains), monospace',
                  color: a.usage.remaining > 0 ? 'var(--assistant-accent-text)' : 'var(--muted)',
                  background: a.usage.remaining > 0 ? 'rgba(198,255,75,0.10)' : 'var(--surface-2)',
                  border: `1px solid ${a.usage.remaining > 0 ? 'rgba(198,255,75,0.25)' : 'var(--border)'}`,
                }}
              >
                {t.messagesLeft(a.usage.remaining, a.usage.limit)}
              </span>
            )}
          </div>
        </div>
        <button type="button" style={{ ...iconBtn, color: view === 'history' ? 'var(--assistant-accent-text)' : 'var(--muted)' }}
          onClick={openHistory} aria-label={view === 'history' ? t.back : t.history} title={view === 'history' ? t.back : t.history}
          aria-pressed={view === 'history'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" />
          </svg>
        </button>
        <button type="button" style={iconBtn} onClick={startNew} disabled={a.streaming} aria-label={t.newChat} title={t.newChat}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        <button type="button" style={iconBtn} onClick={onClose} aria-label={t.close} title={t.close}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      {/* ─── Historial ─── */}
      {view === 'history' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {a.conversationsLoading && a.conversations.length === 0 ? (
            <p style={{ padding: 16, fontSize: 13, color: 'var(--muted)' }}>{t.historyLoading}</p>
          ) : a.conversations.length === 0 ? (
            <p style={{ padding: 16, fontSize: 13, color: 'var(--muted)' }}>{t.historyEmpty}</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {a.conversations.map((c) => {
                const active = c.id === a.conversationId;
                return (
                  <li key={c.id} className="assistant-history-row" style={{
                    display: 'flex', alignItems: 'center', gap: 4, borderRadius: 10,
                    background: active ? 'var(--surface-2)' : 'transparent',
                  }}>
                    <button
                      type="button"
                      disabled={a.streaming}
                      onClick={() => { setView('chat'); void a.loadConversation(c.id); }}
                      style={{
                        flex: 1, minWidth: 0, textAlign: 'left', padding: '10px 12px', background: 'transparent',
                        border: 0, cursor: 'pointer', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 2,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.title?.trim() || t.untitled}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{relativeTime(c.last_message_at, lang)}</span>
                    </button>
                    <button
                      type="button"
                      style={{ ...iconBtn, marginRight: 6 }}
                      onClick={() => void a.archiveConversation(c.id)}
                      aria-label={t.delete}
                      title={t.delete}
                      disabled={a.streaming}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        /* ─── Mensajes ─── */
        <div
          ref={scrollRef}
          onScroll={onScroll}
          aria-live="polite"
          aria-busy={a.streaming}
          style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {a.loadingConversation && a.messages.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t.loadingConversation}</p>
          ) : a.messages.length === 0 ? (
            <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
              <div>
                <p style={{ margin: 0, fontFamily: 'var(--font-syne), system-ui, sans-serif', fontWeight: 700, fontSize: 17 }}>
                  {t.emptyTitle}
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{t.emptyHint}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {t.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="assistant-suggestion"
                    disabled={composerDisabled || busy}
                    onClick={() => submit(s)}
                    style={{
                      textAlign: 'left', padding: '9px 12px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.4,
                      border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            a.messages.map((m) => (
              <MessageBubble
                key={m.id}
                lang={lang}
                message={m}
                streaming={a.streaming}
                onConfirm={(id) => void a.confirm(id)}
                onReject={(id) => void a.reject(id)}
                onRetry={(target) => void a.retry(target)}
                onNavigate={onNavigate}
              />
            ))
          )}
          {showThinking && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
              <Spinner /> {t.thinking}
            </div>
          )}
        </div>
      )}

      {/* ─── Compositor ─── */}
      <footer className="assistant-panel-footer" style={{ borderTop: '1px solid var(--border)', padding: 10, background: 'var(--surface)' }}>
        {composerDisabled && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
            {t.disabledNotice}{' '}
            <Link href={`/${lang}/dashboard/settings`} onClick={onNavigate} style={{ color: 'var(--assistant-accent-text)' }}>
              {t.disabledLink}
            </Link>
          </p>
        )}
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 8, padding: 6, borderRadius: 12,
          border: '1px solid var(--border)', background: 'var(--bg)',
        }}>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
            onKeyDown={onKeyDown}
            placeholder={t.placeholder}
            aria-label={t.placeholder}
            maxLength={MAX_LENGTH}
            rows={1}
            disabled={composerDisabled}
            style={{
              flex: 1, resize: 'none', border: 0, outline: 'none', background: 'transparent', color: 'var(--text)',
              fontSize: 13.5, lineHeight: `${LINE_HEIGHT}px`, padding: '4px 6px', maxHeight: LINE_HEIGHT * MAX_ROWS + 16,
              fontFamily: 'inherit', overflowY: 'auto',
            }}
          />
          {a.streaming ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={a.stop} aria-label={t.stop}
              style={{ border: '1px solid var(--border)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
              {t.stop}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => submit()}
              disabled={composerDisabled || busy || !draft.trim()}
              aria-label={t.send}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}
