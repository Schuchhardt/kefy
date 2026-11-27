// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';
import { IDS, AUTH, seedWorkspace, apiCtx } from '../../helpers/assistant';
import { quotaState, resetQuotaState } from '../../helpers/quota';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn(), reportWarning: vi.fn() }));

import { executeTool } from '@/lib/assistant/registry';
import { ensureToolsRegistered } from '@/lib/assistant/tools';
import { chatToolContext } from '@/lib/assistant/context';
import { serviceContext } from '@/lib/services/context';
import { buildFeedbackIssue, sanitizeFeedbackText, submitFeedback } from '@/lib/services/feedback';

// Reportes de usuarios: el asistente registra errores e ideas como issues de
// GitHub con su etiqueta. El repo puede ser público, así que el texto va sin
// datos personales.

const ctx = serviceContext(AUTH, IDS.BRAND, 'es', { brandScope: 'strict', source: 'route' });
const fetchMock = vi.fn();

beforeEach(() => {
  db.reset();
  resetQuotaState();
  seedWorkspace(db);
  ensureToolsRegistered();
  vi.stubEnv('GITHUB_FEEDBACK_TOKEN', 'test-token');
  vi.stubEnv('GITHUB_FEEDBACK_REPO', 'acme/kefy');
  fetchMock.mockReset().mockImplementation(async () =>
    new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/acme/kefy/issues/42' }), { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const sentBody = () => JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as {
  title: string; body: string; labels: string[];
};

describe('sanitizeFeedbackText', () => {
  it('quita correos, teléfonos, tokens y menciones', () => {
    const out = sanitizeFeedbackText('Escríbanme a ana@acme.cl o al +56 9 1234 5678, key kefy_sk_abcdefghijklmnop, cc @schuchhardt');
    expect(out).not.toContain('ana@acme.cl');
    expect(out).not.toContain('1234 5678');
    expect(out).not.toContain('kefy_sk_abcdefghijklmnop');
    expect(out).toContain('@​schuchhardt');
  });
});

describe('submitFeedback', () => {
  it('un error se registra con las etiquetas bug y reportado-por-usuario', async () => {
    const out = await submitFeedback(ctx, {
      type: 'bug', title: 'El calendario no muestra los reels', description: 'Programé un reel y no aparece en el calendario.',
      steps: '1. Crear reel 2. Programar', page: '/es/dashboard/calendar',
    });

    expect(out).toMatchObject({ issue_number: 42, url: 'https://github.com/acme/kefy/issues/42', labels: ['bug', 'reportado-por-usuario'] });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/acme/kefy/issues');
    const body = sentBody();
    expect(body.labels).toEqual(['bug', 'reportado-por-usuario']);
    expect(body.body).toContain('Pasos para reproducirlo');
    expect(body.body).toContain(IDS.ORG);
  });

  it('una idea va como enhancement', async () => {
    await submitFeedback(ctx, { type: 'feature_request', title: 'Publicar en Pinterest', description: 'Quiero publicar mis posts en Pinterest.' });
    expect(sentBody().labels).toEqual(['enhancement', 'reportado-por-usuario']);
  });

  it('el cuerpo no lleva el correo ni el nombre de la persona', () => {
    const issue = buildFeedbackIssue(ctx, { type: 'bug', title: 'Falla', description: 'Soy ana@acme.cl y no puedo publicar' });
    expect(issue.body).not.toContain('ana@acme.cl');
  });

  it('sin configuración responde unavailable sin llamar a GitHub', async () => {
    vi.stubEnv('GITHUB_FEEDBACK_TOKEN', '');
    await expect(submitFeedback(ctx, { type: 'bug', title: 'Falla x', description: 'No funciona nada' }))
      .rejects.toMatchObject({ code: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('si GitHub falla responde provider_error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"message":"Bad credentials"}', { status: 401 }));
    await expect(submitFeedback(ctx, { type: 'bug', title: 'Falla x', description: 'No funciona nada' }))
      .rejects.toMatchObject({ code: 'provider_error' });
  });

  it('pasado el tope de reportes responde rate_limited sin llamar a GitHub', async () => {
    quotaState.rateLimited = true;
    await expect(submitFeedback(ctx, { type: 'bug', title: 'Falla 6', description: 'No funciona nada' }))
      .rejects.toMatchObject({ code: 'rate_limited' });
    expect(fetchMock).not.toHaveBeenCalled();
    const buckets = quotaState.calls.filter((c) => c.fn === 'kefy_rate_limit_hit').map((c) => String(c.args.p_bucket));
    expect(buckets[0]).toBe(`feedback:user:${AUTH.userId}`);
  });
});

describe('report_issue', () => {
  it('en el chat siempre pide confirmación antes de crear el issue', async () => {
    const chat = chatToolContext({ auth: AUTH, brandId: IDS.BRAND, language: 'es', conversationId: IDS.uuid(100), turnId: IDS.uuid(101), tainted: false });
    const r = await executeTool('report_issue', { type: 'bug', title: 'No carga la bandeja', description: 'La bandeja de DMs queda cargando.' }, chat);
    expect(r.ok).toBe('pending');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('por la API crea el issue sin exigir brand_id', async () => {
    const r = await executeTool('report_issue', { type: 'feature_request', title: 'Exportar a CSV', description: 'Quiero exportar el calendario.' }, apiCtx());
    expect(r.ok).toBe(true);
    expect((r as { data: Record<string, unknown> }).data).toMatchObject({ issue_number: 42, labels: ['enhancement', 'reportado-por-usuario'] });
  });
});
