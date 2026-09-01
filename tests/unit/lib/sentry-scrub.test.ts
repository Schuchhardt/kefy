import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import {
  scrubEvent,
  scrubDeep,
  scrubUrl,
  isSensitiveKey,
  isIgnoredError,
  REDACTED,
} from '@/lib/sentry-scrub';

// Estos tests son la garantía de que un reporte de error nunca se lleva
// credenciales fuera del servidor. Si alguno falla, hay una fuga de datos.

describe('isSensitiveKey', () => {
  it('reconoce claves sensibles sin importar mayúsculas ni sufijos', () => {
    for (const key of [
      'password', 'PASSWORD', 'newPassword', 'password_hash',
      'token', 'access_token', 'refreshToken',
      'JWT_SECRET', 'apiKey', 'api_key',
      'cookie', 'authorization', 'signature', 'credential',
    ]) {
      expect(isSensitiveKey(key), `${key} debería ser sensible`).toBe(true);
    }
  });

  it('deja pasar las claves inocuas', () => {
    for (const key of ['email', 'name', 'orgId', 'channel', 'topic', 'plan']) {
      expect(isSensitiveKey(key), `${key} no debería ser sensible`).toBe(false);
    }
  });
});

describe('scrubDeep', () => {
  it('redacta valores sensibles y conserva el resto', () => {
    const out = scrubDeep({
      email: 'user@example.com',
      password: 'supersecreto',
      nested: { api_key: 'sk-123', channel: 'instagram' },
    }) as Record<string, unknown>;

    expect(out.email).toBe('user@example.com');
    expect(out.password).toBe(REDACTED);
    expect((out.nested as Record<string, unknown>).api_key).toBe(REDACTED);
    expect((out.nested as Record<string, unknown>).channel).toBe('instagram');
  });

  it('recorre los arrays', () => {
    const out = scrubDeep([{ token: 'abc' }, { topic: 'lanzamiento' }]) as Array<Record<string, unknown>>;
    expect(out[0].token).toBe(REDACTED);
    expect(out[1].topic).toBe('lanzamiento');
  });

  it('corta la recursión en estructuras cíclicas sin colgarse', () => {
    const cyclic: Record<string, unknown> = { name: 'kefy' };
    cyclic.self = cyclic;
    expect(() => scrubDeep(cyclic)).not.toThrow();
  });

  it('preserva los valores primitivos', () => {
    expect(scrubDeep(42)).toBe(42);
    expect(scrubDeep(null)).toBe(null);
    expect(scrubDeep('texto')).toBe('texto');
  });
});

describe('scrubUrl', () => {
  it('redacta los parámetros sensibles del query string', () => {
    const out = scrubUrl('https://kefy.app/reset?token=abc123&lang=es');
    expect(out).not.toContain('abc123');
    expect(out).toContain('lang=es');
  });

  it('quita las credenciales embebidas en la URL', () => {
    const out = scrubUrl('https://usuario:clave@kefy.app/api/x');
    expect(out).not.toContain('clave');
    expect(out).not.toContain('usuario');
  });

  it('devuelve la entrada tal cual si no es una URL válida', () => {
    expect(scrubUrl('no-es-una-url')).toBe('no-es-una-url');
  });
});

