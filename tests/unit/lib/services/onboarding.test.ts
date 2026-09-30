// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';
import {
  creditsSpent, quotaState, refundCount, resetQuotaState, resetSubscriptionState, subscriptionState,
} from '../../helpers/quota';
import { IDS, AUTH, apiCtx, seedWorkspace, seedSubscriptions } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai')>();
  return { ...actual, generateContentText: vi.fn() };
});

// Firecrawl: dos lecturas por web (identidad JSON + branding).
const scrape = vi.fn();
vi.mock('@mendable/firecrawl-js', () => ({
  default: class { scrape = scrape; },
}));

import { generateContentText } from '@/lib/ai';
import { serviceContext } from '@/lib/services/context';
import { ServiceError } from '@/lib/services/errors';
import { STARTER_ANGLES, createStarterPosts } from '@/lib/services/onboarding';
import { fillEmptyFields, mapFirecrawlResult, validateWebsiteUrl } from '@/lib/services/brand-enrich';
import { executeTool } from '@/lib/assistant/registry';
import { ensureToolsRegistered } from '@/lib/assistant/tools';
import { chatToolContext } from '@/lib/assistant/context';

// «Pega tu web o describe tu negocio → 3 posts»: lee la web (1 crédito), solo
// rellena lo vacío del Brand Kit y escribe 3 borradores (1 crédito cada uno).

const ctx = () => serviceContext(AUTH, IDS.BRAND, 'es', { brandScope: 'org', source: 'route' });
const KIT_ID = IDS.uuid(600);

function webDevuelve(json: Record<string, unknown>, branding: Record<string, unknown> = {}) {
  scrape.mockImplementation(async (_url: string, opts: { formats: unknown[] }) => (
    JSON.stringify(opts.formats).includes('branding') ? { branding } : { json }
  ));
}

async function codigoDe(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (err) { return err instanceof ServiceError ? err.code : 'otro'; }
  return 'sin error';
}

beforeEach(() => {
  db.reset();
  resetQuotaState();
  resetSubscriptionState();
  vi.clearAllMocks();
  seedWorkspace(db);
  process.env.FIRECRAWL_API_KEY = 'fc-test';
  db.seed('kefy_brand_kits', [{
    id: KIT_ID, org_id: IDS.ORG, brand_id: IDS.BRAND, name: 'Acme Café', tagline: 'Café de barrio',
    tone: [], mission: null, industry: null, primary_color: null, website_url: null,
    customer_locations: [], differentiators: [], competitors: [], social_urls: {},
  }]);
  let n = 0;
  vi.mocked(generateContentText).mockImplementation(async () => {
    n += 1;
    return { body: `Post ${n}`, hashtags: ['cafe'], model: 'claude', tokensUsed: 10 };
  });
});

describe('createStarterPosts', () => {
  it('con una descripción escribe 3 borradores con enfoques distintos y cobra 3 créditos', async () => {
    const out = await createStarterPosts(ctx(), { description: 'Café de especialidad en Providencia' });

    expect(out.posts.map((p) => p.angle)).toEqual([...STARTER_ANGLES]);
    expect(out.failed).toBe(0);
    expect(creditsSpent()).toBe(3);
    expect(scrape).not.toHaveBeenCalled();

    const items = db.rows('kefy_content_items');
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.brand_id === IDS.BRAND && i.status === 'draft' && i.channel === 'instagram')).toBe(true);

    // La descripción llega a los tres prompts y se guarda como misión (estaba vacía).
    for (const call of vi.mocked(generateContentText).mock.calls) {
      expect(String(call[0].topic)).toContain('Café de especialidad en Providencia');
    }
    expect(out.filled).toEqual(['mission']);
    expect(db.find('kefy_brand_kits', (k) => k.id === KIT_ID)?.mission).toBe('Café de especialidad en Providencia');
  });

  it('con web: cobra la lectura y solo rellena los campos vacíos', async () => {
    webDevuelve(
      { name: 'Otro Nombre', tagline: 'Otra frase', industry: 'Cafetería', target_audience: 'Oficinistas' },
      { colors: { primary: '#112233', secondary: 'rgb(1,2,3)' } },
    );

    const out = await createStarterPosts(ctx(), { url: 'acmecafe.cl' });

    expect(creditsSpent()).toBe(4);
    const kit = db.find('kefy_brand_kits', (k) => k.id === KIT_ID)!;
    // Lo que la persona ya tenía no se toca.
    expect(kit.name).toBe('Acme Café');
    expect(kit.tagline).toBe('Café de barrio');
    // Lo vacío se rellena; el color con mala forma se descarta.
    expect(kit.industry).toBe('Cafetería');
    expect(kit.target_audience).toBe('Oficinistas');
    expect(kit.primary_color).toBe('#112233');
    expect(kit.secondary_color ?? null).toBeNull();
    expect(kit.website_url).toBe('https://acmecafe.cl');
    expect(out.filled).toEqual(expect.arrayContaining(['industry', 'target_audience', 'primary_color', 'website_url']));
    expect(out.filled).not.toContain('name');
  });

  it('si la web no se puede leer y hay descripción, sigue y devuelve el crédito de la lectura', async () => {
    scrape.mockRejectedValue(new Error('timeout'));

    const out = await createStarterPosts(ctx(), { url: 'https://acmecafe.cl', description: 'Café de barrio' });

    expect(out.posts).toHaveLength(3);
    expect(out.websiteError).toBeTruthy();
    expect(refundCount()).toBe(1);
  });

  it('si la web no se puede leer y no hay descripción, pide describir el negocio', async () => {
    scrape.mockRejectedValue(new Error('timeout'));

    await expect(createStarterPosts(ctx(), { url: 'https://acmecafe.cl' })).rejects.toMatchObject({
      code: 'provider_error', body: expect.objectContaining({ websiteUnreadable: true }),
    });
    expect(db.rows('kefy_content_items')).toHaveLength(0);
    expect(refundCount()).toBe(1);
  });

  it('sin web ni descripción no gasta nada', async () => {
    expect(await codigoDe(createStarterPosts(ctx(), {}))).toBe('invalid_input');
    expect(await codigoDe(createStarterPosts(ctx(), { url: 'no es una url' }))).toBe('invalid_input');
    expect(quotaState.calls.filter((c) => c.fn === 'kefy_credits_consume')).toHaveLength(0);
  });

  it('con el mes gratis vencido no lee la web ni genera', async () => {
    subscriptionState.daysLeft = -1;
    seedSubscriptions(db);

    expect(await codigoDe(createStarterPosts(ctx(), { url: 'https://acmecafe.cl', description: 'x' })))
      .toBe('subscription_required');
    expect(scrape).not.toHaveBeenCalled();
    expect(db.rows('kefy_content_items')).toHaveLength(0);
  });

  it('si un post falla entrega los otros dos y devuelve su crédito', async () => {
    vi.mocked(generateContentText)
      .mockResolvedValueOnce({ body: 'Uno', hashtags: [], model: 'claude', tokensUsed: 1 })
      .mockRejectedValueOnce(new Error('overloaded'))
      .mockResolvedValueOnce({ body: 'Tres', hashtags: [], model: 'claude', tokensUsed: 1 });

    const out = await createStarterPosts(ctx(), { description: 'Café de barrio' });

    expect(out.posts).toHaveLength(2);
    expect(out.failed).toBe(1);
    expect(refundCount()).toBe(1);
  });

  it('si no sale ninguno, propaga el motivo (p. ej. créditos agotados)', async () => {
    quotaState.quotaAllowed = false;
    expect(await codigoDe(createStarterPosts(ctx(), { description: 'Café de barrio' }))).toBe('credits_exhausted');
  });
});

