'use client';

// ─── Estado del chat del asistente ───────────────────────────────────────────
//
// Un hook para el panel del widget: mensajes, streaming, confirmaciones,
// historial y cuota de mensajes. Los eventos SSE (lib/assistant/types.ts) se
// aplican sobre `messages` a medida que llegan.
//
// Reglas de seguridad del cliente:
// - `ui_action` solo navega dentro de /{lang}/dashboard (el servidor ya
//   construye esos href, pero el cliente no confía a ciegas).
// - Mandar un mensaje nuevo con confirmaciones pendientes las cancela en el
//   servidor (`superseded`); aquí se reflejan como canceladas cuando llega
//   `message_start`, que prueba que el servidor aceptó el turno. Si la guardia
//   lo rechaza (402/429) o falla la red, las tarjetas siguen pendientes.
// - Mientras se carga una conversación no se envía ni se decide nada: la
//   respuesta de la carga reemplazaría los mensajes del stream en curso.

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useBrand } from '@/lib/brand-context';
import { emitDataChanged } from '@/lib/data-events';
import { AuthExpiredError, SpendError, streamChat, streamDecision } from '@/lib/assistant/client';
import type { SseEvent, ToolLink } from '@/lib/assistant/types';

/**
 * `unsettled`: herramienta del historial que todavía no tiene resultado (la
 * acción seguía corriendo al cargar, o la función murió). No hay stream que
 * la actualice, así que no gira.
 */
export type ToolPartStatus = 'running' | 'done' | 'error' | 'pending' | 'rejected' | 'expired' | 'unsettled';
/** `unknown`: el stream de la decisión se cortó antes del resultado. */
export type ConfirmState = 'pending' | 'working' | 'confirmed' | 'cancelled' | 'expired' | 'failed' | 'unknown';

/** Qué repite el botón «Reintentar» de una tarjeta de bloqueo. */
export type RetryTarget =
  | { kind: 'chat'; text: string }
  | { kind: 'decision'; actionId: string; decision: 'confirm' | 'reject' };

export type UiPart =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; toolUseId: string; name: string; status: ToolPartStatus; links?: ToolLink[]; error?: string }
  | {
      kind: 'confirm';
      actionId: string;
      toolUseId: string;
      name: string;
      summary: string;
      preview: Record<string, unknown>;
      credits: number;
      expiresAt: string;
      state: ConfirmState;
      links?: ToolLink[];
      error?: string;
    }
  | { kind: 'spend'; status: number; body: Record<string, unknown>; retry?: RetryTarget }
  | { kind: 'error'; code: 'network' | 'refusal' | 'step_limit' | 'provider' | 'generic'; message?: string };

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  /** Texto plano del mensaje (del usuario, o el texto acumulado del asistente). */
  text: string;
  parts: UiPart[];
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  last_message_at: string;
  brand_id: string | null;
}

export interface AssistantUsage {
  used: number;
  limit: number;
  remaining: number;
}

interface DisplayTool {
  toolUseId: string;
  name: string;
  status: 'done' | 'error' | 'pending' | 'rejected' | 'expired';
  links?: ToolLink[];
  error?: string;
}
interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  tools: DisplayTool[];
}
interface PendingActionView {
  actionId: string;
  toolUseId: string | null;
  name: string;
  summary: string;
  preview: Record<string, unknown>;
  credits: number;
  expiresAt: string;
}

const CONVERSATION_KEY = 'kefy-assistant-conversation';

