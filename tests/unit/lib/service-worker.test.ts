import { describe, it, expect } from 'vitest';
import { buildServiceWorkerSource, cacheNames, CACHE_PREFIX } from '@/lib/service-worker';

describe('service worker', () => {
  it('nombra las caches con la versión del build', () => {
    const names = cacheNames('abc123');
    expect(names.static).toBe('kefy-static-abc123');
    expect(names.pages).toBe('kefy-pages-abc123');
    expect(names.static.startsWith(CACHE_PREFIX)).toBe(true);
  });

  it('genera un script distinto por versión', () => {
    const a = buildServiceWorkerSource('v1');
    const b = buildServiceWorkerSource('v2');
    expect(a).not.toBe(b);
    expect(a).toContain('"kefy-static-v1"');
    expect(b).toContain('"kefy-static-v2"');
  });

  it('se activa de inmediato y borra las caches de versiones anteriores', () => {
    const src = buildServiceWorkerSource('v1');
    expect(src).toContain('self.skipWaiting()');
    expect(src).toContain('self.clients.claim()');
    expect(src).toContain('caches.delete(key)');
  });

  it('nunca cachea la API, el worker, el manifest ni los payloads RSC', () => {
    const src = buildServiceWorkerSource('v1');
    expect(src).toContain("url.pathname.indexOf('/api/') === 0");
    expect(src).toContain("url.pathname === '/sw.js'");
    expect(src).toContain("url.pathname === '/manifest.webmanifest'");
    expect(src).toContain("url.searchParams.has('_rsc')");
  });

  it('no guarda el HTML privado del dashboard', () => {
    const src = buildServiceWorkerSource('v1');
    expect(src).toContain("url.pathname.indexOf('/dashboard') !== -1");
  });

  it('sirve las navegaciones desde la red primero', () => {
    const src = buildServiceWorkerSource('v1');
    expect(src).toContain("request.mode === 'navigate'");
    expect(src).toContain('networkFirst(request, PAGES_CACHE');
  });

  it('escapa la versión para no romper el script', () => {
    const src = buildServiceWorkerSource('a"b\\c');
    expect(src).toContain(JSON.stringify('a"b\\c'));
  });
});
