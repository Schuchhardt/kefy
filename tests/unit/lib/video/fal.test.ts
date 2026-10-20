import { describe, it, expect, vi, afterEach } from 'vitest';
import { falPoll, falSubmit, falVideoUrl } from '@/lib/video/fal';

const handle = {
  request_id: 'r1', model: 'fal-ai/kling-video/v2.1/standard/image-to-video',
  status_url: 'https://queue.fal.run/fal-ai/kling-video/requests/r1/status',
  response_url: 'https://queue.fal.run/fal-ai/kling-video/requests/r1',
};

function mockFetch(...responses: Array<{ status: number; body: unknown }>) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(new Response(JSON.stringify(r.body), { status: r.status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => { vi.unstubAllGlobals(); delete process.env.FAL_KEY; });

describe('fal queue', () => {
  it('encola con la clave y el webhook, y guarda las URLs que devuelve fal', async () => {
    process.env.FAL_KEY = 'k';
    const fetch = mockFetch({ status: 200, body: handle });
    const h = await falSubmit(handle.model, { prompt: 'x' }, 'https://app/api/webhooks/video?step=1&sig=a');
    expect(h).toEqual(handle);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toContain('fal_webhook=https%3A%2F%2Fapp%2Fapi%2Fwebhooks%2Fvideo');
    expect(init.headers.Authorization).toBe('Key k');
  });

  it('en cola o en curso sigue pendiente; completo trae la salida', async () => {
    process.env.FAL_KEY = 'k';
    mockFetch({ status: 200, body: { status: 'IN_PROGRESS' } });
    expect(await falPoll(handle)).toEqual({ status: 'pending' });
    mockFetch({ status: 200, body: { status: 'COMPLETED' } }, { status: 200, body: { video: { url: 'https://v.mp4' } } });
    const done = await falPoll(handle);
    expect(done.status === 'done' && falVideoUrl(done.output)).toBe('https://v.mp4');
  });

  it('408, 429 y 5xx no son fallos: se vuelve a mirar (si no, se pagaría dos veces)', async () => {
    process.env.FAL_KEY = 'k';
    for (const status of [408, 429, 502]) {
      mockFetch({ status, body: {} });
      expect(await falPoll(handle)).toEqual({ status: 'pending' });
    }
    mockFetch({ status: 200, body: { status: 'COMPLETED' } }, { status: 429, body: {} });
    expect(await falPoll(handle)).toEqual({ status: 'pending' });
  });

  it('un 404 sobre el estado sí es un fallo: el trabajo no existe', async () => {
    process.env.FAL_KEY = 'k';
    mockFetch({ status: 404, body: { detail: 'not found' } });
    expect((await falPoll(handle)).status).toBe('failed');
  });

  it('COMPLETED con error es un fallo, sin esperar al timeout', async () => {
    process.env.FAL_KEY = 'k';
    mockFetch({ status: 200, body: { status: 'COMPLETED', error: 'model crashed' } });
    expect(await falPoll(handle)).toEqual({ status: 'failed', error: 'fal: model crashed' });
  });
});
