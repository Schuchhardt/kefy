// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));

const ai = vi.hoisted(() => ({ generateContentRecommendations: vi.fn() }));
vi.mock('@/lib/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai')>()),
  generateContentRecommendations: ai.generateContentRecommendations,
}));

const rate = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  checkRateLimit: rate.checkRateLimit,
}));

import { recommendContent, loadContentHistory, markTopPerformers } from '@/lib/services/recommendations';
import { formatContentHistory } from '@/lib/ai';
import { serviceContext } from '@/lib/services/context';
import type { ContentHistoryEntry } from '@/types/ai';

const auth = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'starter' } as never;
const ctx = serviceContext(auth, 'brand-1', 'es', { brandScope: 'strict' });

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const metric = (impressions: number, reach: number, likes: number) => ({
  measured_at: daysAgo(0), impressions, reach, likes, comments: 0, shares: 0, saves: 0,
});

function seedStrategy() {
  db.seed('kefy_org_strategies', [
    { org_id: 'org-1', brand_id: 'brand-1', strategy_id: 's1', custom_strategy_id: null, created_at: daysAgo(21) },
  ]);
  db.seed('kefy_content_strategies', [
    { id: 's1', framework_name_es: 'Thought Leadership', framework_name_en: 'Thought Leadership', kpi_primary_es: 'Impresiones', kpi_primary_en: 'Impressions' },
  ]);
  db.seed('kefy_strategy_templates', [
    { id: 't1', strategy_id: 's1', week_num: 1, post_num: 1, sort_order: 1, format: 'post', topic_es: 'Por qué [práctica común en la industria] está mal', topic_en: 'x', goal_es: 'Debate', goal_en: 'Debate' },
  ]);
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  rate.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000, limit: 10 });
  ai.generateContentRecommendations.mockResolvedValue({
    recommendations: [{ topic: 'Segunda parte del post sobre precios', content_type: 'carousel', rationale_short: 'Sigue tu último post' }],
    model: 'm', tokensUsed: 1,
  });
  seedStrategy();
});

describe('recommendContent', () => {
  it('sin contenido previo, la primera tanda sale del calendario de la estrategia', async () => {
    const out = await recommendContent(ctx, { offset: 0 });
    expect(out.source).toBe('strategy');
    expect(out.recommendations[0].template_id).toBe('t1');
    expect(ai.generateContentRecommendations).not.toHaveBeenCalled();
  });

  it('con contenido, siempre va a la IA con el historial y la estrategia como lente', async () => {
    db.seed('kefy_content_items', [
      { id: 'c-old', org_id: 'org-1', brand_id: 'brand-1', status: 'published', content_type: 'post', title: 'Cómo fijar precios en servicios B2B', body: '', created_at: daysAgo(10) },
      { id: 'c-new', org_id: 'org-1', brand_id: 'brand-1', status: 'published', content_type: 'carousel', title: 'Errores al subir precios a clientes antiguos', body: '', created_at: daysAgo(2) },
      { id: 'c-arch', org_id: 'org-1', brand_id: 'brand-1', status: 'archived', content_type: 'post', title: 'Una pieza archivada que no cuenta', body: '', created_at: daysAgo(1) },
      { id: 'c-other', org_id: 'org-1', brand_id: 'brand-2', status: 'published', content_type: 'post', title: 'Contenido de otra marca de la org', body: '', created_at: daysAgo(1) },
    ]);

    const out = await recommendContent(ctx, { offset: 0 });

    expect(out.source).toBe('history');
    expect(out.recommendations[0].rationale.source).toBe('history');
    expect(out.strategy_meta?.framework_name).toBe('Thought Leadership');

    const arg = ai.generateContentRecommendations.mock.calls[0][0];
    expect(arg.history.map((h: ContentHistoryEntry) => h.topic)).toEqual([
      'Errores al subir precios a clientes antiguos',
      'Cómo fijar precios en servicios B2B',
    ]);
    expect(arg.strategy.framework_name).toBe('Thought Leadership');
  });

  it('pasa la rotación y la pista a la IA', async () => {
    db.seed('kefy_content_items', [
      { id: 'c1', org_id: 'org-1', brand_id: 'brand-1', status: 'draft', content_type: 'post', title: 'Guía de onboarding para clientes nuevos', body: '', created_at: daysAgo(1) },
    ]);
    await recommendContent(ctx, { offset: 2, hint: 'tono divertido' });
    const arg = ai.generateContentRecommendations.mock.calls[0][0];
    expect(arg.rotation).toBe(2);
    expect(arg.hint).toBe('tono divertido');
  });

  it('respeta el rate limit', async () => {
    rate.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000, limit: 10 });
    await expect(recommendContent(ctx)).rejects.toMatchObject({ status: 429, code: 'rate_limited' });
  });
});

describe('loadContentHistory', () => {
  it('suma las métricas de cada pieza y marca la de mejor rendimiento', async () => {
    db.seed('kefy_content_items', [
      { id: 'a', org_id: 'org-1', brand_id: 'brand-1', status: 'published', content_type: 'post', title: 'Pieza A con poco alcance', body: '', created_at: daysAgo(3) },
      { id: 'b', org_id: 'org-1', brand_id: 'brand-1', status: 'published', content_type: 'reel', title: 'Pieza B que funcionó muy bien', body: '', created_at: daysAgo(5) },
    ]);
    db.seed('kefy_scheduled_posts', [
      { id: 'p1', org_id: 'org-1', content_item_id: 'a', status: 'published', published_at: daysAgo(3), kefy_post_metrics: [metric(100, 100, 1)] },
      { id: 'p2', org_id: 'org-1', content_item_id: 'b', status: 'published', published_at: daysAgo(5), kefy_post_metrics: [metric(500, 400, 30)] },
      { id: 'p3', org_id: 'org-1', content_item_id: 'b', status: 'published', published_at: daysAgo(5), kefy_post_metrics: [metric(300, 200, 20)] },
    ]);

    const history = await loadContentHistory(db.client as never, ctx);
    const b = history.find((h) => h.topic.startsWith('Pieza B'))!;
    expect(b.metrics).toMatchObject({ impressions: 800, reach: 600, engagements: 50 });
    expect(b.top_performer).toBe(true);
    expect(history.find((h) => h.topic.startsWith('Pieza A'))!.top_performer).toBe(false);
  });
});

describe('markTopPerformers', () => {
  const entry = (topic: string, metrics: ContentHistoryEntry['metrics']): ContentHistoryEntry => ({
    topic, content_type: 'post', published: true, age_days: 1, metrics, top_performer: false,
  });

  it('no marca nada con una sola pieza medida', () => {
    const h = [entry('a', { impressions: 10, reach: 10, engagements: 5, engagement_rate: 50 }), entry('b', null)];
    markTopPerformers(h);
    expect(h.some((x) => x.top_performer)).toBe(false);
  });
});

describe('formatContentHistory', () => {
  it('marca la más reciente y las de mejor rendimiento', () => {
    const text = formatContentHistory([
      { topic: 'Último post', content_type: 'post', published: true, age_days: 0, metrics: null, top_performer: false },
      { topic: 'El que mejor funcionó', content_type: 'reel', published: true, age_days: 9,
        metrics: { impressions: 900, reach: 700, engagements: 70, engagement_rate: 10 }, top_performer: true },
    ]);
    expect(text).toContain('#1 (MOST RECENT) · today · post · published — "Último post"');
    expect(text).toContain('900 impressions · 70 interactions · 10% engagement · TOP PERFORMER');
  });
});
