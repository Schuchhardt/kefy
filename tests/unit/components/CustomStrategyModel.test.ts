import { describe, it, expect, vi } from 'vitest';

// El servicio carga Supabase: se reemplaza para poder comparar sus constantes.
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => ({}) }));

import * as server from '@/lib/services/custom-strategy';
import {
  CUSTOM_CHANNELS,
  CUSTOM_FORMATS,
  CUSTOM_STRATEGY_LIMITS,
  calendarStats,
  draftFromCatalog,
  draftFromCustom,
  draftToPayload,
  emptyDraft,
  generateParams,
  mapCatalogChannel,
  mapCatalogFormat,
  validateDraft,
} from '@/components/dashboard/strategy/custom-strategy-model';
import esT from '@/locales/es/dashboard/strategy';
import enT from '@/locales/en/dashboard/strategy';
import type { CustomStrategy, Strategy, StrategyTemplate } from '@/types/strategy';

// ─── Modelo de estrategias propias (cliente) ────────────────────────────────

const STRATEGY: Strategy = {
  id: '22222222-2222-4222-8222-222222222222',
  framework_slug: 'hook-value-cta',
  framework_name_es: 'Gancho, valor y CTA',
  framework_name_en: 'Hook, value and CTA',
  framework_desc_es: 'Descripción ES',
  framework_desc_en: 'Description EN',
  kpi_primary_es: 'Guardados',
  kpi_primary_en: 'Saves',
  kpi_secondary_es: 'Alcance',
  kpi_secondary_en: '',
  interaction_layers: [],
  cta_mechanic_es: 'Comenta «PRECIO»',
  cta_mechanic_en: 'Comment “PRICE”',
};

function tpl(over: Partial<StrategyTemplate>): StrategyTemplate {
  return {
    id: 't', week_num: 1, post_num: 1, format: 'post', channel_hint: 'instagram',
    topic_es: 'Tema', topic_en: 'Topic', copy_structure_es: 'Estructura', copy_structure_en: 'Structure',
    goal_es: 'Meta', goal_en: 'Goal', ...over,
  };
}

describe('constantes alineadas con el servicio', () => {
  it('formatos, canales y límites coinciden con lib/services/custom-strategy', () => {
    expect([...CUSTOM_FORMATS]).toEqual([...server.CUSTOM_FORMATS]);
    expect([...CUSTOM_CHANNELS]).toEqual([...server.CUSTOM_CHANNELS]);
    expect(CUSTOM_STRATEGY_LIMITS).toEqual(server.CUSTOM_STRATEGY_LIMITS);
  });

  it('un borrador convertido a payload pasa el esquema del servicio', () => {
    const draft = draftFromCatalog(STRATEGY, [tpl({ format: 'carrusel' }), tpl({ week_num: 2, format: 'historia', channel_hint: 'general' })], {
      locale: 'es', objectiveId: '11111111-1111-4111-8111-111111111111', suffix: '(personalizada)',
    });
    const parsed = server.customStrategyInputSchema.safeParse(draftToPayload(draft));
    expect(parsed.success).toBe(true);
  });
});