describe('scrubEvent', () => {
  function baseEvent(): ErrorEvent {
    return {
      type: undefined,
      request: {
        url: 'https://kefy.app/api/auth/login?token=secreto',
        headers: {
          authorization: 'Bearer eyJhbGci',
          cookie: 'kefy_access=eyJhbGci',
          'content-type': 'application/json',
          'stripe-signature': 't=1,v1=abc',
        },
        cookies: { kefy_access: 'eyJhbGci', kefy_refresh: 'deadbeef' },
        data: { email: 'user@example.com', password: 'supersecreto' },
      },
      extra: { apiKey: 'sk-ant-123', channel: 'linkedin' },
      user: { id: 'user-1', email: 'user@example.com', ip_address: '1.2.3.4', username: 'seba' },
    } as unknown as ErrorEvent;
  }

  it('redacta las cabeceras de autenticación pero conserva las neutras', () => {
    const out = scrubEvent(baseEvent())!;
    expect(out.request!.headers!.authorization).toBe(REDACTED);
    expect(out.request!.headers!.cookie).toBe(REDACTED);
    expect(out.request!.headers!['stripe-signature']).toBe(REDACTED);
    expect(out.request!.headers!['content-type']).toBe('application/json');
  });

  it('vacía por completo las cookies de sesión', () => {
    const out = scrubEvent(baseEvent())!;
    expect(JSON.stringify(out.request!.cookies)).not.toContain('eyJhbGci');
    expect(JSON.stringify(out.request!.cookies)).not.toContain('deadbeef');
  });

  it('redacta la contraseña del cuerpo pero deja el email para poder depurar', () => {
    const out = scrubEvent(baseEvent())!;
    const data = out.request!.data as Record<string, unknown>;
    expect(data.password).toBe(REDACTED);
    expect(data.email).toBe('user@example.com');
  });

  it('quita el token del query string de la URL', () => {
    const out = scrubEvent(baseEvent())!;
    expect(out.request!.url).not.toContain('secreto');
  });

  it('deja solo el id del usuario: sin email, IP ni nombre', () => {
    const out = scrubEvent(baseEvent())!;
    expect(out.user!.id).toBe('user-1');
    expect(out.user!.email).toBeUndefined();
    expect(out.user!.ip_address).toBeUndefined();
    expect(out.user!.username).toBeUndefined();
  });

  it('redacta las claves sensibles de extra', () => {
    const out = scrubEvent(baseEvent())!;
    expect(out.extra!.apiKey).toBe(REDACTED);
    expect(out.extra!.channel).toBe('linkedin');
  });

  it('limpia las URLs de los breadcrumbs', () => {
    const event = baseEvent();
    event.breadcrumbs = [
      { category: 'fetch', data: { url: 'https://kefy.app/api/x?token=abc123', method: 'GET' } },
    ];
    const out = scrubEvent(event)!;
    expect(JSON.stringify(out.breadcrumbs)).not.toContain('abc123');
  });

  it('no falla con un evento mínimo sin request ni usuario', () => {
    expect(() => scrubEvent({ message: 'boom' } as ErrorEvent)).not.toThrow();
  });

  // `reportError` adjunta su payload con `scope.setContext('detalle', …)`, que
  // aterriza en `event.contexts.detalle`. Es la ruta por la que viajan de
  // verdad los datos de la aplicación, así que es la que más importa sanear.
  it('redacta las claves sensibles dentro de contexts', () => {
    const event = {
      contexts: {
        detalle: {
          email: 'user@example.com',
          password: 'supersecreto',
          api_key: 'sk-ant-123',
          channel: 'instagram',
        },
      },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event)!;
    const detalle = out.contexts!.detalle as Record<string, unknown>;

    expect(detalle.password).toBe(REDACTED);
    expect(detalle.api_key).toBe(REDACTED);
    expect(detalle.email).toBe('user@example.com');
    expect(detalle.channel).toBe('instagram');
  });

  it('no deja ningún secreto en el evento serializado completo', () => {
    const event = {
      request: {
        url: 'https://kefy.app/api/x?token=SECRETO_URL',
        headers: { authorization: 'Bearer SECRETO_HEADER' },
        cookies: { kefy_access: 'SECRETO_COOKIE' },
        data: { password: 'SECRETO_BODY' },
      },
      extra: { api_key: 'SECRETO_EXTRA' },
      contexts: { detalle: { refresh_token: 'SECRETO_CONTEXT' } },
      user: { id: 'u1', email: 'seba@example.com', ip_address: '1.2.3.4' },
    } as unknown as ErrorEvent;

    const serializado = JSON.stringify(scrubEvent(event));

    // Barrido final: ningún marcador debe sobrevivir por ninguna vía.
    for (const secreto of [
      'SECRETO_URL', 'SECRETO_HEADER', 'SECRETO_COOKIE',
      'SECRETO_BODY', 'SECRETO_EXTRA', 'SECRETO_CONTEXT',
      'seba@example.com', '1.2.3.4',
    ]) {
      expect(serializado, `${secreto} no debería salir del proceso`).not.toContain(secreto);
    }
  });
});

describe('isIgnoredError', () => {
  it('ignora el ruido que no es un fallo de Kefy', () => {
    for (const msg of [
      'ResizeObserver loop limit exceeded',
      'Failed to fetch',
      'AbortError: The operation was aborted',
      "Can't find variable: chrome-extension://abc",
      'NEXT_REDIRECT',
      'NEXT_NOT_FOUND',
    ]) {
      expect(isIgnoredError(msg), `${msg} debería ignorarse`).toBe(true);
    }
  });

  it('deja pasar los errores reales de la aplicación', () => {
    for (const msg of [
      'Cannot read properties of undefined (reading "slides")',
      'Missing JWT_SECRET env var',
      'Zernio responded 500',
    ]) {
      expect(isIgnoredError(msg), `${msg} no debería ignorarse`).toBe(false);
    }
  });
});
