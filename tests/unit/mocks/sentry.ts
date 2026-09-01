// ─── Stub de @sentry/nextjs para los tests unitarios ─────────────────────────
//
// El paquete real arrastra los plugins de bundler de Sentry, que esperan correr
// dentro del build de Next y fallan al cargarse desde Vitest
// («The URL must be of scheme file»).
//
// `vitest.config.mts` apunta '@sentry/nextjs' a este archivo. Las funciones son
// espías, así que un test puede afirmar que un error se reportó:
//
//   import * as Sentry from '@sentry/nextjs';
//   expect(Sentry.captureException).toHaveBeenCalled();

import { vi } from 'vitest';

export interface FakeScope {
  setTag: (key: string, value: unknown) => FakeScope;
  setUser: (user: unknown) => FakeScope;
  setContext: (key: string, value: unknown) => FakeScope;
  setLevel: (level: string) => FakeScope;
}

/** Crea un scope encadenable como el real, para que los callbacks funcionen. */
export function makeScope(): FakeScope {
  const scope: FakeScope = {
    setTag: vi.fn(() => scope),
    setUser: vi.fn(() => scope),
    setContext: vi.fn(() => scope),
    setLevel: vi.fn(() => scope),
  };
  return scope;
}

export const captureException = vi.fn(
  (_error: unknown, callback?: (scope: FakeScope) => FakeScope) => {
    // Se ejecuta el callback para que los tests cubran el código que arma el
    // scope (tags, usuario, contexto) en lugar de saltárselo.
    if (typeof callback === 'function') callback(makeScope());
    return 'test-event-id';
  },
);

export const captureMessage = vi.fn(
  (_message: string, callback?: (scope: FakeScope) => FakeScope) => {
    if (typeof callback === 'function') callback(makeScope());
    return 'test-event-id';
  },
);

export const addBreadcrumb = vi.fn();
export const init = vi.fn();
export const replayIntegration = vi.fn(() => ({ name: 'Replay' }));
export const captureRequestError = vi.fn();
export const captureRouterTransitionStart = vi.fn();