let seq = 0;
const localId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function readStored(): string | null {
  try { return sessionStorage.getItem(CONVERSATION_KEY); } catch { return null; }
}
function writeStored(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(CONVERSATION_KEY, id);
    else sessionStorage.removeItem(CONVERSATION_KEY);
  } catch {
    // Almacenamiento bloqueado: la conversación simplemente no se recuerda.
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function hasSpendFlags(body: Record<string, unknown> | undefined): boolean {
  return !!body && (
    body.subscriptionRequired === true
    || body.creditsExhausted === true
    || body.assistantQuotaExhausted === true
    || typeof body.retryAfter === 'number'
  );
}

/** Mensajes del servidor → mensajes del widget, con las tarjetas pendientes en su sitio. */
function fromDisplay(messages: DisplayMessage[], pending: PendingActionView[]): UiMessage[] {
  const byToolUse = new Map(pending.filter((p) => p.toolUseId).map((p) => [p.toolUseId as string, p]));
  const placed = new Set<string>();

  const out: UiMessage[] = messages.map((m) => {
    if (m.role === 'user') return { id: m.id, role: 'user', text: m.text, parts: [{ kind: 'text', text: m.text }] };
    const parts: UiPart[] = [];
    if (m.text.trim()) parts.push({ kind: 'text', text: m.text });
    for (const tool of m.tools) {
      const p = byToolUse.get(tool.toolUseId);
      if (p && tool.status === 'pending') {
        placed.add(p.actionId);
        parts.push({
          kind: 'confirm', actionId: p.actionId, toolUseId: tool.toolUseId, name: p.name, summary: p.summary,
          preview: p.preview ?? {}, credits: p.credits ?? 0, expiresAt: p.expiresAt, state: 'pending',
        });
      } else {
        // Sin tarjeta pendiente, «pending» es una acción que no terminó al
        // cargar: se muestra sin spinner, porque nada la va a actualizar.
        const status: ToolPartStatus = tool.status === 'pending' ? 'unsettled' : tool.status;
        parts.push({ kind: 'tool', toolUseId: tool.toolUseId, name: tool.name, status, links: tool.links, error: tool.error });
      }
    }
    return { id: m.id, role: 'assistant', text: m.text, parts };
  });

  const orphans = pending.filter((p) => !placed.has(p.actionId));
  if (orphans.length > 0) {
    out.push({
      id: localId('pending'),
      role: 'assistant',
      text: '',
      parts: orphans.map((p) => ({
        kind: 'confirm' as const, actionId: p.actionId, toolUseId: p.toolUseId ?? p.actionId, name: p.name,
        summary: p.summary, preview: p.preview ?? {}, credits: p.credits ?? 0, expiresAt: p.expiresAt, state: 'pending' as const,
      })),
    });
  }
  return out;
}

export function useAssistant(lang: 'es' | 'en', opts: { onNavigate?: () => void } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { refresh: refreshAuth, logout } = useAuth();
  const { activeBrand } = useBrand();

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [usage, setUsage] = useState<AssistantUsage | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  /** Carga de una conversación en curso (una sola a la vez: la última gana). */
  const loadAbortRef = useRef<AbortController | null>(null);
  /** Qué reintentar si el stream en curso termina en una tarjeta de bloqueo. */
  const retryTargetRef = useRef<RetryTarget | undefined>(undefined);
  /** Mensaje del asistente que recibe los eventos del stream en curso. */
  const currentRef = useRef<string | null>(null);
  const conversationRef = useRef<string | null>(null);
  /** Alguna herramienta terminó en este stream (pudo gastar créditos). */
  const toolsRanRef = useRef(false);
  const onNavigateRef = useRef(opts.onNavigate);
  useEffect(() => { onNavigateRef.current = opts.onNavigate; });

  // Espejo síncrono de `messages`: los eventos SSE llegan fuera del render y
  // necesitan saber al instante si una parte ya existe (tool_start de una
  // tarjeta confirmada, confirmation_required sobre su chip).
  const messagesRef = useRef<UiMessage[]>([]);
  const commit = useCallback((fn: (prev: UiMessage[]) => UiMessage[]) => {
    const next = fn(messagesRef.current);
    if (next === messagesRef.current) return;
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const setConversationId = useCallback((id: string | null) => {
    conversationRef.current = id;
    setConversationIdState(id);
    writeStored(id);
  }, []);

  // ─── Helpers sobre messages ────────────────────────────────────────────────

  /** Añade una parte al mensaje del asistente en curso (lo crea si hace falta). */
  const pushPart = useCallback((part: UiPart) => {
    commit((prev) => {
      const id = currentRef.current;
      const idx = id ? prev.findIndex((m) => m.id === id) : -1;
      if (idx === -1) {
        const newId = localId('a');
        currentRef.current = newId;
        return [...prev, { id: newId, role: 'assistant', text: part.kind === 'text' ? part.text : '', parts: [part] }];
      }
      const m = prev[idx];
      const next = [...prev];
      next[idx] = { ...m, text: part.kind === 'text' ? m.text + part.text : m.text, parts: [...m.parts, part] };
      return next;
    });
  }, [commit]);

  /** Actualiza la parte (chip o tarjeta) de un tool_use, esté en el mensaje que esté. */
  const updateToolPart = useCallback((toolUseId: string, fn: (p: UiPart) => UiPart | null): boolean => {
    let found = false;
    commit((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        const m = prev[i];
        const j = m.parts.findIndex((p) => (p.kind === 'tool' || p.kind === 'confirm') && p.toolUseId === toolUseId);
        if (j === -1) continue;
        found = true;
        const replaced = fn(m.parts[j]);
        const parts = [...m.parts];
        if (replaced) parts[j] = replaced;
        else parts.splice(j, 1);
        const next = [...prev];
        next[i] = { ...m, parts };
        return next;
      }
      return prev;
    });
    return found;
  }, [commit]);

  const setConfirmState = useCallback((actionId: string, state: ConfirmState) => {
    commit((prev) => prev.map((m) => {
      if (!m.parts.some((p) => p.kind === 'confirm' && p.actionId === actionId)) return m;
      return {
        ...m,
        parts: m.parts.map((p) => (p.kind === 'confirm' && p.actionId === actionId ? { ...p, state } : p)),
      };
    }));
  }, [commit]);

  // ─── Eventos SSE ───────────────────────────────────────────────────────────

  const handleEvent = useCallback((e: SseEvent) => {
    switch (e.type) {
      case 'message_start':
        if (e.conversationId && e.conversationId !== conversationRef.current) setConversationId(e.conversationId);
        break;

      case 'text_delta': {
        if (!e.text) break;
        commit((prev) => {
          const id = currentRef.current;
          const idx = id ? prev.findIndex((m) => m.id === id) : -1;
          if (idx === -1) {
            const text = e.text.replace(/^\s+/, '');
            if (!text) return prev;
            const newId = localId('a');
            currentRef.current = newId;
            return [...prev, { id: newId, role: 'assistant', text, parts: [{ kind: 'text', text }] }];
          }
          const m = prev[idx];
          const parts = [...m.parts];
          const last = parts[parts.length - 1];
          if (last?.kind === 'text') {
            parts[parts.length - 1] = { kind: 'text', text: last.text + e.text };
          } else {
            // Tras un chip, el separador «\n\n» del servidor sobra.
            const text = e.text.replace(/^\s+/, '');
            if (!text) return prev;
            parts.push({ kind: 'text', text });
          }
          const next = [...prev];
          next[idx] = { ...m, text: m.text + e.text, parts };
          return next;
        });
        break;
      }

      case 'tool_start': {
        const existing = updateToolPart(e.toolUseId, (p) => {
          if (p.kind === 'confirm') return { ...p, state: 'working' };
          if (p.kind === 'tool') return { ...p, status: 'running' };
          return p;
        });
        if (!existing) pushPart({ kind: 'tool', toolUseId: e.toolUseId, name: e.name, status: 'running' });
        break;
      }

      case 'tool_end':
        toolsRanRef.current = true;
        updateToolPart(e.toolUseId, (p) => {
          const error = e.ok ? undefined : e.error?.message;
          if (p.kind === 'confirm') {
            const state: ConfirmState = e.ok ? 'confirmed' : e.error?.code === 'rejected' ? 'cancelled' : 'failed';
            return { ...p, state, links: e.links, error };
          }
          if (p.kind === 'tool') return { ...p, status: e.ok ? 'done' : 'error', links: e.links, error };
          return p;
        });
        break;

      case 'confirmation_required': {
        const card: UiPart = {
          kind: 'confirm', actionId: e.actionId, toolUseId: e.toolUseId, name: e.name, summary: e.summary,
          preview: e.preview ?? {}, credits: e.credits ?? 0, expiresAt: e.expiresAt, state: 'pending',
        };
        // El chip «ejecutando…» que abrió tool_start se convierte en la tarjeta.
        const replaced = updateToolPart(e.toolUseId, () => card);
        if (!replaced) pushPart(card);
        break;
      }

      case 'ui_action': {
        const href = e.action?.href ?? '';
        const prefix = `/${lang}/dashboard`;
        if (e.action?.type === 'navigate' && (href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`))) {
          router.push(href);
          onNavigateRef.current?.();
        }
        break;
      }

      case 'data_changed':
        emitDataChanged(e.entities ?? []);
        break;

      case 'error':
        if (hasSpendFlags(e.body)) {
          pushPart({ kind: 'spend', status: e.status ?? 429, body: e.body ?? {}, retry: retryTargetRef.current });
        } else if (e.code === 'refusal') {
          pushPart({ kind: 'error', code: 'refusal' });
        } else {
          pushPart({ kind: 'error', code: e.code === 'provider_error' ? 'provider' : 'generic', message: e.message });
        }
        break;

      case 'done':
        if (e.usage) setUsage(e.usage);
        if (e.reason === 'step_limit') pushPart({ kind: 'error', code: 'step_limit' });
        break;
    }
  }, [commit, lang, router, pushPart, updateToolPart, setConversationId]);

  // ─── Streams ───────────────────────────────────────────────────────────────

  const runStream = useCallback(async (
    start: (signal: AbortSignal) => Promise<void>,
    retryTarget: RetryTarget,
    onSpendError?: (err: SpendError) => boolean,
  ) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    retryTargetRef.current = retryTarget;
    currentRef.current = null;
    toolsRanRef.current = false;
    setStreaming(true);
    try {
      await start(ctrl.signal);
    } catch (err) {
      if (isAbort(err) || ctrl.signal.aborted) {
        // Detenido por el usuario: lo ya recibido queda como está.
      } else if (err instanceof AuthExpiredError) {
        await logout();
      } else if (err instanceof SpendError) {
        if (!onSpendError?.(err)) pushPart({ kind: 'spend', status: err.status, body: err.body, retry: retryTarget });
      } else {
        pushPart({ kind: 'error', code: 'network' });
      }
    } finally {
      // Chips que quedaron girando (stream cortado): ya no van a terminar aquí.
      const cutId = currentRef.current;
      if (cutId) {
        commit((prev) => prev.map((m) => (m.id !== cutId ? m : {
          ...m,
          parts: m.parts.map((p) => (p.kind === 'tool' && p.status === 'running' ? { ...p, status: 'error' as const } : p)),
        })));
      }
      if (abortRef.current === ctrl) abortRef.current = null;
      currentRef.current = null;
      setStreaming(false);
      // Las herramientas pueden haber gastado créditos: se refresca el saldo.
      if (toolsRanRef.current) void refreshAuth();
    }
  }, [commit, logout, pushPart, refreshAuth]);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim().slice(0, 4000);
    if (!text || abortRef.current || loadAbortRef.current) return;

    // Las tarjetas sin decidir quedan canceladas en el servidor al escribir,
    // pero solo si el servidor acepta el turno (message_start). Si la guardia
    // lo rechaza, siguen pendientes allí y aquí.
    const pendingIds = new Set<string>();
    for (const m of messagesRef.current) {
      for (const p of m.parts) if (p.kind === 'confirm' && p.state === 'pending') pendingIds.add(p.actionId);
    }
    commit((prev) => [...prev, { id: localId('u'), role: 'user', text, parts: [{ kind: 'text', text }] }]);

    let superseded = false;
    const onEvent = (e: SseEvent) => {
      if (e.type === 'message_start' && !superseded) {
        superseded = true;
        if (pendingIds.size > 0) {
          commit((prev) => prev.map((m) => (m.parts.some((p) => p.kind === 'confirm' && p.state === 'pending' && pendingIds.has(p.actionId))
            ? {
              ...m,
              parts: m.parts.map((p) => (p.kind === 'confirm' && p.state === 'pending' && pendingIds.has(p.actionId)
                ? { ...p, state: 'cancelled' as const }
                : p)),
            }
            : m)));
        }
      }
      handleEvent(e);
    };

    let timezone: string | undefined;
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { timezone = undefined; }

    await runStream(
      (signal) => streamChat({
        message: text,
        conversationId: conversationRef.current ?? undefined,
        brandId: activeBrand?.id,
        language: lang,
        page: pathname?.slice(0, 200),
        timezone: timezone?.slice(0, 64),
      }, { signal, onEvent }),
      { kind: 'chat', text },
      (err) => {
        // Conversación archivada o de otra sesión: se empieza una nueva.
        if (err.status === 404 && conversationRef.current) setConversationId(null);
        return false;
      },
    );
  }, [commit, activeBrand?.id, handleEvent, lang, pathname, runStream, setConversationId]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const decide = useCallback(async (actionId: string, decision: 'confirm' | 'reject') => {
    if (abortRef.current || loadAbortRef.current) return;
    setConfirmState(actionId, 'working');
    await runStream(
      (signal) => streamDecision(actionId, decision, lang, { signal, onEvent: handleEvent }),
      { kind: 'decision', actionId, decision },
      (err) => {
        if (err.status === 409) {
          setConfirmState(actionId, 'expired');
          return true;
        }
        setConfirmState(actionId, 'pending');
        return false;
      },
    );
    // El stream terminó (Detener, red caída, error del servidor) sin tool_end
    // para la tarjeta: la acción pudo ejecutarse o no. No se deja girando.
    const stillWorking = messagesRef.current.some((m) => m.parts.some(
      (p) => p.kind === 'confirm' && p.actionId === actionId && p.state === 'working',
    ));
    if (stillWorking) setConfirmState(actionId, 'unknown');
  }, [handleEvent, lang, runStream, setConfirmState]);

  /**
   * Repite lo que terminó en una tarjeta de bloqueo (rate limit, 503): el
   * mensaje del chat o la decisión sobre una confirmación, según de dónde vino.
   */
  const retry = useCallback(async (target: RetryTarget) => {
    if (abortRef.current || loadAbortRef.current) return;
    // Se quita el intento fallido: las tarjetas de error del final y, si era
    // un mensaje, el mensaje del usuario que las provocó.
    commit((prev) => {
      let end = prev.length;
      while (end > 0 && prev[end - 1].role === 'assistant' && prev[end - 1].parts.every((p) => p.kind === 'spend' || p.kind === 'error')) end--;
      if (target.kind === 'chat' && end > 0 && prev[end - 1].role === 'user' && prev[end - 1].text === target.text) end--;
      return prev.slice(0, end);
    });
    if (target.kind === 'chat') await send(target.text);
    else await decide(target.actionId, target.decision);
  }, [commit, decide, send]);

  const confirm = useCallback((actionId: string) => decide(actionId, 'confirm'), [decide]);
  const reject = useCallback((actionId: string) => decide(actionId, 'reject'), [decide]);

  // ─── Historial ─────────────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    setConversationsLoading(true);
    try {
      const res = await fetch('/api/assistant/conversations?limit=30', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { conversations?: ConversationSummary[]; usage?: AssistantUsage | null };
      setConversations(data.conversations ?? []);
      if (data.usage) setUsage(data.usage);
    } catch {
      // Sin red: el historial queda como estaba.
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    if (abortRef.current) return;
    // Solo cuenta la última carga: una respuesta lenta de otra conversación
    // (clic en A y luego en B) no pisa a la nueva.
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;
    setLoadingConversation(true);
    try {
      const res = await fetch(`/api/assistant/conversations/${encodeURIComponent(id)}`, {
        credentials: 'include',
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      if (!res.ok) {
        if (res.status === 404) {
          setConversationId(null);
          commit(() => []);
        }
        return;
      }
      const data = await res.json() as { messages?: DisplayMessage[]; pendingActions?: PendingActionView[] };
      if (ctrl.signal.aborted) return;
      commit(() => fromDisplay(data.messages ?? [], data.pendingActions ?? []));
      setConversationId(id);
    } catch {
      // Cancelada o sin red: se mantiene la conversación actual.
    } finally {
      if (loadAbortRef.current === ctrl) {
        loadAbortRef.current = null;
        setLoadingConversation(false);
      }
    }
  }, [commit, setConversationId]);

  const cancelLoad = useCallback(() => {
    if (!loadAbortRef.current) return;
    loadAbortRef.current.abort();
    loadAbortRef.current = null;
    setLoadingConversation(false);
  }, []);

  const archiveConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/assistant/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 404) return;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationRef.current === id) {
        setConversationId(null);
        commit(() => []);
      }
    } catch {
      // Sin red: no se archiva.
    }
  }, [commit, setConversationId]);

  const newChat = useCallback(() => {
    if (abortRef.current) return;
    cancelLoad();
    setConversationId(null);
    commit(() => []);
  }, [cancelLoad, commit, setConversationId]);

  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/assistant/usage', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as AssistantUsage;
      if (typeof data.remaining === 'number') setUsage({ used: data.used, limit: data.limit, remaining: data.remaining });
    } catch {
      // El contador se completa con el próximo `done`.
    }
  }, []);

  // Al montar: cuota del mes y la conversación de esta pestaña, si la había.
  useEffect(() => {
    void loadUsage();
    const stored = readStored();
    if (stored) void loadConversation(stored);
    return () => {
      abortRef.current?.abort();
      loadAbortRef.current?.abort();
    };
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    conversations,
    conversationsLoading,
    conversationId,
    messages,
    streaming,
    loadingConversation,
    usage,
    send,
    retry,
    stop,
    confirm,
    reject,
    loadConversation,
    loadConversations,
    archiveConversation,
    newChat,
  };
}

export type AssistantState = ReturnType<typeof useAssistant>;
