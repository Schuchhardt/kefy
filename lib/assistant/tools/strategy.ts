// ─── Herramientas del asistente: estrategia de contenido ─────────────────────
//
// get_strategy_catalog, preview_strategy, set_active_strategy,
// save_custom_strategy y get_content_ideas. Llaman a lib/services/strategy.ts
// y lib/services/custom-strategy.ts, los mismos servicios que
// /api/strategies/*.
//
// La estrategia es de toda la organización: las escrituras son orgWide y el
// registro las rechaza con una API key atada a una marca.
//
// Hay dos tipos de estrategia: las del catálogo (objetivo × industria) y las
// propias de la org, que escribe el usuario o el asistente. El texto de una
// propia que entró por la API o MCP es de un tercero: va envuelto en
// <untrusted_content> y contamina el turno.

import { z } from 'zod';
import { defineTool } from '@/lib/assistant/registry';
import { buildDashboardHref } from '@/lib/assistant/links';
import { wrapUntrusted } from '@/lib/assistant/untrusted';
import type { ToolLink } from '@/lib/assistant/types';
import { ServiceError, msg } from '@/lib/services/errors';
import {
  getOrgStrategy, getStrategyCatalog, getStrategyIdeas, previewStrategy, saveCustomStrategy, setOrgStrategy,
  strategyNames,
} from '@/lib/services/strategy';
import {
  customStrategyFields, getCustomStrategy, isExternalCustomStrategy, listCustomStrategies,
  type CustomStrategy,
} from '@/lib/services/custom-strategy';

type Lang = 'es' | 'en';

function strategyLink(lang: Lang, params: { objective?: string; industry?: string; custom?: string } = {}): ToolLink {
  return {
    label: msg(lang, 'Abrir estrategia', 'Open strategy'),
    href: buildDashboardHref(lang, 'brand_strategy', params),
  };
}

/** Valor en el idioma pedido, con el otro idioma de respaldo. */
function pick(lang: Lang, es: string | null | undefined, en: string | null | undefined): string | null {
  return (lang === 'en' ? en ?? es : es ?? en) ?? null;
}

/** Texto de una estrategia propia, envuelto si vino de una integración. */
function customText(s: CustomStrategy, value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return isExternalCustomStrategy(s) ? wrapUntrusted('strategy', value) : value;
}

function customSummary(s: CustomStrategy, activeId: string | null) {
  const weeks = new Set(s.calendar.map((c) => c.week)).size;
  return {
    id: s.id,
    name: customText(s, s.name),
    active: s.id === activeId,
    weeks,
    posts: s.calendar.length,
    created_via: s.created_via,
    externally_modified: isExternalCustomStrategy(s),
    updated_at: s.updated_at,
  };
}

function customDetail(s: CustomStrategy) {
  return {
    ...customSummary(s, null),
    description: customText(s, s.description),
    objective_id: s.objective_id,
    kpi_primary: customText(s, s.kpi_primary),
    kpi_secondary: customText(s, s.kpi_secondary),
    cta_mechanic: customText(s, s.cta_mechanic),
    calendar: s.calendar.map((c) => ({
      week: c.week,
      format: c.format,
      channel: c.channel,
      topic: customText(s, c.topic),
      angle: customText(s, c.angle),
      goal: customText(s, c.goal),
    })),
  };
}

/** true si el resultado trae alguna estrategia propia escrita por una integración. */
function hasExternalCustom(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as { custom_strategies?: Array<{ externally_modified?: boolean }>; custom_strategy?: { externally_modified?: boolean } };
  return (
    (Array.isArray(d.custom_strategies) && d.custom_strategies.some((c) => c.externally_modified === true)) ||
    d.custom_strategy?.externally_modified === true
  );
}

// ─── get_strategy_catalog ────────────────────────────────────────────────────

const getStrategyCatalogTool = defineTool({
  name: 'get_strategy_catalog',
  title: { es: 'Ver catálogo de estrategias', en: 'Get strategy catalog' },
  kind: 'read',
  description:
    'Lists the content objectives and industries that combine into a catalog strategy, plus the organization\'s own ' +
    'custom strategies (custom_strategies, with which one is active). Use the ids with preview_strategy, ' +
    'set_active_strategy and save_custom_strategy. Costs no credits.',
  input: z.object({}).strict(),
  confirm: 'never',
  taints: hasExternalCustom,
  handler: async (ctx) => {
    const lang = ctx.language;
    const [{ objectives, industries }, customs, { selection }] = await Promise.all([
      getStrategyCatalog(),
      listCustomStrategies(ctx),
      getOrgStrategy(ctx, { withNames: false }),
    ]);
    const activeCustomId = selection?.custom_strategy_id ?? null;
    return {
      data: {
        objectives: objectives.map((o) => ({
          id: o.id, slug: o.slug, name: pick(lang, o.name_es, o.name_en), description: pick(lang, o.desc_es, o.desc_en),
        })),
        industries: industries.map((i) => ({
          id: i.id, slug: i.slug, name: pick(lang, i.name_es, i.name_en), description: i.desc_es ?? null,
        })),
        custom_strategies: customs.map((c) => customSummary(c, activeCustomId)),
        active: selection
          ? {
              type: activeCustomId ? 'custom' : selection.strategy_id ? 'catalog' : 'none',
              objective_id: selection.objective_id,
              industry_id: selection.industry_id,
              strategy_id: selection.strategy_id,
              custom_strategy_id: activeCustomId,
            }
          : { type: 'none' },
      },
    };
  },
});

