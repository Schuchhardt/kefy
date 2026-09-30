'use client';

import {
  Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type FormEvent, type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/icons';
import { Input, Textarea } from '@/components/ui/Field';
import { useDataChanged } from '@/lib/data-events';
import { useBrand } from '@/lib/brand-context';
import { toLocale } from '@/lib/i18n';
import { refreshUnreadCount } from '@/hooks/useUnreadCount';

import esInbox from '@/locales/es/dashboard/inbox';
import enInbox from '@/locales/en/dashboard/inbox';
import esEngage from '@/locales/es/dashboard/engage';
import enEngage from '@/locales/en/dashboard/engage';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

import type { MessagingPlatform, ThreadPreview, Message, CommentItem, FilterType } from '@/types/conversations';
import type { SocialAccount } from '@/types/social';
import type { InboxCopy } from '@/locales/es/dashboard/inbox';
import type { EngageCopy } from '@/locales/es/dashboard/engage';

import styles from './page.module.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const TI = { es: esInbox,  en: enInbox  } as const;
const TE = { es: esEngage, en: enEngage } as const;
const TC = { es: esCommon, en: enCommon } as const;

/** Mismo corte que el resto del dashboard (BottomNav, `.page`, CSS del módulo). */
const MOBILE_QUERY = '(max-width: 767px)';

const TABS: FilterType[] = ['dms', 'comments'];

const PLATFORMS: MessagingPlatform[] = ['linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads'];
const PLATFORM_LABELS: Record<MessagingPlatform, string> = {
  linkedin:  'LinkedIn',
  instagram: 'Instagram',
  facebook:  'Facebook',
  twitter:   'X/Twitter',
  tiktok:    'TikTok',
  threads:   'Threads',
};

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform as MessagingPlatform] ?? platform;
}

function isMobileViewport(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(MOBILE_QUERY).matches;
}

function threadKey(accountId: string, platformThreadId: string): string {
  return `${accountId}:${platformThreadId}`;
}

function keyOfThread(thread: ThreadPreview): string {
  return threadKey(thread.kefy_social_accounts.id, thread.platform_thread_id);
}

function timeAgo(iso: string, t: InboxCopy): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return t.timeNow;
  const h = Math.floor(m / 60);
  return t.timeAgo(m, h, Math.floor(h / 24));
}

