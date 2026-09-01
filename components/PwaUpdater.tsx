'use client';

import { useEffect } from 'react';
import { APP_VERSION } from '@/lib/app-version';

/** Cada cuánto se le pregunta al navegador si hay un service worker nuevo. */
const UPDATE_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Si la pestaña estuvo oculta más de este tiempo, consideramos que el usuario
 * "vuelve a entrar" a la app y podemos recargar sin interrumpirlo.
 */
const REENTRY_THRESHOLD_MS = 60 * 1000;

/** Evita bucles de recarga cuando el servidor sigue devolviendo la misma versión. */
const RELOAD_GUARD_KEY = 'kefy:reloaded-for-version';

function alreadyReloadedFor(version: string): boolean {
  try {
    return sessionStorage.getItem(RELOAD_GUARD_KEY) === version;
  } catch {
    return false;
  }
}

function markReloadedFor(version: string) {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, version);
  } catch {
    /* modo privado / storage bloqueado: seguimos igual */
  }
}

/** Pregunta al service worker que controla la página con qué versión se generó. */
function controllerVersion(): Promise<string | null> {
  const controller = navigator.serviceWorker.controller;
  if (!controller) return Promise.resolve(null);

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve(null), 2000);

    channel.port1.onmessage = (event: MessageEvent<{ version?: string }>) => {
      window.clearTimeout(timeout);
      resolve(event.data?.version ?? null);
    };

    try {
      controller.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    } catch {
      window.clearTimeout(timeout);
      resolve(null);
    }
  });
}

/**
 * Registra el service worker y garantiza que quien entra a la app corra
 * siempre la última versión desplegada.
 *
 * Dos mecanismos complementarios:
 *  1. Service worker: al detectar un script nuevo se instala, borra las caches
 *     de la versión anterior y toma el control (`controllerchange`), momento en
 *     el que recargamos la pestaña.
 *  2. Chequeo de versión contra `/api/version`, que también cubre navegadores
 *     sin service worker y el caso de HTML servido desde una cache intermedia.
 */
export default function PwaUpdater() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isProduction = process.env.NODE_ENV === 'production';
    const supportsServiceWorker = 'serviceWorker' in navigator;

    // En desarrollo el service worker interfiere con HMR: se limpia cualquier
    // registro que haya quedado de una visita a producción (mismo localhost).
    if (!isProduction) {
      if (supportsServiceWorker) {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => registrations.forEach((r) => r.unregister()))
          .catch(() => undefined);
      }
      return;
    }

    let disposed = false;
    let reloading = false;
    let hiddenSince = 0;
    let registration: ServiceWorkerRegistration | null = null;

    const reload = (version: string) => {
      if (reloading || disposed) return;
      reloading = true;
      markReloadedFor(version);
      window.location.reload();
    };

    // Un worker nuevo tomó el control. Solo recargamos si además es de otra
    // versión que la que sirvió este HTML: si coinciden (por ejemplo, el worker
    // que se activa justo después de una recarga) no hay nada que actualizar.
    const onControllerChange = async () => {
      const version = await controllerVersion();
      if (version && version !== APP_VERSION) reload(version);
    };

    /** Compara la versión que corre esta pestaña contra la del servidor. */
    const checkVersion = async (allowReload: boolean) => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;

        const { version } = (await res.json()) as { version?: string };
        if (!version || version === APP_VERSION) return;
        if (!allowReload || alreadyReloadedFor(version)) return;

        reload(version);
      } catch {
        /* sin conexión: se reintenta en el próximo chequeo */
      }
    };

    const checkForUpdate = () => {
      registration?.update().catch(() => undefined);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSince = Date.now();
        return;
      }

      checkForUpdate();
      // Solo recargamos si el usuario realmente volvió a entrar, para no
      // interrumpir una sesión activa (por ejemplo, un formulario a medio
      // llenar mientras cambia de pestaña un momento).
      const awayFor = hiddenSince ? Date.now() - hiddenSince : Infinity;
      void checkVersion(awayFor > REENTRY_THRESHOLD_MS);
    };

    const onOnline = () => {
      checkForUpdate();
      void checkVersion(false);
    };

    // Al entrar a la app sí recargamos de inmediato si la versión no coincide.
    void checkVersion(true);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);
    const intervalId = window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS);

    if (supportsServiceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

      navigator.serviceWorker
        // `updateViaCache: 'none'` fuerza a pedir /sw.js a la red en cada
        // chequeo, sin pasar por la HTTP cache.
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => {
          if (disposed) return;
          registration = reg;
          reg.update().catch(() => undefined);
        })
        .catch(() => undefined);
    }

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
      window.clearInterval(intervalId);
      if (supportsServiceWorker) {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      }
    };
  }, []);

  return null;
}
