// ─── Cliente de la API de Higgsfield ──────────────────────────────────────────
//
// Imagen→video (Seedance, Kling…) en la cola de Higgsfield. Mismo esquema que
// fal: se encola, se guarda el handle y el motor (`lib/video/engine.ts`)
// consulta en cada vuelta — o Higgsfield avisa por webhook (`hf_webhook`).
//
//   POST {base}/{model}       → { status: 'queued', request_id, status_url, cancel_url }
//   GET  status_url           → { status: queued | in_progress | completed | failed | nsfw | canceled,
//                                 video?: { url }, error? }
//
// A diferencia de fal, el estado ya trae la salida: no hay `response_url`.
// Credenciales: `HIGGSFIELD_API_KEY` como `KEY_ID:KEY_SECRET` (lo que va en
// `Authorization: Key …`), o `HF_API_KEY_ID` + `HF_API_KEY_SECRET` por separado.
// Docs: https://docs.higgsfield.ai/docs/llms.txt

import { withProviderAlerts } from '@/lib/provider-alerts';

const API_BASE = 'https://api.higgsfield.ai';

export interface HiggsfieldHandle {
  provider:   'higgsfield';
  request_id: string;
  status_url: string;
  model:      string;
}

export type HiggsfieldPoll =
  | { status: 'pending' }
  | { status: 'done'; output: Record<string, unknown> }
  | { status: 'failed'; error: string };

function credentials(): string | null {
  const joined = process.env.HIGGSFIELD_API_KEY?.trim();
  if (joined && joined.includes(':')) return joined;
  const id = process.env.HF_API_KEY_ID?.trim();
  const secret = process.env.HF_API_KEY_SECRET?.trim();
  return id && secret ? `${id}:${secret}` : null;
}

export function higgsfieldConfigured(): boolean {
  return credentials() !== null;
}

function authHeader(): string {
  const creds = credentials();
  if (!creds) throw new Error('Missing HIGGSFIELD_API_KEY env var (KEY_ID:KEY_SECRET)');
  return `Key ${creds}`;
}

// `fetch` se resuelve en cada llamada (no al cargar el módulo): así los tests
// pueden sustituirlo.
const hfFetch = withProviderAlerts('higgsfield', (input, init) => fetch(input, init));

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  return `higgsfield ${res.status}: ${text.slice(0, 300)}`;
}

/**
 * Encola un trabajo. `idempotencyKey` hace que reenviar el mismo intento (tras
 * un timeout ambiguo) no cree ni cobre un segundo trabajo.
 */
export async function higgsfieldSubmit(
  model: string,
  input: Record<string, unknown>,
  opts: { webhookUrl?: string; idempotencyKey?: string } = {},
): Promise<HiggsfieldHandle> {
  const url = new URL(`${API_BASE}/${model}`);
  if (opts.webhookUrl) url.searchParams.set('hf_webhook', opts.webhookUrl);

  const res = await hfFetch(url.toString(), {
    method:  'POST',
    headers: {
      Authorization:  authHeader(),
      'Content-Type': 'application/json',
      ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));

  const data = await res.json() as { request_id?: string; status_url?: string };
  if (!data.request_id) throw new Error('higgsfield: la respuesta no trae request_id');
  return {
    provider:   'higgsfield',
    request_id: data.request_id,
    // Se usa la URL que devuelve la API; armarla a mano solo si no viene.
    status_url: data.status_url ?? `${API_BASE}/requests/${data.request_id}/status`,
    model,
  };
}

/** Estado de un trabajo encolado; si terminó, trae la salida. */
export async function higgsfieldPoll(handle: HiggsfieldHandle): Promise<HiggsfieldPoll> {
  const res = await hfFetch(handle.status_url, { headers: { Authorization: authHeader() } });
  if (!res.ok) {
    // 401/404: credenciales o request que no van a aparecer reintentando.
    // 408, 429 y 5xx: se vuelve a mirar después. Dar por fallido un trabajo
    // que sigue corriendo lo haría pagar dos veces.
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      return { status: 'failed', error: await readError(res) };
    }
    return { status: 'pending' };
  }

  const data = await res.json() as Record<string, unknown> & { status?: string; error?: unknown };
  switch (data.status) {
    case 'queued':
    case 'in_progress':
      return { status: 'pending' };
    case 'completed':
      return { status: 'done', output: data };
    case 'nsfw':
      return { status: 'failed', error: 'higgsfield: rechazado por moderación (nsfw)' };
    default:
      return {
        status: 'failed',
        error:  typeof data.error === 'string' && data.error
          ? `higgsfield: ${data.error.slice(0, 300)}`
          : `higgsfield status ${data.status ?? 'desconocido'}`,
      };
  }
}

/** URL del video de una salida de Higgsfield (`video.url`, o `videos[0].url`). */
export function higgsfieldVideoUrl(output: Record<string, unknown>): string | null {
  const video = output.video as { url?: unknown } | undefined;
  if (video && typeof video.url === 'string') return video.url;
  const videos = output.videos as Array<{ url?: unknown }> | undefined;
  if (Array.isArray(videos) && typeof videos[0]?.url === 'string') return videos[0].url as string;
  return null;
}
