// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';
import { IDS, AUTH } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: dns.lookup, default: { lookup: dns.lookup } }));

// La descarga va por pinnedFetch (conexión fijada a las IPs comprobadas); sus
// detalles de red se prueban en pinned-fetch.test.ts.
const pinned = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/services/pinned-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/pinned-fetch')>()),
  pinnedFetch: pinned.fetch,
}));

import { ingestExternalMedia } from '@/lib/services/media-ingest';
import { serviceContext } from '@/lib/services/context';
import { ServiceError } from '@/lib/services/errors';
import { isPrivateAddress, isAllowedMediaUrl, isKefyStorageUrl } from '@/lib/assistant/url-allowlist';

// Descargar una URL que elige un tercero desde el servidor es un vector de
// SSRF. Estos tests fijan que nada que resuelva a una IP interna, redirija,
// o no sea un media permitido llega a descargarse o a guardarse.

const ctx = serviceContext(AUTH, IDS.BRAND, 'en', { brandScope: 'strict', source: 'api' });
const fetchMock = pinned.fetch;
/** fetch() global: no se usa (volvería a resolver el DNS al conectar). */
const globalFetch = vi.fn();

function publicHost(...addresses: string[]) {
  dns.lookup.mockResolvedValue((addresses.length ? addresses : ['93.184.216.34']).map((address) => ({ address, family: 4 })));
}

function mediaResponse(bytes = 16, type = 'image/png', init: ResponseInit & { headers?: Record<string, string> } = {}) {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    ...init,
    headers: { 'content-type': type, ...(init.headers ?? {}) },
  });
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', globalFetch);
  publicHost();
});

afterEach(() => { vi.unstubAllGlobals(); });

async function rejected(p: Promise<unknown>): Promise<ServiceError> {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(ServiceError);
  expect((err as ServiceError).status).toBe(422);
  return err as ServiceError;
}

