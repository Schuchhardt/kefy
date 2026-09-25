// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { pinnedFetch, pinnedLookup, toPinnedAddresses } from '@/lib/services/pinned-fetch';

// La conexión de ingestExternalMedia usa un `lookup` que solo devuelve las IPs
// ya comprobadas: aunque el DNS cambie entre la comprobación y la conexión
// (rebinding), nunca se conecta a otra dirección.

const V4 = { address: '93.184.216.34', family: 4 as const };
const V6 = { address: '2606:2800:220:1::1', family: 6 as const };

function lookupOnce(addresses: typeof V4[] | Array<typeof V4 | typeof V6>, options: unknown) {
  return new Promise<{ err: unknown; address: unknown; family: unknown }>((resolve) => {
    pinnedLookup(addresses as never)('internal.attacker.example', options, (err, address, family) => resolve({ err, address, family }));
  });
}

afterEach(() => { vi.restoreAllMocks(); });

describe('pinnedLookup', () => {
  it('ignora el hostname: responde solo con las IPs comprobadas', async () => {
    expect(await lookupOnce([V4], {})).toMatchObject({ err: null, address: V4.address, family: 4 });
  });

  it('con all: true (autoSelectFamily) devuelve la lista', async () => {
    const r = await lookupOnce([V4, V6], { all: true });
    expect(r.address).toEqual([V4, V6]);
  });

  it('respeta el filtro por familia y falla si no queda ninguna', async () => {
    expect((await lookupOnce([V4, V6], { family: 6 })).address).toBe(V6.address);
    const r = await lookupOnce([V4], { family: 6 });
    expect(r.err).toMatchObject({ code: 'ENOTFOUND' });
  });

  it('toPinnedAddresses deduce la familia', () => {
    expect(toPinnedAddresses([{ address: '1.2.3.4' }, { address: '::1' }])).toEqual([
      { address: '1.2.3.4', family: 4 }, { address: '::1', family: 6 },
    ]);
  });
});

describe('pinnedFetch', () => {
  it('conecta con el lookup fijado, sin agente compartido, y devuelve una Response', async () => {
    let captured: https.RequestOptions | undefined;
    vi.spyOn(https, 'request').mockImplementation(((url: URL, options: https.RequestOptions, cb: (res: unknown) => void) => {
      captured = options;
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () => {
        const res = Object.assign(new PassThrough(), { statusCode: 200, headers: { 'content-type': 'image/png' } });
        cb(res);
        res.end(Buffer.from([1, 2, 3]));
      };
      return req;
    }) as never);

    const res = await pinnedFetch(new URL('https://cdn.example/a.png'), [V4], new AbortController().signal);

    expect(captured?.agent).toBe(false);
    const lookup = captured?.lookup as unknown as ReturnType<typeof pinnedLookup>;
    const address = await new Promise((resolve) => lookup('cdn.example', {}, (_e, a) => resolve(a)));
    expect(address).toBe(V4.address);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('una redirección se devuelve tal cual (no se sigue)', async () => {
    vi.spyOn(https, 'request').mockImplementation(((_url: URL, _o: unknown, cb: (res: unknown) => void) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () => {
        const res = Object.assign(new PassThrough(), { statusCode: 302, headers: { location: 'https://127.0.0.1/' } });
        cb(res);
        res.end();
      };
      return req;
    }) as never);

    const res = await pinnedFetch(new URL('https://cdn.example/a.png'), [V4], new AbortController().signal);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://127.0.0.1/');
  });
});
