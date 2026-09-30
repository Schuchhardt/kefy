import { describe, it, expect } from 'vitest';
import {
  PLAN_LIMITS, PLAN_ORDER, PLAN_PRICES_USD, TRIAL_DAYS, formatPlanNumber, planHighlights,
} from '@/lib/plans';
import { PLAN_CREDITS, PLAN_ASSISTANT_MESSAGES } from '@/lib/usage';
import { MEMBER_LIMITS } from '@/lib/team';
import es from '@/locales/es/landing';
import en from '@/locales/en/landing';

// lib/plans.ts es la única fuente de precios y topes. La landing los escribe a
// mano en su copy (para poder redactarlos), y Ajustes los lee de aquí: este
// test obliga a que coincidan. Antes Ajustes mostraba Starter a $19 y Pro a
// $69 con «marcas ilimitadas» mientras la landing y Stripe decían $49/$99.

describe('lib/plans', () => {
  it('las tablas de servidor salen de lib/plans', () => {
    for (const plan of PLAN_ORDER) {
      expect(PLAN_CREDITS[plan]).toBe(PLAN_LIMITS[plan].credits);
      expect(PLAN_ASSISTANT_MESSAGES[plan]).toBe(PLAN_LIMITS[plan].assistantMessages);
      expect(MEMBER_LIMITS[plan]).toBe(PLAN_LIMITS[plan].members);
    }
  });

  it('los planes suben de precio y de topes en orden', () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      const prev = PLAN_ORDER[i - 1];
      const cur = PLAN_ORDER[i];
      expect(PLAN_PRICES_USD[cur]).toBeGreaterThan(PLAN_PRICES_USD[prev]);
      expect(PLAN_LIMITS[cur].credits).toBeGreaterThan(PLAN_LIMITS[prev].credits);
      expect(PLAN_LIMITS[cur].brands).toBeGreaterThanOrEqual(PLAN_LIMITS[prev].brands);
    }
  });

  it('formatea los números con el separador de cada idioma', () => {
    expect(formatPlanNumber(1500, 'es')).toBe('1.500');
    expect(formatPlanNumber(1500, 'en')).toBe('1,500');
    expect(formatPlanNumber(150, 'es')).toBe('150');
  });

  it('planHighlights describe cada tope del plan', () => {
    const lines = planHighlights('pro', 'es');
    expect(lines).toContain('5 marcas');
    expect(lines).toContain('500 créditos IA / mes');
    expect(lines).toContain('Asistente IA: 1.500 mensajes / mes');
    expect(planHighlights('starter', 'en')).toContain('1 brand');
  });
});

describe.each([['es', es], ['en', en]] as const)('la landing (%s) anuncia lo que dice lib/plans', (lang, copy) => {
  it('mismos planes, en el mismo orden', () => {
    expect(copy.pricing.plans.map((p) => p.name.toLowerCase())).toEqual([...PLAN_ORDER]);
  });

  it('mismos precios', () => {
    expect(copy.pricing.plans.map((p) => Number(p.price))).toEqual(PLAN_ORDER.map((p) => PLAN_PRICES_USD[p]));
  });

  it('cada plan anuncia sus topes reales', () => {
    PLAN_ORDER.forEach((plan, i) => {
      const features = copy.pricing.plans[i].features.map((f) => (typeof f === 'string' ? f : f.t)).join(' | ');
      const l = PLAN_LIMITS[plan];
      for (const n of [l.brands, l.credits, l.assistantMessages, l.socialConnections, l.members]) {
        expect(features, `${plan}: falta ${n}`).toContain(formatPlanNumber(n, lang));
      }
    });
  });

  it('la tabla comparativa usa los mismos números', () => {
    const fila = (texto: RegExp) => copy.pricing.cmpRows.find((r) => texto.test(r.feature))!.values;
    expect(fila(/créditos|credits/i)).toEqual(PLAN_ORDER.map((p) => formatPlanNumber(PLAN_LIMITS[p].credits, lang)));
    expect(fila(/^marcas|^brands/i)).toEqual(PLAN_ORDER.map((p) => formatPlanNumber(PLAN_LIMITS[p].brands, lang)));
    expect(fila(/miembros|members/i)).toEqual(PLAN_ORDER.map((p) => formatPlanNumber(PLAN_LIMITS[p].members, lang)));
  });

  it(`el mes gratis dura ${TRIAL_DAYS} días en la copy`, () => {
    expect(copy.cta.note).toContain(String(TRIAL_DAYS));
  });
});
