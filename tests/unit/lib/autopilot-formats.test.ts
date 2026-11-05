// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  REEL_SCENES_MAX, REEL_SCENES_MIN, STORY_CONVERSION_CREDITS, STORY_PLATFORMS, autopilotRuleCost, computeNextRun,
  estimateFormatCredits, estimateRunCredits, nextRunForRule, parseAutopilotTopic, resolveRunFormat, usesStory,
  zonedParts,
} from '@/lib/autopilot-formats';
import { STORY_CAPABLE_PLATFORMS } from '@/lib/zernio';
import { REEL_SCENE_COUNT_MAX, REEL_SCENE_COUNT_MIN } from '@/lib/services/reel';
import { renditionCredits } from '@/lib/services/renditions';

// Formatos, costo y calendario del autopilot: lo comparten el servicio, las
// herramientas y la página, así que tienen que decir lo mismo que los
// servicios que generan y publican.

const SANTIAGO = 'America/Santiago'; // noviembre: UTC-3 (horario de verano)

describe('el calendario respeta la zona horaria de la regla', () => {
  it('diaria a las 09:00 de Santiago sale a las 12:00 UTC, no a las 09:00 UTC', () => {
    const next = computeNextRun('daily', null, '09:00', SANTIAGO, new Date('2026-11-04T10:00:00Z'));
    expect(next.toISOString()).toBe('2026-11-04T12:00:00.000Z');
    // Pasada la hora local, al día siguiente.
    const after = computeNextRun('daily', null, '09:00', SANTIAGO, new Date('2026-11-04T12:30:00Z'));
    expect(after.toISOString()).toBe('2026-11-05T12:00:00.000Z');
  });

  it('semanal cae en el día de la semana pedido en la hora local', () => {
    const next = computeNextRun('weekly', 4, '20:30', SANTIAGO, new Date('2026-11-04T10:00:00Z'));
    expect(next.toISOString()).toBe('2026-11-05T23:30:00.000Z');
    expect(zonedParts(next, SANTIAGO)).toMatchObject({ weekday: 4, hour: 20, minute: 30 });
  });

  it('quincenal: tras una ejecución salta dos semanas, al crearla toma la próxima', () => {
    const now = new Date('2026-11-05T12:00:00Z');
    const first = computeNextRun('biweekly', 4, '09:00', 'UTC', new Date('2026-11-04T00:00:00Z'));
    expect(first.toISOString()).toBe('2026-11-05T09:00:00.000Z');
    const afterRun = computeNextRun('biweekly', 4, '09:00', 'UTC', now, { afterRun: true });
    expect(afterRun.toISOString()).toBe('2026-11-19T09:00:00.000Z');
  });

  it('mensual: el mismo día del mes siguiente (o el último si no existe)', () => {
    expect(computeNextRun('monthly', null, '09:00', 'UTC', new Date('2026-01-31T10:00:00Z')).toISOString())
      .toBe('2026-02-28T09:00:00.000Z');
  });

  it('la mezcla semanal se salta los días sin publicación', () => {
    const rule = {
      frequency: 'daily' as const, day_of_week: null, time_of_day: '09:00', timezone: SANTIAGO,
      format: 'post' as const, weekly_formats: { 6: 'skip', 0: 'skip' } as const,
    };
    // Viernes 6 a las 10:00 local → el sábado y el domingo no publican → lunes 9.
    const next = nextRunForRule(rule, new Date('2026-11-06T13:00:00Z'));
    expect(next.toISOString()).toBe('2026-11-09T12:00:00.000Z');
  });
});

