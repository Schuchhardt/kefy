// ─── Descarga https fijada a IPs ya comprobadas ──────────────────────────────
//
// fetch() vuelve a resolver el DNS al conectar: entre la comprobación de
// ingestExternalMedia y la conexión, un DNS con TTL 0 podía devolver otra IP
// (DNS rebinding) y la descarga llegar a un servicio interno. Aquí la
// conexión usa un `lookup` propio que solo devuelve las direcciones que ya
// pasaron isPrivateAddress: el nombre nunca se vuelve a resolver. El SNI y la
// cabecera Host siguen siendo los del hostname, así que el certificado se
// valida contra el nombre original.
//
// No sigue redirecciones (https.request nunca lo hace) y devuelve una
// Response web para que quien la usa lea el body como con fetch.

import https from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

export interface PinnedAddress {
  address: string;
  family: 4 | 6;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: number }>,
  family?: number,
) => void;

/** Normaliza lo que devuelve dns.lookup({ all: true }) a direcciones con familia. */
export function toPinnedAddresses(list: Array<{ address: string; family?: number }>): PinnedAddress[] {
  return list.map((a) => ({ address: a.address, family: (a.family === 6 || isIP(a.address) === 6 ? 6 : 4) as 4 | 6 }));
}

/**
 * `lookup` para net/tls.connect que ignora el hostname y responde solo con
 * `addresses`. Soporta la forma `{ all: true }` (autoSelectFamily) y el
 * filtro por familia.
 */
export function pinnedLookup(addresses: PinnedAddress[]) {
  return (_hostname: string, options: unknown, callback: LookupCallback): void => {
    const opts = (options && typeof options === 'object' ? options : {}) as { all?: boolean; family?: unknown };
    const family = opts.family === 4 || opts.family === 'IPv4' ? 4 : opts.family === 6 || opts.family === 'IPv6' ? 6 : 0;
    const pool = family ? addresses.filter((a) => a.family === family) : addresses;
    if (pool.length === 0) {
      const err = Object.assign(new Error('No vetted address for this host'), { code: 'ENOTFOUND' });
      callback(err, '', 0);
      return;
    }
    if (opts.all) callback(null, pool.map((a) => ({ address: a.address, family: a.family })));
    else callback(null, pool[0].address, pool[0].family);
  };
}

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

/** GET https a `url` conectando solo a `addresses`. */
export function pinnedFetch(url: URL, addresses: PinnedAddress[], signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        // Sin agente compartido: un socket reutilizado no pasaría por el lookup.
        agent: false,
        lookup: pinnedLookup(addresses) as unknown as https.RequestOptions['lookup'],
        signal,
        headers: { accept: '*/*', 'user-agent': 'KefyMediaImport/1.0' },
      },
      (res) => {
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (v === undefined) continue;
          if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
          else headers.set(k, String(v));
        }
        const status = res.statusCode ?? 502;
        if (NULL_BODY_STATUSES.has(status)) {
          res.resume();
          resolve(new Response(null, { status, headers }));
          return;
        }
        resolve(new Response(Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>, { status, headers }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}
