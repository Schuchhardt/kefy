// ─── URLs que aceptan las herramientas ───────────────────────────────────────
//
// Las herramientas reciben URLs del modelo o de un cliente externo. Para las
// imágenes de referencia solo se aceptan las del Storage de Kefy; para importar
// media externa (lib/services/media-ingest.ts) se exige https y que el host no
// resuelva a una IP interna — si no, la función serverless podría usarse para
// leer servicios internos (SSRF).

import { isIP } from 'node:net';

const PUBLIC_STORAGE_PREFIX = '/storage/v1/object/public/';
// kefy-content-images guarda las imágenes generadas por IA: la página de
// creación las ofrece como referencia (posts anteriores, biblioteca, ?refImage).
const REFERENCE_PREFIXES = [
  '/storage/v1/object/public/kefy-reference-images/',
  '/storage/v1/object/public/kefy-content-media/',
  '/storage/v1/object/public/kefy-content-images/',
];

function parseHttps(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

function storageHost(): string | null {
  // El servidor usa SUPABASE_URL (lib/supabase.ts); NEXT_PUBLIC_SUPABASE_URL no
  // está definida en producción y queda solo como respaldo.
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  try {
    return new URL(base).host;
  } catch {
    return null;
  }
}

/**
 * true si la URL es https. Con `referenceOnly`, además tiene que ser del
 * Storage de Kefy y de uno de los buckets de imágenes de referencia o media.
 */
export function isAllowedMediaUrl(url: string, { referenceOnly = false }: { referenceOnly?: boolean } = {}): boolean {
  const u = parseHttps(url);
  if (!u) return false;
  if (!referenceOnly) return true;

  const host = storageHost();
  if (!host || u.host !== host) return false;
  return REFERENCE_PREFIXES.some((p) => u.pathname.startsWith(p));
}

/** true si la URL apunta a un objeto público del Storage de Kefy. */
export function isKefyStorageUrl(url: string): boolean {
  const u = parseHttps(url);
  if (!u) return false;
  const host = storageHost();
  return !!host && u.host === host && u.pathname.startsWith(PUBLIC_STORAGE_PREFIX);
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function inCidr4(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const PRIVATE_V4: Array<[string, number]> = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['0.0.0.0', 8],
  ['100.64.0.0', 10],
  ['192.0.0.0', 24],     // asignaciones de protocolo del IETF
  ['192.0.2.0', 24],     // TEST-NET-1
  ['198.18.0.0', 15],    // benchmarking
  ['198.51.100.0', 24],  // TEST-NET-2
  ['203.0.113.0', 24],   // TEST-NET-3
  ['224.0.0.0', 4],      // multicast
  ['240.0.0.0', 4],      // reservada + broadcast
];

function isPrivateV4(ip: string): boolean {
  return PRIVATE_V4.some(([base, bits]) => inCidr4(ip, base, bits));
}

/** Expande una IPv6 a sus 8 grupos de 16 bits. `null` si no es válida. */
function expandV6(ip: string): number[] | null {
  let addr = ip.toLowerCase();
  const zone = addr.indexOf('%');
  if (zone >= 0) addr = addr.slice(0, zone);

  // Sufijo IPv4 embebido (::ffff:1.2.3.4) → dos grupos hex.
  const lastColon = addr.lastIndexOf(':');
  const tail = addr.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (isIP(tail) !== 4) return null;
    const n = ipv4ToInt(tail);
    addr = `${addr.slice(0, lastColon + 1)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }

  const [head, rest] = addr.split('::');
  if (addr.split('::').length > 2) return null;
  const h = head ? head.split(':') : [];
  const r = rest !== undefined ? (rest ? rest.split(':') : []) : [];
  const missing = 8 - h.length - r.length;
  if (rest === undefined ? h.length !== 8 : missing < 0) return null;

  const groups = [...h, ...Array(rest === undefined ? 0 : missing).fill('0'), ...r].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isFinite(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

/**
 * true si la IP es privada, de loopback, link-local, reservada, multicast o no
 * enrutable. Incluye las IPv6 que embeben una IPv4 (mapeada ::ffff:10.0.0.1,
 * NAT64 64:ff9b::a00:1, 6to4 2002:a00:1::). Una IP inválida cuenta como
 * privada: ante la duda, no se descarga.
 */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip.split('%')[0]);
  if (version === 4) return isPrivateV4(ip);
  if (version !== 6) return true;

  const g = expandV6(ip);
  if (!g) return true;

  // :: (sin especificar) y ::1 (loopback)
  if (g.slice(0, 7).every((x) => x === 0) && (g[7] === 0 || g[7] === 1)) return true;
  // fc00::/7 (ULA)
  if ((g[0] & 0xfe00) === 0xfc00) return true;
  // fe80::/10 (link-local)
  if ((g[0] & 0xffc0) === 0xfe80) return true;

  // ff00::/8 (multicast)
  if ((g[0] & 0xff00) === 0xff00) return true;
  // 100::/64 (discard)
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true;
  // 2001:db8::/32 (documentación) y 2001::/32 (Teredo: la IPv4 va ofuscada)
  if (g[0] === 0x2001 && (g[1] === 0x0db8 || g[1] === 0)) return true;
  // 64:ff9b:1::/48 (NAT64 de uso local)
  if (g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 1) return true;

  const v4 = (hi: number, lo: number) => `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`;

  // IPv4 mapeada (::ffff:a.b.c.d) o compatible (::a.b.c.d)
  const firstFive = g.slice(0, 5).every((x) => x === 0);
  if (firstFive && (g[5] === 0xffff || g[5] === 0)) return isPrivateV4(v4(g[6], g[7]));
  // NAT64 (64:ff9b::a.b.c.d): la pasarela conecta a la IPv4 embebida.
  if (g[0] === 0x0064 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPrivateV4(v4(g[6], g[7]));
  // 6to4 (2002:AABB:CCDD::/48): la IPv4 va en los grupos 1 y 2.
  if (g[0] === 0x2002) return isPrivateV4(v4(g[1], g[2]));

  return false;
}