describe('formato de cada ejecución', () => {
  const thursday = new Date('2026-11-05T12:00:00Z');
  const wednesday = new Date('2026-11-04T12:00:00Z');
  const rule = { format: 'post' as const, weekly_formats: { 4: 'reel' } as const, timezone: SANTIAGO };

  it('mezcla semanal → formato de la regla → etiqueta del tema → red', () => {
    const tagged = parseAutopilotTopic('[CARRUSEL 6 slides] Tema');
    expect(resolveRunFormat(rule, tagged, ['instagram'], thursday)).toBe('reel');
    expect(resolveRunFormat(rule, tagged, ['instagram'], wednesday)).toBe('post');
    expect(resolveRunFormat({ ...rule, format: null, weekly_formats: null }, tagged, ['instagram'], wednesday)).toBe('carousel');
    expect(resolveRunFormat({ format: null, weekly_formats: null, timezone: 'UTC' }, parseAutopilotTopic('Tema'), ['tiktok'], wednesday)).toBe('reel');
  });

  it('[HISTORIA] y [STORY] son etiquetas de story', () => {
    expect(parseAutopilotTopic('[HISTORIA] Detrás de cámara')).toEqual({ format: 'story', topic: 'Detrás de cámara' });
    expect(parseAutopilotTopic('[Story] Behind the scenes')).toEqual({ format: 'story', topic: 'Behind the scenes' });
  });

  it('usesStory detecta la story en la regla, la mezcla o la derivada', () => {
    expect(usesStory({ format: 'post', weekly_formats: null, also_story: false })).toBe(false);
    expect(usesStory({ format: 'post', weekly_formats: { 5: 'story' }, also_story: false })).toBe(true);
    expect(usesStory({ format: 'post', weekly_formats: null, also_story: true })).toBe(true);
  });
});

describe('costo', () => {
  it('cada formato cuesta lo de su servicio, y la story derivada lo de una conversión', () => {
    expect(estimateFormatCredits('post')).toBe(4);
    expect(estimateFormatCredits('story')).toBe(4);
    expect(estimateFormatCredits('carousel', { slideCount: 5 })).toBe(16);
    // docs/video-pipeline.md: 5 planos con animación key = 54 + el guion.
    expect(estimateFormatCredits('reel')).toBe(55);
    expect(estimateRunCredits('post', { alsoStory: true })).toBe(8);
    // Una story no lleva otra story derivada.
    expect(estimateRunCredits('story', { alsoStory: true })).toBe(4);
    expect(STORY_CONVERSION_CREDITS).toBe(renditionCredits('story'));
  });

  it('post todos los días y reel los jueves: por ejecución y al mes', () => {
    const cost = autopilotRuleCost({
      name: 'Diario', frequency: 'daily', format: 'post', weekly_formats: { 4: 'reel' }, also_story: false,
      topic_hints: ['Tips'], timezone: SANTIAGO,
    }, ['instagram']);
    expect(cost.by_format).toEqual({ post: 4, reel: 55 });
    expect(cost).toMatchObject({ per_run_min: 4, per_run_max: 55 });
    // 6 días de post + 1 de reel, ~30/7 veces cada uno.
    expect(cost.per_month).toBe(Math.round((6 * 4 + 55) * 30 / 7));
  });

  it('sin formato fijo, el peor tema manda', () => {
    const cost = autopilotRuleCost({
      name: 'Auto', frequency: 'weekly', format: null, weekly_formats: null, also_story: true,
      topic_hints: ['[POST] A', '[REEL 30s] B'], timezone: 'UTC',
    }, ['instagram']);
    expect(cost.per_run_min).toBe(8);
    expect(cost.per_run_max).toBe(estimateFormatCredits('reel', { sceneCount: 6 }) + STORY_CONVERSION_CREDITS);
  });
});

describe('constantes que tienen que coincidir con los servicios', () => {
  it('redes con Stories = las de Zernio; planos del reel = los del servicio', () => {
    expect([...STORY_PLATFORMS].sort()).toEqual([...STORY_CAPABLE_PLATFORMS].sort());
    expect([REEL_SCENES_MIN, REEL_SCENES_MAX]).toEqual([REEL_SCENE_COUNT_MIN, REEL_SCENE_COUNT_MAX]);
  });
});
