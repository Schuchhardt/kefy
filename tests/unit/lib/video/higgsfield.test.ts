import { describe, it, expect, vi, afterEach } from 'vitest';
import { higgsfieldConfigured, higgsfieldPoll, higgsfieldSubmit, higgsfieldVideoUrl } from '@/lib/video/higgsfield';

const MODEL = 'bytedance/seedance-2.0/image-to-video';
const handle = {
  provider: 'higgsfield' as const, request_id: 'r1', model: MODEL,
  status_url: 'https://api.higgsfield.ai/requests/r1/status',
};

function mockFetch(...responses: Array<{ status: number; body: unknown }>) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(new Response(JSON.stringify(r.body), { status: r.status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.HIGGSFIELD_API_KEY;
  delete process.env.HF_API_KEY_ID;
  delete process.env.HF_API_KEY_SECRET;
});

describe('Higgsfield', () => {
  it('acepta la clave como ID:SECRET o en dos variables', () => {
    expect(higgsfieldConfigured()).toBe(false);
    process.env.HIGGSFIELD_API_KEY = 'solo-id';
    expect(higgsfieldConfigured()).toBe(false);
    process.env.HIGGSFIELD_API_KEY = 'id:secret';
    expect(higgsfieldConfigured()).toBe(true);
    delete process.env.HIGGSFIELD_API_KEY;
    process.env.HF_API_KEY_ID = 'id';
    process.env.HF_API_KEY_SECRET = 'secret';
    expect(higgsfieldConfigured()).toBe(true);
  });

  it('encola con la clave, el webhook y la clave de idempotencia', async () => {
    process.env.HIGGSFIELD_API_KEY = 'id:secret';
    const fetch = mockFetch({ status: 200, body: { status: 'queued', request_id: 'r1', status_url: handle.status_url } });
    const h = await higgsfieldSubmit(MODEL, { image_url: 'https://i.jpg' }, {
      webhookUrl: 'https://app/api/webhooks/video?step=1&sig=a', idempotencyKey: 'kefy-j-anim_s1-1',
    });
    expect(h).toEqual(handle);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toContain(`https://api.higgsfield.ai/${MODEL}?hf_webhook=https%3A%2F%2Fapp%2Fapi%2Fwebhooks%2Fvideo`);
    expect(init.headers.Authorization).toBe('Key id:secret');
    expect(init.headers['Idempotency-Key']).toBe('kefy-j-anim_s1-1');
  });

  it('en cola o en curso sigue pendiente; completo trae el video en el mismo estado', async () => {
    process.env.HIGGSFIELD_API_KEY = 'id:secret';
    for (const status of ['queued', 'in_progress']) {
      mockFetch({ status: 200, body: { status } });
      expect(await higgsfieldPoll(handle)).toEqual({ status: 'pending' });
    }
    mockFetch({ status: 200, body: { status: 'completed', request_id: 'r1', video: { url: 'https://v.mp4' } } });
    const done = await higgsfieldPoll(handle);
    expect(done.status === 'done' && higgsfieldVideoUrl(done.output)).toBe('https://v.mp4');
  });

  it('failed, nsfw y canceled son fallos; 408, 429 y 5xx se vuelven a mirar', async () => {
    process.env.HIGGSFIELD_API_KEY = 'id:secret';
    for (const status of ['failed', 'nsfw', 'canceled']) {
      mockFetch({ status: 200, body: { status, error: status === 'failed' ? 'Generation failed' : null } });
      expect((await higgsfieldPoll(handle)).status).toBe('failed');
    }
    for (const status of [408, 429, 503]) {
      mockFetch({ status, body: {} });
      expect(await higgsfieldPoll(handle)).toEqual({ status: 'pending' });
    }
    mockFetch({ status: 404, body: { detail: 'not found' } });
    expect((await higgsfieldPoll(handle)).status).toBe('failed');
  });
});