describe('«Partir de la recomendada»', () => {
  it('mapea formatos del catálogo', () => {
    expect(mapCatalogFormat('carrusel')).toBe('carousel');
    expect(mapCatalogFormat('Carousel')).toBe('carousel');
    expect(mapCatalogFormat('reel')).toBe('reel');
    expect(mapCatalogFormat('story')).toBe('story');
    expect(mapCatalogFormat('historia')).toBe('story');
    expect(mapCatalogFormat('infografía')).toBe('post');
    expect(mapCatalogFormat('email')).toBe('post');
    expect(mapCatalogFormat(null)).toBe('post');
  });

  it('conserva el canal si es orgánico; si no, general', () => {
    expect(mapCatalogChannel('tiktok')).toBe('tiktok');
    expect(mapCatalogChannel('general')).toBe('general');
    expect(mapCatalogChannel('meta_ads')).toBe('general');
    expect(mapCatalogChannel('email')).toBe('general');
    expect(mapCatalogChannel('')).toBe('general');
  });

  it('copia la estrategia en español con referencias al catálogo', () => {
    const draft = draftFromCatalog(
      STRATEGY,
      [
        tpl({ id: 'b', week_num: 2, post_num: 1, format: 'reel', channel_hint: 'email', topic_es: 'Segunda' }),
        tpl({ id: 'a', week_num: 1, post_num: 2, format: 'carrusel', channel_hint: 'linkedin', topic_es: 'Primera-2' }),
        tpl({ id: 'c', week_num: 1, post_num: 1, format: 'historia', topic_es: 'Primera-1', goal_es: '', goal_en: '' }),
      ],
      { locale: 'es', objectiveId: 'obj-1', suffix: '(personalizada)' },
    );
    expect(draft.name).toBe('Gancho, valor y CTA (personalizada)');
    expect(draft.description).toBe('Descripción ES');
    expect(draft.kpi_primary).toBe('Guardados');
    expect(draft.kpi_secondary).toBe('Alcance');
    expect(draft.cta_mechanic).toBe('Comenta «PRECIO»');
    expect(draft.objective_id).toBe('obj-1');
    expect(draft.based_on_strategy_id).toBe(STRATEGY.id);
    expect(draft.calendar.map(({ week, format, channel, topic, angle, goal }) => ({ week, format, channel, topic, angle, goal }))).toEqual([
      { week: 1, format: 'story', channel: 'instagram', topic: 'Primera-1', angle: 'Estructura', goal: '' },
      { week: 1, format: 'carousel', channel: 'linkedin', topic: 'Primera-2', angle: 'Estructura', goal: 'Meta' },
      { week: 2, format: 'reel', channel: 'general', topic: 'Segunda', angle: 'Estructura', goal: 'Meta' },
    ]);
  });

  it('en inglés usa los textos en inglés y cae al español si faltan', () => {
    const draft = draftFromCatalog(STRATEGY, [tpl({ topic_en: '' })], { locale: 'en', objectiveId: null, suffix: '(custom)' });
    expect(draft.name).toBe('Hook, value and CTA (custom)');
    expect(draft.kpi_secondary).toBe('Alcance');
    expect(draft.objective_id).toBe('');
    expect(draft.calendar[0]).toMatchObject({ topic: 'Tema', angle: 'Structure', goal: 'Goal' });
  });

  it('recorta a 60 piezas y semanas de 1 a 12, y respeta el largo del nombre', () => {
    const many = Array.from({ length: 70 }, (_, i) => tpl({ id: `t${i}`, week_num: 20, post_num: i }));
    const long = { ...STRATEGY, framework_name_es: 'x'.repeat(200) };
    const draft = draftFromCatalog(long, many, { locale: 'es', objectiveId: null, suffix: '(personalizada)' });
    expect(draft.calendar).toHaveLength(60);
    expect(draft.calendar.every((r) => r.week === 12)).toBe(true);
    expect(draft.name.length).toBeLessThanOrEqual(120);
    expect(draft.name.endsWith('(personalizada)')).toBe(true);
  });

  it('sin plantillas deja una pieza vacía para empezar', () => {
    const draft = draftFromCatalog(STRATEGY, [], { locale: 'es', objectiveId: null, suffix: '(p)' });
    expect(draft.calendar).toHaveLength(1);
    expect(draft.calendar[0].topic).toBe('');
  });
});

describe('validación y payload', () => {
  it('pide nombre y tema', () => {
    const v = validateDraft(emptyDraft());
    expect(v.errors).toEqual(['nameRequired', 'topicRequired']);
    expect(v.rowsWithoutTopic).toHaveLength(1);
  });

  it('pide al menos una pieza', () => {
    expect(validateDraft({ ...emptyDraft(), name: 'X', calendar: [] }).errors).toEqual(['rowsRequired']);
  });

  it('los textos vacíos viajan como null', () => {
    const d = emptyDraft();
    d.name = '  Plan  ';
    d.calendar[0].topic = ' Tema ';
    expect(draftToPayload(d)).toEqual({
      name: 'Plan',
      description: null,
      objective_id: null,
      based_on_strategy_id: null,
      kpi_primary: null,
      kpi_secondary: null,
      cta_mechanic: null,
      calendar: [{ week: 1, format: 'post', channel: 'general', topic: 'Tema', angle: null, goal: null }],
    });
  });

  it('una estrategia guardada vuelve al editor tal cual', () => {
    const saved: CustomStrategy = {
      id: 'c1', org_id: 'o', name: 'Mía', description: null, objective_id: null, based_on_strategy_id: null,
      kpi_primary: 'K', kpi_secondary: null, cta_mechanic: null,
      calendar: [{ week: 2, format: 'story', channel: 'tiktok', topic: 'T', angle: null, goal: 'G' }],
      created_by: null, created_via: 'chat', updated_via: 'chat', created_at: '', updated_at: '',
    };
    const d = draftFromCustom(saved);
    expect(draftToPayload(d).calendar).toEqual([{ week: 2, format: 'story', channel: 'tiktok', topic: 'T', angle: null, goal: 'G' }]);
    expect(d.kpi_primary).toBe('K');
  });
});

describe('utilidades', () => {
  it('cuenta semanas distintas y piezas', () => {
    expect(calendarStats([
      { week: 1, format: 'post', channel: 'general', topic: 'a' },
      { week: 1, format: 'reel', channel: 'general', topic: 'b' },
      { week: 3, format: 'story', channel: 'general', topic: 'c' },
    ])).toEqual({ weeks: 2, pieces: 3 });
  });

  it('«Generar» manda el formato tal cual y general → instagram', () => {
    expect(Object.fromEntries(generateParams({ channel: 'general', format: 'carousel', topic: 'X' })))
      .toEqual({ channel: 'instagram', topic: 'X', type: 'carousel' });
    expect(Object.fromEntries(generateParams({ channel: 'tiktok', format: 'story', topic: 'Y' })))
      .toEqual({ channel: 'tiktok', topic: 'Y', type: 'story' });
  });
});

describe('textos de la página de estrategia', () => {
  it('es y en tienen las mismas claves', () => {
    const keys = (o: unknown, p = ''): string[] =>
      o && typeof o === 'object' && !Array.isArray(o)
        ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k))
        : [p];
    expect(keys(enT).sort()).toEqual(keys(esT).sort());
  });
});