// ─── preview_strategy ────────────────────────────────────────────────────────

const previewStrategyTool = defineTool({
  name: 'preview_strategy',
  title: { es: 'Ver estrategia', en: 'Preview strategy' },
  kind: 'read',
  description:
    'Shows a strategy in detail before activating it: framework, KPIs, CTA mechanic and calendar. Pass either ' +
    'objective_id + industry_id (catalog; if the pair has no strategy of its own, returns the industry fallback with ' +
    'is_fallback) or custom_strategy_id (one of the organization\'s own). Costs no credits.',
  input: z.object({
    objective_id: z.string().uuid().optional(),
    industry_id: z.string().uuid().optional(),
    custom_strategy_id: z.string().uuid().optional(),
  }).strict(),
  confirm: 'never',
  taints: hasExternalCustom,
  handler: async (ctx, input) => {
    const lang = ctx.language;

    if (input.custom_strategy_id) {
      const custom = await getCustomStrategy(ctx, input.custom_strategy_id);
      return {
        data: { type: 'custom', custom_strategy: customDetail(custom) },
        links: [strategyLink(lang, { custom: custom.id })],
      };
    }

    if (!input.objective_id || !input.industry_id) {
      throw new ServiceError(
        'invalid_input',
        422,
        msg(lang, 'Indica objective_id e industry_id, o custom_strategy_id', 'Pass objective_id and industry_id, or custom_strategy_id'),
      );
    }

    const preview = await previewStrategy(input.objective_id, input.industry_id);
    const s = preview.strategy;
    return {
      data: {
        type: 'catalog',
        strategy: s
          ? {
              id: s.id,
              framework: pick(lang, s.framework_name_es, s.framework_name_en),
              description: pick(lang, s.framework_desc_es, s.framework_desc_en),
              kpi_primary: pick(lang, s.kpi_primary_es, s.kpi_primary_en),
              kpi_secondary: pick(lang, s.kpi_secondary_es, s.kpi_secondary_en),
              cta_mechanic: pick(lang, s.cta_mechanic_es, s.cta_mechanic_en),
              interaction_layers: s.interaction_layers ?? null,
            }
          : null,
        is_fallback: preview.is_fallback ?? false,
        fallback_objective: preview.fallback_objective
          ? pick(lang, preview.fallback_objective.name_es, preview.fallback_objective.name_en)
          : null,
        templates: preview.templates.map((t) => ({
          week: t.week_num,
          post: t.post_num,
          format: t.format,
          channel_hint: t.channel_hint,
          topic: pick(lang, t.topic_es, t.topic_en),
          copy_structure: pick(lang, t.copy_structure_es, t.copy_structure_en),
          goal: pick(lang, t.goal_es, t.goal_en),
        })),
      },
      // El link abre la página con este par elegido, no con la selección guardada.
      links: [strategyLink(lang, { objective: input.objective_id, industry: input.industry_id })],
    };
  },
});

// ─── set_active_strategy ─────────────────────────────────────────────────────

const setActiveStrategyTool = defineTool({
  name: 'set_active_strategy',
  title: { es: 'Activar estrategia', en: 'Activate strategy' },
  kind: 'write',
  roles: ['owner', 'admin'],
  orgWide: true,
  description:
    'Activates the organization\'s content strategy. It drives the weekly content ideas and applies to every brand ' +
    'of the org. Pass objective_id + industry_id for a catalog strategy (strategy_id is resolved automatically when ' +
    'omitted), or custom_strategy_id for one of the organization\'s own. Always requires user confirmation. ' +
    'Costs no credits.',
  input: z.object({
    objective_id: z.string().uuid().optional(),
    industry_id: z.string().uuid().optional(),
    strategy_id: z.string().uuid().optional(),
    custom_strategy_id: z.string().uuid().optional(),
    custom_notes: z.string().max(1000).optional(),
  }).strict(),
  confirm: 'always',
  describe: async (ctx, input) => {
    if (input.custom_strategy_id) {
      const custom = await getCustomStrategy(ctx, input.custom_strategy_id);
      return {
        name: custom.name,
        kpi_primary: custom.kpi_primary,
        posts: custom.calendar.length,
      };
    }
    const names = await strategyNames(ctx.language, input);
    return {
      objective: names.objective,
      industry: names.industry,
      framework: names.framework,
      custom_notes: input.custom_notes ?? null,
    };
  },
  // Si alguien edita la estrategia propia entre la tarjeta y el clic, no se
  // activa algo distinto de lo que la persona vio.
  snapshot: async (ctx, input) =>
    input.custom_strategy_id ? (await getCustomStrategy(ctx, input.custom_strategy_id)).updated_at : null,
  handler: async (ctx, input) => {
    const lang = ctx.language;
    if (!input.custom_strategy_id && !(input.objective_id && input.industry_id)) {
      throw new ServiceError(
        'invalid_input',
        422,
        msg(lang, 'Indica objective_id e industry_id, o custom_strategy_id', 'Pass objective_id and industry_id, or custom_strategy_id'),
      );
    }

    const { selection } = input.custom_strategy_id
      ? await setOrgStrategy(ctx, { custom_strategy_id: input.custom_strategy_id, custom_notes: input.custom_notes })
      : await setOrgStrategy(ctx, {
          objective_id: input.objective_id,
          industry_id: input.industry_id,
          strategy_id: input.strategy_id,
          custom_notes: input.custom_notes,
        });
    const names = await strategyNames(lang, selection, ctx.auth.orgId);
    return {
      data: { selection, ...names },
      links: [
        selection.custom_strategy_id
          ? strategyLink(lang, { custom: selection.custom_strategy_id })
          : strategyLink(lang, {
              objective: selection.objective_id ?? undefined,
              industry: selection.industry_id ?? undefined,
            }),
      ],
      dataChanged: ['strategy'],
    };
  },
});

