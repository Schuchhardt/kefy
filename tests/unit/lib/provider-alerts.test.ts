import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabaseClient = { rpc: vi.fn() };
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => mockSupabaseClient }));

const sendMock = vi.fn().mockResolvedValue({});
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock }; } }));
vi.mock('@react-email/render', () => ({ render: vi.fn().mockResolvedValue('<html></html>') }));

import { checkProviderExhaustion, withProviderAlerts } from '@/lib/provider-alerts';

const ORIGINAL_ENV = { ...process.env };

function mockRpcCount(count: number) {
  mockSupabaseClient.rpc.mockResolvedValue({ data: count, error: null });
}

describe('checkProviderExhaustion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      RESEND_API_KEY: 'test-key',
      PLATFORM_ALERT_EMAIL: 'ops@example.com',
    };
  });

  it('OpenAI: 429 + insufficient_quota manda el correo', async () => {
    mockRpcCount(1); // primer hit de la ventana
    await checkProviderExhaustion('openai', 429, JSON.stringify({
      error: { message: 'You exceeded your current quota, please check your plan and billing details.', code: 'insufficient_quota' },
    }));
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].to).toBe('ops@example.com');
  });

  it('Anthropic: 400 + "credit balance is too low" manda el correo', async () => {
    mockRpcCount(1);
    await checkProviderExhaustion('anthropic', 400, JSON.stringify({
      error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Claude API.' },
    }));
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('no manda nada si el status no es el de agotamiento', async () => {
    mockRpcCount(1);
    await checkProviderExhaustion('openai', 500, 'insufficient_quota');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('no manda nada si el texto no calza (otro tipo de 429, ej. rate limit normal)', async () => {
    mockRpcCount(1);
    await checkProviderExhaustion('openai', 429, JSON.stringify({ error: { message: 'Rate limit reached for requests', code: 'rate_limit_exceeded' } }));
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('no repite el correo dentro de la misma ventana (debounce)', async () => {
    mockRpcCount(2); // ya hubo un hit antes en esta ventana -> allowed=false con limit:1
    await checkProviderExhaustion('openai', 429, 'insufficient_quota');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sin PLATFORM_ALERT_EMAIL configurado, no falla y no manda nada', async () => {
    delete process.env.PLATFORM_ALERT_EMAIL;
    mockRpcCount(1);
    await expect(checkProviderExhaustion('openai', 429, 'insufficient_quota')).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('nunca lanza, incluso si Resend falla', async () => {
    mockRpcCount(1);
    sendMock.mockRejectedValueOnce(new Error('resend down'));
    await expect(
      checkProviderExhaustion('openai', 429, 'insufficient_quota'),
    ).resolves.toBeUndefined();
  });
});

describe('withProviderAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, RESEND_API_KEY: 'test-key', PLATFORM_ALERT_EMAIL: 'ops@example.com' };
  });

  it('deja pasar la respuesta original sin tocarla', async () => {
    mockRpcCount(1);
    const baseFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'insufficient_quota', message: 'exceeded your current quota' } }), { status: 429 }),
    );
    const wrapped = withProviderAlerts('openai', baseFetch as unknown as typeof fetch);
    const res = await wrapped('https://api.openai.com/v1/x');
    expect(res.status).toBe(429);
    // el body sigue siendo legible por el llamador real (no se consumió el original)
    const body = await res.json();
    expect(body.error.code).toBe('insufficient_quota');
  });

  it('con una respuesta ok, no dispara nada', async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const wrapped = withProviderAlerts('openai', baseFetch as unknown as typeof fetch);
    await wrapped('https://api.openai.com/v1/x');
    // deja que la inspección async (fire-and-forget) corra, si la hubiera
    await new Promise((r) => setTimeout(r, 0));
    expect(sendMock).not.toHaveBeenCalled();
  });
});
