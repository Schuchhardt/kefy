'use client';

// ─── DMs sin leer + comentarios sin responder ────────────────────────────────
// Lo leen el Sidebar (escritorio) y el BottomNav (móvil). Antes el polling
// vivía dentro del Sidebar, que en móvil está oculto: seguía consultando cada
// 30 s pero el número no se veía en ningún sitio.
//
// Un solo intervalo para todos los que lo usen (useSyncExternalStore), que se
// pausa con la pestaña oculta y se refresca al volver y cuando el asistente
// avisa de cambios en el inbox.

import { useEffect, useSyncExternalStore } from 'react';
import { DATA_CHANGED_EVENT, type DataChangedDetail } from '@/lib/data-events';

const POLL_MS = 30_000;

let count = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export async function refreshUnreadCount(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/api/messaging/summary', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { total?: number };
      const next = typeof data.total === 'number' ? data.total : 0;
      if (next !== count) { count = next; emit(); }
    } catch {
      // No crítico: el siguiente ciclo lo reintenta.
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function onVisibility() {
  if (document.visibilityState === 'visible') void refreshUnreadCount();
}

function onDataChanged(e: Event) {
  const entities = (e as CustomEvent<DataChangedDetail>).detail?.entities ?? [];
  if (entities.includes('inbox')) void refreshUnreadCount();
}

function start() {
  void refreshUnreadCount();
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshUnreadCount();
  }, POLL_MS);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener(DATA_CHANGED_EVENT, onDataChanged);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener(DATA_CHANGED_EVENT, onDataChanged);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

/** Número de conversaciones y comentarios pendientes de la marca activa. */
export function useUnreadCount(brandId?: string | null): number {
  const value = useSyncExternalStore(subscribe, () => count, () => 0);
  // Cambiar de marca cambia la bandeja: se vuelve a contar.
  useEffect(() => {
    if (brandId) void refreshUnreadCount();
  }, [brandId]);
  return value;
}