describe('brand-enrich', () => {
  it('validateWebsiteUrl normaliza y rechaza lo que no es una web', () => {
    expect(validateWebsiteUrl('acme.cl')).toBe('https://acme.cl');
    expect(() => validateWebsiteUrl('localhost')).toThrow(ServiceError);
    expect(() => validateWebsiteUrl('')).toThrow(ServiceError);
  });

  it('mapFirecrawlResult recorta textos y descarta valores vacíos', () => {
    expect(mapFirecrawlResult(
      { name: '  Acme ', tagline: '   ', tone: ['friendly'], competitors: [] },
      { logo: 'data:image/png;base64,x', colors: { primary: '#000000' } },
    )).toEqual({ name: 'Acme', tone: ['friendly'], primary_color: '#000000' });
  });

  it('fillEmptyFields no pisa lo que ya tiene valor', () => {
    expect(fillEmptyFields(
      { name: 'Mía', tone: [], social_urls: {} },
      { name: 'De la web', tone: ['casual'], social_urls: { instagram: 'https://instagram.com/acme' } },
    )).toEqual({ tone: ['casual'], social_urls: { instagram: 'https://instagram.com/acme' } });
  });
});

// ─── Herramientas del asistente ───────────────────────────────────────────────
// Las mismas capacidades por el chat, la API y MCP (AGENTS.md: servicio +
// herramienta, nunca lógica en la ruta).

describe('herramientas import_brand_from_website y create_starter_posts', () => {
  beforeEach(() => {
    ensureToolsRegistered();
  });

  it('import_brand_from_website rellena lo vacío, cobra 1 crédito y contamina el turno', async () => {
    webDevuelve({ name: 'Otro', industry: 'Cafetería' });
    const r = await executeTool('import_brand_from_website', { url: 'acmecafe.cl', brand_id: IDS.BRAND }, apiCtx());
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.data).toMatchObject({ filled: expect.arrayContaining(['industry', 'website_url']), kept: ['name'] });
    expect(r.tainted).toBe(true);
    expect(creditsSpent()).toBe(1);
  });

  it('un miembro no puede cambiar el perfil de marca desde la web', async () => {
    const r = await executeTool('import_brand_from_website', { url: 'acmecafe.cl', brand_id: IDS.BRAND }, apiCtx({ role: 'member' }));
    expect(r).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    expect(scrape).not.toHaveBeenCalled();
  });

  it('create_starter_posts exige web o descripción', async () => {
    const r = await executeTool('create_starter_posts', { brand_id: IDS.BRAND }, apiCtx());
    expect(r).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
  });

  it('create_starter_posts crea 3 borradores en la marca pedida', async () => {
    const r = await executeTool('create_starter_posts', { description: 'Café de barrio', brand_id: IDS.BRAND }, apiCtx());
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const data = r.data as { posts: Array<{ angle: string; status: string }> };
    expect(data.posts.map((p) => p.angle)).toEqual([...STARTER_ANGLES]);
    expect(db.rows('kefy_content_items').every((i) => i.brand_id === IDS.BRAND)).toBe(true);
  });

  it('en el chat siempre pide confirmación y anuncia el coste', async () => {
    const chat = chatToolContext({
      auth: AUTH, brandId: IDS.BRAND, language: 'es', conversationId: IDS.uuid(100), turnId: IDS.uuid(101), tainted: false,
    });
    const r = await executeTool('create_starter_posts', { url: 'acmecafe.cl' }, chat);
    expect(r).toMatchObject({ ok: 'pending', credits: 4 });
    expect(scrape).not.toHaveBeenCalled();
  });
});