describe('ingestExternalMedia: rechazos antes de descargar', () => {
  it.each([
    ['http://example.com/a.png', /https/],
    ['ftp://example.com/a.png', /https/],
    ['file:///etc/passwd', /https/],
    ['no es una url', /Invalid/],
    ['https://user:pass@example.com/a.png', /credentials/],
  ])('%s', async (url, message) => {
    const err = await rejected(ingestExternalMedia(ctx, url, 'image'));
    expect(err.message).toMatch(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.5.4', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1',
    '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1',
  ])('un host que resuelve a %s no se descarga', async (ip) => {
    publicHost(ip);
    await rejected(ingestExternalMedia(ctx, 'https://evil.example/a.png', 'image'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('basta con que UNA de las IPs sea interna', async () => {
    publicHost('93.184.216.34', '10.0.0.5');
    await rejected(ingestExternalMedia(ctx, 'https://evil.example/a.png', 'image'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('una IP literal interna en la URL también se rechaza', async () => {
    dns.lookup.mockImplementation(async (host: string) => [{ address: host, family: host.includes(':') ? 6 : 4 }]);
    await rejected(ingestExternalMedia(ctx, 'https://169.254.169.254/latest/meta-data', 'image'));
    await rejected(ingestExternalMedia(ctx, 'https://[::1]/a.png', 'image'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un host que no resuelve se rechaza', async () => {
    dns.lookup.mockRejectedValue(new Error('ENOTFOUND'));
    await rejected(ingestExternalMedia(ctx, 'https://nope.example/a.png', 'image'));
  });

  it('un host sin direcciones se rechaza', async () => {
    dns.lookup.mockResolvedValue([]);
    await rejected(ingestExternalMedia(ctx, 'https://empty.example/a.png', 'image'));
  });
});

describe('ingestExternalMedia: descarga', () => {
  it('no sigue redirecciones (podrían apuntar a una IP interna)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }));

    const err = await rejected(ingestExternalMedia(ctx, 'https://cdn.example/a.png', 'image'));

    expect(err.message).toMatch(/Redirect/);
    expect(db.storage.uploads).toHaveLength(0);
  });

  it('descarga conectando solo a las IPs ya comprobadas (sin volver a resolver: DNS rebinding)', async () => {
    publicHost('93.184.216.34', '93.184.216.35');
    fetchMock.mockResolvedValue(mediaResponse(8, 'image/png'));

    await ingestExternalMedia(ctx, 'https://rebind.example/a.png', 'image');

    expect(dns.lookup).toHaveBeenCalledTimes(1);
    const [url, addresses] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://rebind.example/a.png');
    expect(addresses).toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '93.184.216.35', family: 4 },
    ]);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('un content-type fuera de la lista se rechaza', async () => {
    fetchMock.mockResolvedValue(mediaResponse(16, 'text/html'));
    await rejected(ingestExternalMedia(ctx, 'https://cdn.example/a.png', 'image'));
    expect(db.storage.uploads).toHaveLength(0);
  });

  it('un video no pasa como imagen', async () => {
    fetchMock.mockResolvedValue(mediaResponse(16, 'video/mp4'));
    await rejected(ingestExternalMedia(ctx, 'https://cdn.example/a.mp4', 'image'));
  });

  it('un Content-Length declarado por encima del tope se rechaza sin leer', async () => {
    fetchMock.mockResolvedValue(mediaResponse(16, 'image/png', { headers: { 'content-length': String(11 * 1024 * 1024) } }));
    const err = await rejected(ingestExternalMedia(ctx, 'https://cdn.example/a.png', 'image'));
    expect(err.message).toMatch(/10 MB/);
  });

  it('el tope se aplica mientras se lee: no se confía en Content-Length', async () => {
    fetchMock.mockResolvedValue(mediaResponse(10 * 1024 * 1024 + 1, 'image/png'));
    await rejected(ingestExternalMedia(ctx, 'https://cdn.example/a.png', 'image'));
    expect(db.storage.uploads).toHaveLength(0);
  });

  it('un error HTTP se rechaza', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404, headers: { 'content-type': 'image/png' } }));
    await rejected(ingestExternalMedia(ctx, 'https://cdn.example/a.png', 'image'));
  });

  it('un archivo vacío se rechaza', async () => {
    fetchMock.mockResolvedValue(mediaResponse(0, 'image/png'));
    await rejected(ingestExternalMedia(ctx, 'https://cdn.example/a.png', 'image'));
  });

  it('un media válido se re-aloja en el Storage de Kefy, bajo la carpeta de la organización', async () => {
    fetchMock.mockResolvedValue(mediaResponse(64, 'image/jpeg; charset=binary'));

    const url = await ingestExternalMedia(ctx, 'https://cdn.example/a.jpg', 'image');

    expect(db.storage.uploads).toHaveLength(1);
    const up = db.storage.uploads[0];
    expect(up.bucket).toBe('kefy-content-media');
    expect(up.path.startsWith(`${IDS.ORG}/imports/`)).toBe(true);
    expect(up.path.endsWith('.jpg')).toBe(true);
    expect(up.contentType).toBe('image/jpeg');
    expect(up.size).toBe(64);
    expect(isKefyStorageUrl(url)).toBe(true);
  });

  it('si el Storage falla es un 503 (fallo nuestro), no un 422', async () => {
    fetchMock.mockResolvedValue(mediaResponse(8, 'image/png'));
    db.storage.failUpload = true;

    const err = await ingestExternalMedia(ctx, 'https://cdn.example/a.png', 'image').catch((e) => e);

    expect(err.status).toBe(503);
  });
});

describe('url-allowlist', () => {
  it('isPrivateAddress: públicas vs. internas', () => {
    for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111']) expect(isPrivateAddress(ip)).toBe(false);
    for (const ip of ['127.0.0.1', '10.0.0.1', '172.31.255.255', '192.168.0.1', '169.254.1.1', '::1', '::', 'fc00::1', '::ffff:192.168.1.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:a00:1', 'fe80::1%eth0']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it('isPrivateAddress: rangos reservados, multicast y las IPv6 que embeben una IPv4 interna', () => {
    for (const ip of [
      '198.18.0.1', '198.19.255.255', '192.0.0.8', '192.0.2.1', '198.51.100.1', '203.0.113.9',
      '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255',
      '64:ff9b::a00:1', '64:ff9b::7f00:1', '64:ff9b::169.254.169.254', '64:ff9b:1::1',
      '2002:a00:1::1', '2002:7f00:1::', '2002:a9fe:a9fe::1',
      'ff02::1', '2001:db8::1', '2001:0:4136:e378::1', '100::1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    // NAT64 y 6to4 hacia IPv4 públicas siguen permitidas.
    for (const ip of ['64:ff9b::808:808', '2002:808:808::1', '198.20.0.1', '223.255.255.255']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('una IP inválida cuenta como privada (ante la duda no se descarga)', () => {
    expect(isPrivateAddress('no-ip')).toBe(true);
    expect(isPrivateAddress('999.1.1.1')).toBe(true);
  });

  it('isAllowedMediaUrl con referenceOnly solo acepta los buckets de Kefy', () => {
    const base = 'https://test.supabase.co/storage/v1/object/public';
    expect(isAllowedMediaUrl(`${base}/kefy-reference-images/o/a.png`, { referenceOnly: true })).toBe(true);
    expect(isAllowedMediaUrl(`${base}/kefy-content-media/o/a.png`, { referenceOnly: true })).toBe(true);
    // Imágenes generadas por IA: la página de creación las ofrece como
    // referencia (posts anteriores, biblioteca, ?refImage).
    expect(isAllowedMediaUrl(`${base}/kefy-content-images/o/a.jpeg`, { referenceOnly: true })).toBe(true);
    expect(isAllowedMediaUrl(`${base}/otro-bucket/a.png`, { referenceOnly: true })).toBe(false);
    expect(isAllowedMediaUrl('https://evil.example/storage/v1/object/public/kefy-content-media/a.png', { referenceOnly: true }))
      .toBe(false);
    expect(isAllowedMediaUrl('http://test.supabase.co/storage/v1/object/public/kefy-content-media/a.png')).toBe(false);
  });

  // En producción solo existe SUPABASE_URL (la que usa lib/supabase.ts). Leer
  // solo NEXT_PUBLIC_SUPABASE_URL rechazaba toda imagen de referencia con 422.
  it('reconoce el Storage de Kefy con solo SUPABASE_URL definida', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_URL', 'https://prod-ref.supabase.co');
    try {
      const base = 'https://prod-ref.supabase.co/storage/v1/object/public';
      expect(isAllowedMediaUrl(`${base}/kefy-reference-images/o/a.png`, { referenceOnly: true })).toBe(true);
      expect(isAllowedMediaUrl(`${base}/kefy-content-images/o/a.jpeg`, { referenceOnly: true })).toBe(true);
      expect(isKefyStorageUrl(`${base}/kefy-content-media/o/a.png`)).toBe(true);
      expect(isAllowedMediaUrl('https://test.supabase.co/storage/v1/object/public/kefy-reference-images/a.png', { referenceOnly: true }))
        .toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
