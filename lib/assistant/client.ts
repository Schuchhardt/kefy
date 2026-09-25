// ─── Cliente SSE del asistente (navegador) ───────────────────────────────────
//
// POST con JSON y lectura del stream `text/event-stream` que devuelven
// /api/assistant/chat y /api/assistant/actions/[actionId]. Un 401 intenta
// renovar la sesión una vez; cualquier otra respuesta que no sea SSE (402 de
// suscripción, 429 de créditos / cuota / rate limit, 409, 503…) se lanza como
// SpendError con el cuerpo JSON para que el widget elija la tarjeta.

import type { SseEvent } from '@/lib/assistant/types';

export class AuthExpiredError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'AuthExpiredError';
  }
}

export class SpendError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) {
    super(typeof body?.error === 'string' ? body.error : `HTTP ${status}`);
    this.name = 'SpendError';
  }
}

export interface StreamOptions {
  signal?: AbortSignal;
  onEvent: (e: SseEvent) => void;
}

async function post(url: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
}

/** Parte un frame SSE en su evento. Devuelve null para comentarios y frames vacíos. */
function parseFrame(frame: string): SseEvent | null {
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    // `event:` repite el `type` que ya viene en el JSON: no hace falta.
  }
  if (data.length === 0) return null;
  try {
    const evt = JSON.parse(data.join('\n')) as SseEvent;
    return evt && typeof evt === 'object' && typeof evt.type === 'string' ? evt : null;
  } catch {
    return null;
  }
}

export async function streamSse(url: string, body: unknown, { signal, onEvent }: StreamOptions): Promise<void> {
  let res = await post(url, body, signal);

  if (res.status === 401) {
    const refreshed = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', signal });
    if (!refreshed.ok) throw new AuthExpiredError();
    res = await post(url, body, signal);
    if (res.status === 401) throw new AuthExpiredError();
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('text/event-stream') || !res.body) {
    const json = await res.json().catch(() => ({}));
    throw new SpendError(res.status, (json && typeof json === 'object' ? json : {}) as Record<string, unknown>);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, '\n');

      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const evt = parseFrame(frame);
        if (evt) onEvent(evt);
        sep = buffer.indexOf('\n\n');
      }
    }
    const tail = parseFrame(buffer + decoder.decode());
    if (tail) onEvent(tail);
  } finally {
    try { reader.releaseLock(); } catch { /* el stream ya se canceló */ }
  }
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  brandId?: string;
  language: 'es' | 'en';
  page?: string;
  timezone?: string;
}

export function streamChat(body: ChatRequest, opts: StreamOptions): Promise<void> {
  return streamSse('/api/assistant/chat', body, opts);
}

export function streamDecision(
  actionId: string,
  decision: 'confirm' | 'reject',
  lang: 'es' | 'en',
  opts: StreamOptions,
): Promise<void> {
  return streamSse(
    `/api/assistant/actions/${encodeURIComponent(actionId)}?lang=${lang}`,
    { decision },
    opts,
  );
}
