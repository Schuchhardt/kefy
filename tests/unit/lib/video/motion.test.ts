import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

vi.mock('@/lib/video/tools/voice', () => ({
  transcribeWordTimings: vi.fn(async () => [{ start: 0.4, end: 0.8 }, { start: 0.8, end: 1.3 }]),
}));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

import { animateImageTool, speechInClipAvailable } from '@/lib/video/tools/motion';
import { transcribeWordTimings } from '@/lib/video/tools/voice';

const ctx = { orgId: 'o', jobId: 'j', stepKey: 'anim_s1', attempt: 2, webhookUrl: 'https://app/hook' };
const STATUS_URL = 'https://api.higgsfield.ai/requests/r1/status';

function queue(...responses: Response[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => { process.env.HIGGSFIELD_API_KEY = 'id:secret'; });
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.HIGGSFIELD_API_KEY; delete process.env.HIGGSFIELD_ANIMATE_MODEL; delete process.env.FAL_KEY;
});

describe('animate_image con Higgsfield', () => {
  it('usa Higgsfield si está configurado, aunque también haya FAL_KEY', () => {
    process.env.FAL_KEY = 'k';
    expect(animateImageTool.provider).toBe('higgsfield');
    expect(animateImageTool.available()).toBe(true);
  });

  it('por defecto usa Kling 2.5 Turbo: clip mudo de 5 o 10 s, sin resolución ni audio', async () => {
    const fetch = queue(
      json({ status: 'queued', request_id: 'r1', status_url: STATUS_URL }),
      json({ status: 'queued', request_id: 'r2', status_url: STATUS_URL }),
    );
    const res = await animateImageTool.run(ctx, { image_url: 'https://i.jpg', prompt: 'drift', duration: 10 });
    await animateImageTool.run(ctx, { image_url: 'https://i.jpg', prompt: 'says', duration: 7, speech: 'Hola', language: 'es' });

    expect(String(fetch.mock.calls[0]![0])).toBe('https://api.higgsfield.ai/kling-video/v2.5-turbo/standard/image-to-video?hf_webhook=https%3A%2F%2Fapp%2Fhook');
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
      image_url: 'https://i.jpg', prompt: 'drift', duration: 10, negative_prompt: expect.any(String),
    });
    // Kling no dice líneas: la voz no viaja en el handle y la duración se redondea a 5.
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toMatchObject({ duration: 5 });
    expect(res).toMatchObject({ status: 'pending', handle: { clip_seconds: 10 } });
    expect(speechInClipAvailable()).toBe(false);
  });

  it('con Seedance, un plano mudo no pide audio; uno que habla sí, y el clip queda dentro de 4–15 s', async () => {
    process.env.HIGGSFIELD_ANIMATE_MODEL = 'bytedance/seedance-2.0/image-to-video';
    expect(speechInClipAvailable()).toBe(true);
    const fetch = queue(
      json({ status: 'queued', request_id: 'r1', status_url: STATUS_URL }),
      json({ status: 'queued', request_id: 'r2', status_url: STATUS_URL }),
    );
    await animateImageTool.run(ctx, { image_url: 'https://i.jpg', prompt: 'drift', duration: 5 });
    const speaking = await animateImageTool.run(ctx, { image_url: 'https://i.jpg', prompt: 'says', duration: 30, speech: 'Hola a todos', language: 'es' });

    const mute = JSON.parse(fetch.mock.calls[0]![1].body);
    const talk = JSON.parse(fetch.mock.calls[1]![1].body);
    expect(mute).toEqual({ image_url: 'https://i.jpg', prompt: 'drift', duration: 5, resolution: '720p', generate_audio: false });
    expect(talk).toMatchObject({ generate_audio: true, duration: 15 });
    expect(fetch.mock.calls[0]![1].headers['Idempotency-Key']).toBe('kefy-j-anim_s1-2');
    expect(speaking).toMatchObject({ status: 'pending', handle: { provider: 'higgsfield', speech: 'Hola a todos', clip_seconds: 15 } });
  });

  it('al terminar un clip que habla, lo transcribe para los subtítulos', async () => {
    queue(
      json({ status: 'completed', request_id: 'r1', video: { url: 'https://cdn/clip.mp4' } }),
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    const res = await animateImageTool.poll!(ctx, {
      provider: 'higgsfield', request_id: 'r1', status_url: STATUS_URL, model: 'm', clip_seconds: 6, speech: 'Hola todos', language: 'es',
    });
    expect(transcribeWordTimings).toHaveBeenCalledWith(expect.any(Buffer), 'clip.mp4', 'video/mp4', 'es', 'anim_s1');
    expect(res).toEqual({
      status: 'done',
      output: {
        video_url: 'https://cdn/clip.mp4', clip_seconds: 6, has_audio: true,
        words: [{ text: 'Hola', start: 0.4, end: 0.8 }, { text: 'todos', start: 0.8, end: 1.3 }],
      },
    });
  });

  it('un handle de fal (encargado antes del cambio) se sigue consultando en fal', async () => {
    process.env.FAL_KEY = 'k';
    const fetch = queue(json({ status: 'IN_PROGRESS' }));
    const handle = { request_id: 'f1', status_url: 'https://queue.fal.run/x/requests/f1/status', response_url: 'https://queue.fal.run/x/requests/f1', model: 'x', clip_seconds: 5 };
    expect(await animateImageTool.poll!(ctx, handle)).toEqual({ status: 'pending', handle });
    expect(String(fetch.mock.calls[0]![0])).toContain('queue.fal.run');
  });
});