// ─── save_custom_strategy ────────────────────────────────────────────────────

const saveCustomStrategyTool = defineTool({
  name: 'save_custom_strategy',
  title: { es: 'Guardar estrategia propia', en: 'Save custom strategy' },
  kind: 'write',
  roles: ['owner', 'admin'],
  orgWide: true,
  description:
    'Creates (no id) or updates (with id) one of the organization\'s own content strategies, written by you for this ' +
    'business when no catalog strategy fits or the user asks for a tailored one. Write it in the user language, ' +
    'grounded in the brand profile: a clear name, the approach, KPIs, the recurring CTA mechanic and a calendar of ' +
    '2-4 weeks with 2-4 pieces per week (format, channel, topic, angle, goal). You may adapt a catalog strategy ' +
    '(based_on_strategy_id). With activate=true it also becomes the active strategy. On update, calendar replaces ' +
    'the whole calendar. Always requires user confirmation. Costs no credits.',
  input: z.object({
    id: z.string().uuid().optional().describe('Existing custom strategy to update. Omit to create a new one.'),
    ...Object.fromEntries(
      Object.entries(customStrategyFields).map(([k, v]) => [k, k === 'name' || k === 'calendar' ? v.optional() : v]),
    ) as { [K in keyof typeof customStrategyFields]: z.ZodOptional<(typeof customStrategyFields)[K]> },
    activate: z.boolean().optional().describe('Also make it the active strategy of the organization.'),
  }).strict(),
  confirm: 'always',
  describe: async (ctx, input) => {
    const calendar = input.calendar ?? null;
    const current = input.id ? await getCustomStrategy(ctx, input.id) : null;
    return {
      name: input.name ?? current?.name ?? null,
      description: input.description ?? null,
      kpi_primary: input.kpi_primary ?? null,
      cta_mechanic: input.cta_mechanic ?? null,
      weeks: calendar ? new Set(calendar.map((c) => c.week)).size : null,
      posts: calendar ? calendar.length : null,
      sample_topics: calendar ? calendar.slice(0, 4).map((c) => c.topic) : null,
      activate: input.activate === true,
    };
  },
  snapshot: async (ctx, input) => (input.id ? (await getCustomStrategy(ctx, input.id)).updated_at : null),
  handler: async (ctx, input) => {
    const lang = ctx.language;
    if (!input.id && (!input.name || !input.calendar)) {
      throw new ServiceError(
        'invalid_input',
        422,
        msg(lang, 'Para crear una estrategia hacen falta name y calendar', 'name and calendar are required to create a strategy'),
      );
    }
    const { strategy, selection } = await saveCustomStrategy(ctx, input);
    return {
      data: {
        custom_strategy: customDetail(strategy),
        active: selection?.custom_strategy_id === strategy.id,
      },
      links: [strategyLink(lang, { custom: strategy.id })],
      dataChanged: ['strategy'],
    };
  },
});

// ─── get_content_ideas ───────────────────────────────────────────────────────

const getContentIdeasTool = defineTool({
  name: 'get_content_ideas',
  title: { es: 'Ver ideas de contenido', en: 'Get content ideas' },
  kind: 'read',
  description:
    "Returns this week's content ideas from the active strategy calendar (catalog or custom: topic, format, goal). " +
    'Use offset to rotate through more ideas. If there is no strategy it returns hint "no_strategy"; you can still ' +
    'brainstorm ideas yourself. Costs no credits.',
  input: z.object({
    offset: z.number().int().min(0).max(50).optional(),
  }).strict(),
  confirm: 'never',
  handler: async (ctx, input) => {
    const ideas = await getStrategyIdeas(ctx, { offset: input.offset });
    return { data: ideas, links: [strategyLink(ctx.language)] };
  },
});

export const strategyTools = [
  getStrategyCatalogTool,
  previewStrategyTool,
  setActiveStrategyTool,
  saveCustomStrategyTool,
  getContentIdeasTool,
];
