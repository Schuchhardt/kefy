import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/nextjs';
import { reportError, reportWarning, addBreadcrumb } from '@/lib/observability';
import type { JWTPayload } from '@/types/auth';

// `@sentry/nextjs` está aliasado a tests/unit/mocks/sentry.ts (ver vitest.config.mts).

const auth: JWTPayload = { userId: 'user-1', orgId: 'org-1', role: 'owner', plan: 'starter' };

describe('reportError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('envía la excepción a Sentry y devuelve el id del evento', () => {
    const id = reportError(new Error('boom'), { route: 'POST /api/x' });

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(id).toBe('test-event-id');
  });

  it('mantiene el log local para poder verlo en los logs de despliegue', () => {
    reportError(new Error('boom'), { route: 'POST /api/x' });

    expect(console.error).toHaveBeenCalledWith('[POST /api/x]', 'boom');
  });

  it('acepta valores lanzados que no son Error', () => {
    reportError('fallo en texto plano', { route: 'POST /api/x' });

    expect(console.error).toHaveBeenCalledWith('[POST /api/x]', 'fallo en texto plano');
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('adjunta el contexto de sesión al scope', () => {
    const scopes: Array<Record<string, unknown>> = [];
    vi.mocked(Sentry.captureException).mockImplementation((_e: unknown, cb?: unknown) => {
      const tags: Record<string, unknown> = {};
      let user: unknown = null;
      const scope = {
        setTag: (k: string, v: unknown) => { tags[k] = v; return scope; },
        setUser: (u: unknown) => { user = u; return scope; },
        setContext: () => scope,
        setLevel: () => scope,
      };
      if (typeof cb === 'function') (cb as (s: unknown) => unknown)(scope);
      scopes.push({ tags, user });
      return 'test-event-id';
    });

    reportError(new Error('boom'), { route: 'POST /api/x', auth, service: 'anthropic' });

    expect(scopes[0].tags).toMatchObject({
      route: 'POST /api/x',
      service: 'anthropic',
      plan: 'starter',
      org_id: 'org-1',
    });
    // Solo el id: el email y la IP nunca se envían.
    expect(scopes[0].user).toEqual({ id: 'user-1' });
  });

  // Un fallo del reporte no puede tumbar la request que lo originó.
  it('no lanza si Sentry falla', () => {
    vi.mocked(Sentry.captureException).mockImplementation(() => {
      throw new Error('sentry caído');
    });

    expect(() => reportError(new Error('boom'), { route: 'POST /api/x' })).not.toThrow();
    expect(reportError(new Error('boom'), { route: 'POST /api/x' })).toBeNull();
  });
});

describe('reportWarning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('envía un mensaje en vez de una excepción', () => {
    reportWarning('respuesta rara de Zernio', { route: 'POST /api/social/publish', service: 'zernio' });

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('no lanza si Sentry falla', () => {
    vi.mocked(Sentry.captureMessage).mockImplementation(() => {
      throw new Error('sentry caído');
    });

    expect(() => reportWarning('algo', { route: 'x' })).not.toThrow();
  });
});

describe('addBreadcrumb', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('registra el breadcrumb', () => {
    addBreadcrumb('reintento de render', { intento: 2 });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      message: 'reintento de render',
      data: { intento: 2 },
      level: 'info',
    });
  });

  it('no lanza si Sentry falla', () => {
    vi.mocked(Sentry.addBreadcrumb).mockImplementation(() => {
      throw new Error('sentry caído');
    });

    expect(() => addBreadcrumb('x')).not.toThrow();
  });
});
