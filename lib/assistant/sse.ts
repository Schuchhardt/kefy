// ─── Server-Sent Events del chat del asistente ───────────────────────────────
//
// La ruta devuelve la Response enseguida y el trabajo (llamadas al modelo,
// herramientas) corre después, dentro de una IIFE async que va llamando a
// send(). Cada evento sale como un frame SSE con nombre:
//
//   event: text_delta
//   data: {"type":"text_delta","text":"Hola"}
//
// Un comentario `: ping` cada 15 s mantiene viva la conexión a través de
// proxies que cortan conexiones inactivas. close() es idempotente, y send()
// después de cerrar (o de que el cliente se vaya) no hace nada.

import type { SseEvent } from '@/lib/assistant/types';

const HEARTBEAT_MS = 15_000;

export interface SseStream {
  response(init?: { headers?: Record<string, string> }): Response;
  send(evt: SseEvent): void;
  close(): void;
  closed: () => boolean;
}

export function createSseStream(signal?: AbortSignal): SseStream {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let isClosed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stopHeartbeat = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  const enqueue = (chunk: string) => {
    if (isClosed || !controller) return;
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      // El cliente se fue y el stream ya no acepta datos.
      isClosed = true;
      stopHeartbeat();
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      heartbeat = setInterval(() => enqueue(': ping\n\n'), HEARTBEAT_MS);
    },
    cancel() {
      // El navegador cerró la conexión.
      isClosed = true;
      stopHeartbeat();
    },
  });

  if (signal) {
    if (signal.aborted) stopHeartbeat();
    else signal.addEventListener('abort', stopHeartbeat, { once: true });
  }

  return {
    response(init) {
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
          ...(init?.headers ?? {}),
        },
      });
    },
    send(evt) {
      enqueue(`event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`);
    },
    close() {
      stopHeartbeat();
      if (isClosed) return;
      isClosed = true;
      try {
        controller?.close();
      } catch {
        // Ya estaba cerrado o cancelado.
      }
    },
    closed: () => isClosed,
  };
}
