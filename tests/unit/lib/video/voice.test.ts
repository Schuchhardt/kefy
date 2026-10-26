import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const speechCreate = vi.fn();
const transcribe   = vi.fn(async () => ({ words: [] }));
vi.mock('@/lib/ai', () => ({
  getOpenAI: () => ({ audio: { speech: { create: speechCreate }, transcriptions: { create: transcribe } } }),
}));
vi.mock('@/lib/storage', () => ({
  uploadVideoAsset: vi.fn(async (_buf: Buffer, _org: string, name: string) => `https://storage/${name}`),
}));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/provider-alerts', () => ({
  withProviderAlerts: (_p: string, f: typeof fetch) => f,
}));

import { textToSpeechTool } from '@/lib/video/tools/voice';
import { uploadVideoAsset } from '@/lib/storage';

const ctx = { orgId: 'o', jobId: 'j', stepKey: 'voice_s1' };

const elevenBody = {
  audio_base64: Buffer.from('mp3-bytes').toString('base64'),
  alignment: {
    characters:                    ['H', 'o', 'l', 'a', ' ', 'y', 'a'],
    character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    character_end_times_seconds:   [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.9],
  },
};

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = 'xi-key';
  process.env.ELEVENLABS_VOICE_ID = 'voice123';
  process.env.OPENAI_API_KEY = 'sk';
  speechCreate.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_MODEL', 'OPENAI_API_KEY']) delete process.env[k];
});

describe('text_to_speech con ElevenLabs', () => {
  it('usa la voz del env, Flash v2.5 con el idioma, y toma los tiempos de la alineación', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(elevenBody), { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    expect(textToSpeechTool.provider).toBe('elevenlabs');
    const res = await textToSpeechTool.run(ctx, { text: 'Hola ya', voice: 'nova', language: 'es' });

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice123/with-timestamps?output_format=mp3_44100_128');
    expect(init.headers['xi-api-key']).toBe('xi-key');
    expect(JSON.parse(init.body)).toEqual({ text: 'Hola ya', model_id: 'eleven_flash_v2_5', language_code: 'es' });
    expect(uploadVideoAsset).toHaveBeenCalledWith(Buffer.from('mp3-bytes'), 'o', 'voice-voice_s1.mp3', 'audio/mpeg');
    expect(speechCreate).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
    expect(res).toEqual({
      status: 'done',
      output: {
        audio_url:        'https://storage/voice-voice_s1.mp3',
        duration_seconds: 0.9,
        words:            [{ text: 'Hola', start: 0, end: 0.4 }, { text: 'ya', start: 0.5, end: 0.9 }],
      },
    });
  });

  it('la voz dice la dirección hablada y el subtítulo conserva la escrita', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(elevenBody), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const res = await textToSpeechTool.run(ctx, { text: 'En depando.cl', language: 'es' });
    expect(JSON.parse(fetch.mock.calls[0]![1].body).text).toBe('En depando punto ce ele');
    expect(res).toMatchObject({ status: 'done', output: { words: [{ text: 'En' }, { text: 'depando.cl' }] } });
  });

  it('multilingual_v2 no recibe language_code', async () => {
    process.env.ELEVENLABS_MODEL = 'eleven_multilingual_v2';
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(elevenBody), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await textToSpeechTool.run(ctx, { text: 'Hola ya', language: 'es' });
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ text: 'Hola ya', model_id: 'eleven_multilingual_v2' });
  });

  it('un 409 already_running (voces a la vez) se reintenta en vez de caer a OpenAI', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{"detail":{"status":"already_running"}}', { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(elevenBody), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const pending = textToSpeechTool.run(ctx, { text: 'Hola ya', language: 'es' });
    await vi.runAllTimersAsync();
    const res = await pending;
    vi.useRealTimers();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(speechCreate).not.toHaveBeenCalled();
    expect(res).toMatchObject({ status: 'done', output: { audio_url: 'https://storage/voice-voice_s1.mp3' } });
  });

  it('si ElevenLabs falla, la voz sale de OpenAI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":{"status":"quota_exceeded"}}', { status: 401 })));
    speechCreate.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(0) });
    const res = await textToSpeechTool.run(ctx, { text: 'Hola ya', voice: 'nova', language: 'es' });
    expect(speechCreate).toHaveBeenCalledWith(expect.objectContaining({ voice: 'nova', response_format: 'wav' }));
    expect(res).toMatchObject({ status: 'done', output: { audio_url: 'https://storage/voice-voice_s1.wav' } });
  });

  it('sin voice_id no se usa ElevenLabs', () => {
    delete process.env.ELEVENLABS_VOICE_ID;
    expect(textToSpeechTool.provider).toBe('openai');
  });
});