/** URL actual con otros parámetros de conversación (el resto se conserva). */
function urlWith(changes: Record<string, string | null>): string {
  const qs = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) qs.delete(key); else qs.set(key, value);
  }
  const query = qs.toString();
  return `${window.location.pathname}${query ? `?${query}` : ''}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CommentThread = {
  key: string;
  platform: MessagingPlatform;
  socialAccount: CommentItem['kefy_social_accounts'];
  latestAt: string;
  messages: CommentItem[];
  hasUnanswered: boolean;
  // First external (non-brand) commenter used as conversation avatar/name
  externalAuthor: { id: string; name: string | null; avatar: string | null } | null;
};

/** Resultado de sincronizar: éxito (role=status) o error (role=alert). */
type SyncNotice = { tone: 'success' | 'danger'; text: string } | null;

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ name, src, size = 36 }: { name?: string | null; src?: string | null; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={styles.avatar}
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.42),
        backgroundImage: src ? `url(${JSON.stringify(src)})` : undefined,
      }}
    >
      {!src && (name?.trim()[0]?.toUpperCase() ?? '?')}
    </span>
  );
}

/** Icono de la red con nombre accesible (el `title` es solo un extra). */
function PlatformTag({ platform, size = 12, boxed = false }: { platform: string; size?: number; boxed?: boolean }) {
  const label = platformLabel(platform);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={boxed ? `${styles.platformTag} ${styles.platformTagBoxed}` : styles.platformTag}
    >
      <ChannelIcon name={platform} size={size} />
    </span>
  );
}

function ReplyBox({
  onSend, onCancel, te, cancelLabel,
}: {
  onSend: (text: string) => Promise<{ error?: string } | void>;
  onCancel?: () => void;
  te: EngageCopy;
  cancelLabel: string;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true); setError(null);
    try {
      const result = await onSend(value);
      if (result && 'error' in result) setError(result.error ?? te.errorSend);
      else setText('');
    } catch {
      // Antes un fallo de red dejaba el botón en «...» para siempre.
      setError(te.errorSend);
    } finally {
      setSending(false);
    }
  }

  return (
    <form className={styles.replyBox} onSubmit={handleSubmit}>
      {error && <p role="alert" className={styles.errorText}>{error}</p>}
      <div className={styles.replyRow}>
        <Input
          className={styles.replyInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={te.replyPlaceholder}
          aria-label={te.yourReply}
          disabled={sending}
          // Aparece al pulsar «Responder»: el foco va directo al campo.
          autoFocus
        />
        <Button type="submit" variant="primary" size="sm" loading={sending} disabled={!text.trim()}>
          {te.replyBtnSend}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={sending}>{cancelLabel}</Button>
        )}
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ConversationsPageInner() {
  const { lang } = useParams<{ lang: string }>();
  const locale = toLocale(lang);
  const ti = TI[locale];
  const te = TE[locale];
  const tc = TC[locale];
  const { activeBrand } = useBrand();
  const searchParams = useSearchParams();

  const uid = useId();
  const tabId = (key: FilterType) => `${uid}-tab-${key}`;
  const panelId = `${uid}-panel`;
  const threadTitleId = `${uid}-thread-title`;

  // ── Global filters ──
  // ?tab=dms|comments, ?thread y ?account: enlaces profundos del asistente, y
  // también el hilo abierto (así el botón atrás del navegador vuelve a la lista).
  const deepTab     = searchParams?.get('tab');
  const deepThread  = searchParams?.get('thread') ?? null;
  const deepAccount = searchParams?.get('account') ?? null;
  const deepKey     = deepThread && deepAccount ? threadKey(deepAccount, deepThread) : null;
  const [filterType, setFilterType] = useState<FilterType>(() => (deepTab === 'comments' ? 'comments' : 'dms'));
  const [platformFilter, setPlatformFilter] = useState<MessagingPlatform | 'all'>('all');

  // ── DMs state ──
  const [threads, setThreads]             = useState<ThreadPreview[]>([]);
  // Empieza en `true` (no `false`): fetchThreads recién marca `true` dentro de
  // un useEffect posterior al montaje — con `false` de partida, el primer
  // render mostraba el empty state antes de que el fetch siquiera empezara.
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [unreadOnly, setUnreadOnly]       = useState(false);
  const [activeThread, setActiveThread]   = useState<ThreadPreview | null>(null);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [activeAccount, setActiveAccount] = useState<SocialAccount | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyText, setReplyText]         = useState('');
  const [sending, setSending]             = useState(false);
  const [sendError, setSendError]         = useState<string | null>(null);
  const [syncing, setSyncing]             = useState(false);
  const [dmNotice, setDmNotice]           = useState<SyncNotice>(null);

  const listRef     = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const headingRef  = useRef<HTMLHeadingElement>(null);
  /** El hilo abierto tiene su propia entrada en el historial (se abrió en
   *  móvil): «Volver» hace history.back() en vez de reemplazar la URL. */
  const pushedThread = useRef(false);
  /** Móvil: posición de la lista y el hilo del que se salió, para volver a
   *  dejar la lista como estaba (la lista se oculta mientras se lee un hilo). */
  const listReturn = useRef<{ scrollTop: number; key: string } | null>(null);
  /** Descarta respuestas de un hilo que ya no es el abierto. */
  const openSeq = useRef(0);
  /** Último enlace ?thread&account ya abierto (se abre una vez por enlace). */
  const openedDeepLink = useRef<string | null>(null);

  // ── Comments state ──
  const [comments, setComments]           = useState<CommentItem[]>([]);
  // Mismo motivo que `threadsLoading`: evita el flash del empty state.
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [replyingComment, setReplyingComment] = useState<string | null>(null);
  const [showReplied, setShowReplied]     = useState(true);
  const [syncingComments, setSyncingComments] = useState(false);
  const [commentsNotice, setCommentsNotice] = useState<SyncNotice>(null);
  const [commentModal, setCommentModal]   = useState<CommentThread | null>(null);

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
    // No replied filter — all comments fetched; unanswered filtering happens in commentThreads
    fetch(`/api/comments?${qs.toString()}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json() as { comments: CommentItem[] };
        setComments(json.comments ?? []);
      })
      .catch(() => { /* ignore */ })
      .finally(() => setCommentsLoading(false));
  }, [platformFilter]);

  useEffect(() => {
    if (filterType === 'dms') {
      fetchThreads();
    } else if (filterType === 'comments') {
      fetchComments();
      void handleSyncComments();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, fetchThreads, fetchComments]);

  // ── Hilo abierto ↔ URL ──

  /** Cierra el hilo y vuelve a la lista. Si abrirlo creó una entrada de
   *  historial, se vuelve atrás; si no (escritorio, enlace del asistente), se
   *  quita ?thread de la URL sin salir de la página. */
  const closeThread = useCallback(() => {
    setActiveThread(null);
    openedDeepLink.current = null;
    if (pushedThread.current) {
      pushedThread.current = false;
      window.history.back();
    } else if (new URLSearchParams(window.location.search).has('thread')) {
      window.history.replaceState(null, '', urlWith({ thread: null, account: null }));
    }
  }, []);

  // Cambiar de marca activa no disparaba por sí solo un refetch (mismo bug
  // que en /content): los DMs/comentarios son de las cuentas sociales de la
  // marca anterior hasta que algo más refresque. Más sensible acá que en
  // contenido — es bandeja de mensajes de otra marca, no solo un thumbnail.
  // Al cambiar de una marca a otra se cierra el hilo/comentario abierto (la
  // primera vez que se resuelve la marca no: cerraría un enlace profundo).
  const brandId = activeBrand?.id;
  const previousBrand = useRef(brandId);
  useEffect(() => {
    const previous = previousBrand.current;
    previousBrand.current = brandId;
    if (!brandId) return;
    if (filterType === 'dms') fetchThreads(); else if (filterType === 'comments') fetchComments();
    setCommentModal(null);
    if (previous && previous !== brandId) closeThread();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  // Si el enlace cambia con la página ya abierta (el asistente navega a otra
  // conversación, o atrás/adelante del navegador), se sigue la pestaña pedida.
  useEffect(() => {
    if (deepTab === 'dms' || deepTab === 'comments') setFilterType(deepTab);
  }, [deepTab]);

  // Con ?thread y ?account, al cargar los hilos se abre esa conversación (una
  // vez por enlace).
  useEffect(() => {
    if (!deepKey || filterType !== 'dms') return;
    if (openedDeepLink.current === deepKey) return;
    const match = threads.find((th) => keyOfThread(th) === deepKey);
    if (!match) return;
    openedDeepLink.current = deepKey;
    openThread(match);
  }, [threads, deepKey, filterType]);

  // Si ?thread desaparece de la URL (atrás del navegador), se vuelve a la
  // lista: en móvil el botón atrás no saca de la página.
  const lastDeepKey = useRef(deepKey);
  useEffect(() => {
    const previous = lastDeepKey.current;
    lastDeepKey.current = deepKey;
    if (previous && !deepKey) {
      pushedThread.current = false;
      openedDeepLink.current = null;
      setActiveThread(null);
    }
  }, [deepKey]);

  // Al volver a la lista en móvil: misma posición y el foco en el hilo que se
  // estaba leyendo (la lista estuvo oculta y el navegador pierde ambos).
  useLayoutEffect(() => {
    const back = listReturn.current;
    if (activeThread || !back || !listRef.current) return;
    listReturn.current = null;
    listRef.current.scrollTop = back.scrollTop;
    const items = listRef.current.querySelectorAll<HTMLElement>('[data-thread-key]');
    Array.from(items).find((el) => el.dataset.threadKey === back.key)?.focus({ preventScroll: true });
  }, [activeThread]);

  // Siempre al último mensaje: al abrir el hilo, al enviar y al recargar.
  useEffect(() => {
    const el = messagesRef.current;
    if (el && !threadLoading) el.scrollTop = el.scrollHeight;
  }, [messages, threadLoading]);

  // El asistente respondió o sincronizó: se recargan la lista y el hilo abierto.
  useDataChanged(['inbox'], () => {
    if (filterType === 'dms') fetchThreads();
    else fetchComments();
    if (activeThread) {
      const accountId = activeThread.kefy_social_accounts.id;
      fetch(`/api/messaging/${encodeURIComponent(activeThread.platform_thread_id)}?account_id=${accountId}`,
        { credentials: 'include' })
        .then(async (res) => {
          if (!res.ok) return;
          const json = await res.json() as { messages: Message[] };
          setMessages(json.messages ?? []);
        })
        .catch(() => { /* ignore */ });
    }
  });

  // ── Tabs ──
  function selectTab(key: FilterType) {
    setFilterType(key);
    // La pestaña va a la URL: recargar o volver atrás no la pierde.
    if (new URLSearchParams(window.location.search).get('tab') !== key) {
      window.history.replaceState(null, '', urlWith({ tab: key }));
    }
  }

  function onTabKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    const index = TABS.indexOf(filterType);
    let next: FilterType | undefined;
    if (e.key === 'ArrowRight') next = TABS[(index + 1) % TABS.length];
    else if (e.key === 'ArrowLeft') next = TABS[(index - 1 + TABS.length) % TABS.length];
    else if (e.key === 'Home') next = TABS[0];
    else if (e.key === 'End') next = TABS[TABS.length - 1];
    if (!next) return;
    e.preventDefault();
    selectTab(next);
    document.getElementById(tabId(next))?.focus();
  }

  // ── DM actions ──
  async function handleSync() {
    setSyncing(true); setDmNotice(null);
    try {
      const res = await fetch('/api/messaging/sync', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setDmNotice({ tone: 'danger', text: err.error ?? ti.syncError }); return;
      }
      const json = await res.json() as { synced: number };
      setDmNotice({ tone: 'success', text: ti.syncDone(json.synced) });
      fetchThreads();
      setTimeout(() => setDmNotice((n) => (n?.tone === 'success' ? null : n)), 4000);
    } catch { setDmNotice({ tone: 'danger', text: ti.syncError }); }
    finally { setSyncing(false); }
  }

  function openThread(thread: ThreadPreview) {
    const seq = ++openSeq.current;
    setActiveThread(thread); setMessages([]); setThreadLoading(true);
    setSendError(null); setReplyText('');
    const accountId = thread.kefy_social_accounts.id;
    fetch(`/api/messaging/${encodeURIComponent(thread.platform_thread_id)}?account_id=${accountId}`,
      { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok || seq !== openSeq.current) return;
        const json = await res.json() as { messages: Message[]; account: SocialAccount };
        setMessages(json.messages ?? []); setActiveAccount(json.account);
        setThreads((prev) => prev.map((t) =>
          t.platform_thread_id === thread.platform_thread_id && t.kefy_social_accounts.id === accountId
            ? { ...t, read_at: new Date().toISOString() } : t,
        ));
        // Abrirlo lo marcó como leído: el aviso de la navegación se actualiza ya.
        void refreshUnreadCount();
      })
      .catch(() => { /* ignore */ })
      .finally(() => {
        if (seq === openSeq.current) setThreadLoading(false);
      });
  }

  /** Abrir un hilo desde la lista. En móvil crea una entrada de historial: el
   *  botón atrás del navegador (igual que «Volver») regresa a la lista sin
   *  salir de la página. En escritorio solo actualiza la URL. */
  function selectThread(thread: ThreadPreview) {
    const key = keyOfThread(thread);
    const mobile = isMobileViewport();
    if (mobile) listReturn.current = { scrollTop: listRef.current?.scrollTop ?? 0, key };
    openedDeepLink.current = key;
    openThread(thread);
    const url = urlWith({ tab: 'dms', thread: thread.platform_thread_id, account: thread.kefy_social_accounts.id });
    if (mobile && !pushedThread.current) {
      window.history.pushState(null, '', url);
      pushedThread.current = true;
    } else {
      window.history.replaceState(null, '', url);
    }
    // La lista se oculta: el foco pasa al encabezado del hilo.
    if (mobile) requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  }

  async function handleSend() {
    if (!activeThread || !replyText.trim() || sending) return;
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
        const err = await res.json().catch(() => ({})) as { error?: string };
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
    } catch { setSendError(ti.errorConn); }
    finally { setSending(false); }
  }

  // ── Comment/Review reply actions ──
  async function handleSyncComments() {
    setSyncingComments(true); setCommentsNotice(null);
    try {
      const res = await fetch('/api/comments/sync', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setCommentsNotice({ tone: 'danger', text: err.error ?? te.syncError }); return;
      }
      const json = await res.json() as { synced: number };
      setCommentsNotice({ tone: 'success', text: te.syncDone(json.synced) });
      fetchComments();
      setTimeout(() => setCommentsNotice((n) => (n?.tone === 'success' ? null : n)), 4000);
    } catch { setCommentsNotice({ tone: 'danger', text: te.syncError }); }
    finally { setSyncingComments(false); }
  }

  async function replyComment(commentId: string, text: string): Promise<{ error?: string } | void> {
    const res = await fetch(`/api/comments/${commentId}/reply`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      return { error: err.error ?? te.errorSend };
    }
    setComments((prev) => prev.map((c) =>
      c.id === commentId ? { ...c, replied_at: new Date().toISOString(), reply_body: text } : c,
    ));
    setReplyingComment(null);
    void refreshUnreadCount();
  }

  const dmUnread = threads.filter((t) => !t.read_at && t.direction === 'inbound').length;

  // ─── Group comments by external author ─────────────────────────────────────

  const commentThreads = useMemo<CommentThread[]>(() => {
    const map = new Map<string, CommentThread>();

    for (const c of comments) {
      // Group by post so all messages on the same post form one conversation
      const key = `${c.platform_post_id}::${c.kefy_social_accounts.id}`;
      const isOutbound = c.author_name === c.kefy_social_accounts.username;

      if (!map.has(key)) {
        map.set(key, {
          key,
          platform: c.platform,
          socialAccount: c.kefy_social_accounts,
          latestAt: c.created_at,
          messages: [],
          hasUnanswered: false,
          externalAuthor: null,
        });
      }
      const thread = map.get(key)!;
      thread.messages.push(c);
      if (c.created_at > thread.latestAt) thread.latestAt = c.created_at;
      // Thread is unanswered if any inbound comment has no reply
      if (!isOutbound && !c.replied_at) thread.hasUnanswered = true;
      // Track first external commenter for the thread header
      if (!isOutbound && !thread.externalAuthor) {
        thread.externalAuthor = { id: c.author_id, name: c.author_name, avatar: c.author_avatar };
      }
    }

    // Sort messages chronologically within each thread
    for (const thread of map.values()) {
      thread.messages.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    }

    // When filter is active, only show threads with unanswered inbound comments
    let list = Array.from(map.values());
    if (!showReplied) list = list.filter((t) => t.hasUnanswered);

    return list.sort((a, b) =>
      new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
    );
  }, [comments, showReplied]);

  // ─── Shared header ─────────────────────────────────────────────────────────

  const isDms = filterType === 'dms';
  const notice = isDms ? dmNotice : commentsNotice;
  const isSyncing = isDms ? syncing : syncingComments;

  const header = (
    <div className={styles.header}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{ti.title}</h1>
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="refresh" size={14} />}
          loading={isSyncing}
          disabled={isDms ? threadsLoading : commentsLoading}
          onClick={() => void (isDms ? handleSync() : handleSyncComments())}
        >
          {isDms ? (syncing ? ti.syncing : ti.syncBtn) : (syncingComments ? te.syncing : te.syncBtn)}
        </Button>
      </div>

      <div className={styles.filters}>
        {/* DMs / Comentarios cambian el panel de abajo: pestañas de verdad. */}
        <div role="tablist" aria-label={ti.tabsLabel} className={styles.tabs}>
          {TABS.map((key) => {
            const selected = filterType === key;
            const badge = key === 'dms' ? dmUnread : 0;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={tabId(key)}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                className={styles.tab}
                onClick={() => selectTab(key)}
                onKeyDown={onTabKeyDown}
              >
                {key === 'dms' ? ti.tabDms : te.tabComments}
                {badge > 0 && (
                  <>
                    <span className="ui-count" aria-hidden="true">{badge}</span>
                    <span className="sr-only">{`, ${ti.unreadCount(badge)}`}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        <div className="ui-segmented">
          {isDms ? (
            <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly((v) => !v)}>
              {ti.unreadOnly}
            </button>
          ) : (
            <button type="button" aria-pressed={!showReplied} onClick={() => setShowReplied((v) => !v)}>
              {te.unansweredOnly}
            </button>
          )}
        </div>

        <div role="group" aria-label={ti.platformFilterLabel} className={`ui-segmented ${styles.platforms}`}>
          <button type="button" aria-pressed={platformFilter === 'all'} onClick={() => setPlatformFilter('all')}>
            {ti.all}
          </button>
          {PLATFORMS.map((platform) => (
            <button
              key={platform}
              type="button"
              className={styles.platformBtn}
              aria-pressed={platformFilter === platform}
              aria-label={platformLabel(platform)}
              title={platformLabel(platform)}
              onClick={() => setPlatformFilter(platform)}
            >
              <ChannelIcon name={platform} size={14} />
            </button>
          ))}
        </div>
      </div>

      {/* Regiones vivas siempre montadas: así el lector de pantalla anuncia el
          resultado de sincronizar. */}
      <p role="status" className={`${styles.notice} ${styles.noticeOk}`}>
        {notice?.tone === 'success' ? notice.text : ''}
      </p>
      <p role="alert" className={`${styles.notice} ${styles.noticeError}`}>
        {notice?.tone === 'danger' ? notice.text : ''}
      </p>
    </div>
  );

  // ─── DMs view (master-detail) ──────────────────────────────────────────────

  if (filterType === 'dms') {
    return (
      <div className={styles.root} data-view={activeThread ? 'thread' : 'list'}>
        {header}
        <div role="tabpanel" id={panelId} aria-labelledby={tabId('dms')} className={styles.split}>
          {/* Thread list */}
          <div ref={listRef} className={styles.list} aria-busy={threadsLoading}>
            {threadsLoading && threads.length === 0 && (
              <>
                <p role="status" className="sr-only">{ti.loading}</p>
                <div aria-hidden="true">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className={styles.skeletonRow}>
                      <SkeletonBlock width={36} height={36} borderRadius={18} style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <SkeletonBlock width="50%" height={11} style={{ marginBottom: 6 }} />
                        <SkeletonBlock width="80%" height={10} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {!threadsLoading && threads.length === 0 && (
              unreadOnly
                ? <EmptyState icon={<Icon name="check-circle" size={36} strokeWidth={1.5} />} title={ti.noUnread} hint={ti.noUnreadHint} />
                : <EmptyState icon={<Icon name="mail" size={36} strokeWidth={1.5} />} title={ti.noMessages} hint={ti.noMessagesHint} />
            )}
            {threads.length > 0 && (
              <ul className={styles.threadList} aria-label={ti.threadListLabel}>
                {threads.map((thread) => {
                  const key = keyOfThread(thread);
                  const isUnread = !thread.read_at && thread.direction === 'inbound';
                  const isActive = activeThread !== null && keyOfThread(activeThread) === key;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className={styles.threadItem}
                        data-thread-key={key}
                        data-unread={isUnread ? 'true' : undefined}
                        aria-current={isActive ? 'true' : undefined}
                        onClick={() => selectThread(thread)}
                      >
                        <Avatar name={thread.sender_name} src={thread.sender_avatar} />
                        <span className={styles.threadText}>
                          <span className={styles.threadTop}>
                            <span className={styles.threadName}>{thread.sender_name ?? thread.sender_id}</span>
                            <span className={styles.threadTime}>{timeAgo(thread.created_at, ti)}</span>
                          </span>
                          <span className={styles.threadBottom}>
                            <span aria-hidden="true" className={styles.platformTag}>
                              <ChannelIcon name={thread.platform} size={12} />
                            </span>
                            <span className="sr-only">{`${platformLabel(thread.platform)}: `}</span>
                            <span className={styles.threadPreview}>
                              {thread.body.slice(0, 50)}{thread.body.length > 50 ? '…' : ''}
                            </span>
                            {isUnread && (
                              <>
                                <span className={styles.unreadDot} aria-hidden="true" />
                                <span className="sr-only">{`, ${ti.unread}`}</span>
                              </>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Conversation panel */}
          <section className={styles.panel} aria-labelledby={activeThread ? threadTitleId : undefined}>
            {!activeThread ? (
              <div className={styles.panelEmpty}>
                <EmptyState icon={<Icon name="inbox" size={32} strokeWidth={1.5} />} title={ti.selectMessage} compact />
              </div>
            ) : (
              <>
                <div className={styles.threadHeader}>
                  <Button
                    variant="ghost"
                    iconOnly
                    className={styles.back}
                    aria-label={ti.backToList}
                    icon={<Icon name="arrow-left" size={20} />}
                    onClick={closeThread}
                  />
                  <Avatar name={activeThread.sender_name} src={activeThread.sender_avatar} />
                  <div className={styles.threadHeading}>
                    <h2 id={threadTitleId} ref={headingRef} tabIndex={-1} className={styles.threadHeadingName}>
                      {activeThread.sender_name ?? activeThread.sender_id}
                    </h2>
                    <p className={styles.threadHeadingMeta}>
                      <PlatformTag platform={activeThread.platform} />
                      {activeAccount && <span>@{activeAccount.username}</span>}
                    </p>
                  </div>
                </div>

                <div ref={messagesRef} className={styles.messages}>
                  {threadLoading && <p role="status" className={styles.statusText}>{ti.loadingConvo}</p>}
                  {!threadLoading && messages.map((msg) => {
                    const dir = msg.direction === 'outbound' ? 'out' : 'in';
                    return (
                      <div key={msg.id} className={styles.bubbleRow} data-dir={dir}>
                        <div className={styles.bubble} data-dir={dir}>
                          {dir === 'in' && msg.sender_name && (
                            <p className={styles.bubbleAuthor}>{msg.sender_name}</p>
                          )}
                          <p className={styles.bubbleText}>{msg.body}</p>
                          <p className={styles.bubbleTime}>{timeAgo(msg.created_at, ti)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form
                  className={styles.composer}
                  onSubmit={(e) => { e.preventDefault(); void handleSend(); }}
                >
                  {sendError && <p role="alert" className={styles.errorText}>{sendError}</p>}
                  <div className={styles.composerRow}>
                    <Textarea
                      className={styles.composerInput}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          void handleSend();
                        }
                      }}
                      placeholder={ti.replyPlaceholder}
                      aria-label={ti.replyLabel}
                      rows={2}
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      loading={sending}
                      disabled={!replyText.trim()}
                      aria-label={ti.sendBtn}
                      icon={<Icon name="send" size={16} />}
                    >
                      <span className={styles.sendLabel}>{ti.sendBtn}</span>
                    </Button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ─── Comments view ─────────────────────────────────────────────────────────

  // Render conversation bubbles.
  // Outbound (brand) comments skip if their body already appears as an inline reply_body
  // to avoid showing the same message twice.
  function renderBubbles(list: CommentItem[], socialAccountUsername: string) {
    // Collect reply bodies already shown inline so we can dedup outbound comments
    const inlineReplied = new Set(
      list.flatMap((c) => (c.reply_body ? [c.reply_body.trim()] : [])),
    );

    return list.map((c) => {
      const isOutbound = c.author_name === socialAccountUsername;

      // Skip outbound comment if it's a duplicate of an inline reply already shown
      if (isOutbound && inlineReplied.has(c.body.trim())) return null;

      if (isOutbound) {
        /* Outbound (brand) bubble — right-aligned */
        return (
          <div key={c.id} className={styles.bubbleRow} data-dir="out">
            <div className={styles.bubble} data-dir="out">
              {list.length > 1 && (
                <p className={styles.bubbleReplyLabel}>{te.yourReply} · {timeAgo(c.created_at, ti)}</p>
              )}
              <p className={styles.bubbleText}>{c.body}</p>
            </div>
          </div>
        );
      }

      /* Inbound (external user) bubble — left-aligned */
      return (
        <div key={c.id} className={styles.bubbleGroup}>
          <div className={styles.bubbleRow}>
            <div className={`${styles.bubble} ${styles.bubbleInbound}`}>
              {list.length > 1 && (
                <p className={styles.bubbleTime} style={{ margin: '0 0 4px' }}>{timeAgo(c.created_at, ti)}</p>
              )}
              <p className={styles.bubbleText}>{c.body}</p>
            </div>
          </div>
          {/* Inline reply (stored in DB, no matching outbound comment synced yet) */}
          {c.replied_at && c.reply_body && (
            <div className={styles.bubbleRow} data-dir="out">
              <div className={styles.bubble} data-dir="out">
                <p className={styles.bubbleReplyLabel}>{te.yourReply} · {timeAgo(c.replied_at, ti)}</p>
                <p className={styles.bubbleText}>{c.reply_body}</p>
              </div>
            </div>
          )}
        </div>
      );
    });
  }

  const modalUsername = commentModal?.socialAccount.username ?? '';
  const modalName = commentModal ? (commentModal.externalAuthor?.name ?? commentModal.socialAccount.username) : '';
  // «Responder» apunta al último comentario entrante sin respuesta (nunca a
  // uno de la propia marca), igual que en la tarjeta.
  const modalLastUnanswered = commentModal
    ? ([...commentModal.messages].reverse().find((c) => c.author_name !== modalUsername && !c.replied_at) ?? null)
    : null;
  const modalIsReplying = modalLastUnanswered !== null && replyingComment === modalLastUnanswered.id;

  return (
    <div className={styles.root} data-view="list">
      {header}
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId('comments')}
        aria-busy={commentsLoading}
        className={styles.commentsScroll}
      >
        {commentsLoading && commentThreads.length === 0 && (
          <>
            <p role="status" className="sr-only">{te.loadingComments}</p>
            <div aria-hidden="true" className={styles.commentsList}>
              {[...Array(4)].map((_, i) => (
                <div key={i} className={styles.skeletonCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <SkeletonBlock width={32} height={32} borderRadius={16} style={{ flexShrink: 0 }} />
                    <SkeletonBlock width={120} height={11} />
                  </div>
                  <SkeletonBlock width="90%" height={10} style={{ marginBottom: 6 }} />
                  <SkeletonBlock width="60%" height={10} />
                </div>
              ))}
            </div>
          </>
        )}
        {!commentsLoading && commentThreads.length === 0 && (
          <div className={styles.emptyCard} style={{ maxWidth: 860 }}>
            {showReplied
              ? <EmptyState icon={<Icon name="comment" size={36} strokeWidth={1.5} />} title={te.noComments} hint={te.noCommentsHint} />
              : <EmptyState icon={<Icon name="check-circle" size={36} strokeWidth={1.5} />} title={te.noCommentsCaughtUp} hint={te.noCommentsCaughtUpHint} />}
          </div>
        )}
        {commentThreads.length > 0 && (
          <ul className={styles.commentsList} aria-label={te.commentsListLabel}>
            {commentThreads.map((thread, index) => {
              const username = thread.socialAccount.username ?? '';
              // Build visible messages: outbound dedup is handled inside renderBubbles
              const preview = thread.messages.slice(-2);
              const hiddenCount = thread.messages.length - preview.length;
              // "Responder" targets the last unanswered inbound comment
              const lastUnanswered = [...thread.messages]
                .reverse()
                .find((c) => c.author_name !== username && !c.replied_at) ?? null;
              const isReplying = lastUnanswered !== null && replyingComment === lastUnanswered.id;
              const headerName = thread.externalAuthor?.name ?? username;
              const headingId = `${uid}-comment-${index}`;
              return (
                <li key={thread.key}>
                  <article className={styles.commentCard} aria-labelledby={headingId}>
                    <div className={styles.commentHead}>
                      <Avatar name={headerName} src={thread.externalAuthor?.avatar} size={32} />
                      <h2 id={headingId} className={styles.commentAuthor}>{headerName}</h2>
                      <PlatformTag platform={thread.platform} size={11} boxed />
                      <span className={styles.commentTime}>{timeAgo(thread.latestAt, ti)}</span>
                    </div>

                    {hiddenCount > 0 && (
                      <button type="button" className={styles.linkBtn} onClick={() => setCommentModal(thread)}>
                        {te.viewEarlier(hiddenCount)}
                      </button>
                    )}

                    {/* Last 2 message bubbles */}
                    <div className={styles.bubbles}>
                      {renderBubbles(preview, username)}
                    </div>

                    <div className={styles.commentActions}>
                      {lastUnanswered && (
                        isReplying ? (
                          <ReplyBox
                            te={te}
                            cancelLabel={tc.actions.cancel}
                            onCancel={() => setReplyingComment(null)}
                            onSend={(text) => replyComment(lastUnanswered.id, text)}
                          />
                        ) : (
                          <Button variant="secondary" size="sm" onClick={() => setReplyingComment(lastUnanswered.id)}>
                            {te.replyBtn}
                          </Button>
                        )
                      )}
                      <Button variant="ghost" size="sm" className={styles.pushRight} onClick={() => setCommentModal(thread)}>
                        {te.viewConversation}
                      </Button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Conversation modal ── */}
      <Modal
        open={commentModal !== null}
        onClose={() => setCommentModal(null)}
        maxWidth={600}
        closeLabel={tc.actions.close}
        title={commentModal && (
          <span className={styles.modalTitle}>
            <Avatar name={modalName} src={commentModal.externalAuthor?.avatar} size={30} />
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{modalName}</span>
          </span>
        )}
        subtitle={commentModal && (
          <span className={styles.threadHeadingMeta}>
            <span aria-hidden="true" style={{ display: 'inline-flex' }}><ChannelIcon name={commentModal.platform} size={12} /></span>
            {platformLabel(commentModal.platform)}
          </span>
        )}
        footer={modalLastUnanswered ? (
          modalIsReplying ? (
            <div className={styles.modalReply}>
              <ReplyBox
                te={te}
                cancelLabel={tc.actions.cancel}
                onCancel={() => setReplyingComment(null)}
                onSend={async (text) => {
                  const result = await replyComment(modalLastUnanswered.id, text);
                  if (!result) {
                    // Update modal thread messages optimistically
                    setCommentModal((prev) => prev
                      ? { ...prev, messages: prev.messages.map((c) =>
                          c.id === modalLastUnanswered.id
                            ? { ...c, replied_at: new Date().toISOString(), reply_body: text }
                            : c,
                        ), hasUnanswered: false }
                      : null,
                    );
                  }
                  return result;
                }}
              />
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setReplyingComment(modalLastUnanswered.id)}>
              {te.replyBtn}
            </Button>
          )
        ) : undefined}
      >
        <div className={styles.modalBody}>
          {commentModal && renderBubbles(commentModal.messages, modalUsername)}
        </div>
      </Modal>
    </div>
  );
}

export default function ConversationsPage() {
  // useSearchParams (enlaces profundos) necesita un límite de Suspense.
  return (
    <Suspense fallback={null}>
      <ConversationsPageInner />
    </Suspense>
  );
}
