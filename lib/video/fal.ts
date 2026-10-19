// ─── Cliente de la cola de fal.ai ─────────────────────────────────────────────
//
// Los modelos de video (imagen→video, lipsync) tardan minutos: no caben en un
// request. fal.ai los corre en su cola: se envía el trabajo, se guarda el
// request_id y las URLs que devuelve, y el motor (`lib/video/engine.ts`)
// consulta el estado en cada vuelta — o fal avisa por webhook.
//
//   POST {queue}/{model}                    → { request_id, status_url, response_url }
//   GET  status_url                         → { status: IN_QUEUE | IN_PROGRESS | COMPLETED }
//   GET  response_url                       → salida del modelo (o error)
//
// Se guardan status_url/response_url tal cual los devuelve fal: para modelos
// con sub-ruta (`fal-ai/kling-video/v2.1/...`) la URL de estado usa solo el id
// de la app, y reconstruirla a mano es la forma clásica de pedir un 404.

import { withProviderAlerts } from '@/lib/provider-alerts';

const QUEUE_BASE = 'https://queue.fal.run';

export interface FalHandle {
  request_id:   string;
  status_url:   string;
  response_url: string;
  model:        string;
}

export type FalPoll =
  | { status: 'pending' }
  | { status: 'done'; output: Record<string, unknown> }
  | { status: 'failed'; error: string };

export function falConfigured(): boolean {
  return !!process.env.FAL_KEY;
}

function falKey(): string {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error('Missing FAL_KEY env var');
  return key;
}

// `fetch` se resuelve en cada llamada (no al cargar el módulo): así los tests
// pueden sustituirlo.
const falFetch = withProviderAlerts('fal', (input, init) => fetch(input, init));

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  return `fal ${res.status}: ${text.slice(0, 300)}`;
}

/** Encola un trabajo. `webhookUrl` (opcional) hace que fal avise al terminar. */
export async function falSubmit(
  model: string,
  input: Record<string, unknown>,
  webhookUrl?: string,
): Promise<FalHandle> {
  const url = new URL(`${QUEUE_BASE}/${model}`);
  if (webhookUrl) url.searchParams.set('fal_webhook', webhookUrl);

  const res = await falFetch(url.toString(), {
    method:  'POST',
    headers: { Authorization: `Key ${falKey()}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));

  const data = await res.json() as Partial<FalHandle>;
  if (!data.request_id || !data.status_url || !data.response_url) {
    throw new Error('fal: la respuesta de la cola no trae request_id/status_url/response_url');
  }
  return { request_id: data.request_id, status_url: data.status_url, response_url: data.response_url, model };
}

/** Estado de un trabajo encolado; si terminó, trae la salida. */
export async function falPoll(handle: FalHandle): Promise<FalPoll> {
  const headers = { Authorization: `Key ${falKey()}` };

  const statusRes = await falFetch(handle.status_url, { headers });
  if (!statusRes.ok) {
    // 4xx sobre el estado: el trabajo no existe (o la clave cambió) — no va a
    // aparecer reintentando. 5xx, 408 y 429 (tres vueltas consultando a la
    // vez): fal tuvo un problema o pidió calma, se vuelve a mirar después. Dar
    // por fallido un trabajo que sigue corriendo lo haría pagar dos veces.
    if (statusRes.status >= 400 && statusRes.status < 500 && statusRes.status !== 408 && statusRes.status !== 429) {
      return { status: 'failed', error: await readError(statusRes) };
    }
    return { status: 'pending' };
  }
  const status = await statusRes.json() as { status?: string; error?: string };

  if (status.status === 'IN_QUEUE' || status.status === 'IN_PROGRESS') return { status: 'pending' };
  if (status.status !== 'COMPLETED') {
    return { status: 'failed', error: status.error ?? `fal status ${status.status ?? 'desconocido'}` };
  }

  const resultRes = await falFetch(handle.response_url, { headers });
  if (resultRes.status === 408 || resultRes.status === 429 || resultRes.status >= 500) return { status: 'pending' };
  if (!resultRes.ok) return { status: 'failed', error: await readError(resultRes) };
  const output = await resultRes.json() as Record<string, unknown>;
  // Un trabajo COMPLETED puede traer el error del modelo en el cuerpo.
  if (output && typeof output.detail !== 'undefined' && !('video' in output)) {
    return { status: 'failed', error: `fal: ${JSON.stringify(output.detail).slice(0, 300)}` };
  }
  return { status: 'done', output };
}

/** URL del primer `video`/`video.url` que devuelva un modelo de fal. */
export function falVideoUrl(output: Record<string, unknown>): string | null {
  const video = output.video as { url?: unknown } | undefined;
  if (video && typeof video.url === 'string') return video.url;
  const videos = output.videos as Array<{ url?: unknown }> | undefined;
  if (Array.isArray(videos) && typeof videos[0]?.url === 'string') return videos[0].url as string;
  return null;
}
