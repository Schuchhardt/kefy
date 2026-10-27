// ─── Herramientas del asistente: estrategia de contenido ─────────────────────
//
// get_strategy_catalog, preview_strategy, set_active_strategy,
// save_custom_strategy y get_content_ideas. Llaman a lib/services/strategy.ts
// y lib/services/custom-strategy.ts, los mismos servicios que
// /api/strategies/*.
//
// La estrategia activa es de cada marca: set_active_strategy y
// get_content_ideas actúan sobre la marca del contexto (brand_id), y una API
// key atada a una marca puede cambiar la suya. Las estrategias propias son una
// biblioteca de la org: save_custom_strategy es orgWide.
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
import { getActiveBrandById } from '@/lib/brands';
import type { ToolContext } from '@/lib/assistant/types';
import {
  getBrandStrategy, getStrategyCatalog, getStrategyIdeas, previewStrategy, saveCustomStrategy, setBrandStrategy,
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

/** Nombre de la marca de la llamada, para que la tarjeta diga a cuál se aplica. */
async function brandName(ctx: ToolContext): Promise<string | null> {
  return (await getActiveBrandById(ctx.brandId, ctx.orgId))?.name ?? null;
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
    'Lists everything a brand can choose as its content strategy, and which one it has now. Catalog strategies come ' +
    'from combining one of `objectives` with one of `industries`. `custom_strategies` is the organization\'s own ' +
    'library, shared by all its brands (each one\'s `active` flag is true if it is the one this brand uses). The ' +
    'top-level `active` is the current strategy of the brand in brand_id: each brand has its own. Next: ' +
    'preview_strategy to see one in detail, set_active_strategy ' +
    'to switch this brand to it. Costs no credits.',
  input: z.object({}).strict(),
  confirm: 'never',
  taints: hasExternalCustom,
  handler: async (ctx) => {
    const lang = ctx.language;
    const [{ objectives, industries }, customs, { selection }] = await Promise.all([
      getStrategyCatalog(),
      listCustomStrategies(ctx),
      getBrandStrategy(ctx, { withNames: false }),
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
    'Shows one strategy in detail (framework, KPIs, CTA mechanic and week-by-week calendar) without changing ' +
    'anything. Pass either objective_id + industry_id for a catalog strategy (if that pair has none, the closest one ' +
    'of the industry is returned with is_fallback=true), or custom_strategy_id for one of the organization\'s own. ' +
    'Show it to the user before set_active_strategy. Costs no credits.',
  input: z.object({
    objective_id: z.string().uuid().optional().describe('Objective id from get_strategy_catalog (catalog strategy).'),
    industry_id: z.string().uuid().optional().describe('Industry id from get_strategy_catalog (catalog strategy).'),
    custom_strategy_id: z.string().uuid().optional()
      .describe('Id from custom_strategies of get_strategy_catalog. Use instead of objective_id + industry_id.'),
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
  description:
    'Switches the content strategy of ONE brand (brand_id). Each brand of the organization has its own active ' +
    'strategy, which drives that brand\'s weekly content ideas and AI content; the other brands keep theirs. To ' +
    'give several brands a strategy, call it once per brand_id. Pass objective_id + industry_id for a catalog ' +
    'strategy, or custom_strategy_id for one of the organization\'s own (that replaces the catalog one while ' +
    'active). Always requires user confirmation. Costs no credits.',
  input: z.object({
    objective_id: z.string().uuid().optional().describe('Objective id from get_strategy_catalog (catalog strategy).'),
    industry_id: z.string().uuid().optional().describe('Industry id from get_strategy_catalog (catalog strategy).'),
    strategy_id: z.string().uuid().optional()
      .describe('Catalog strategy id from preview_strategy. Usually omitted: it is resolved from objective + industry.'),
    custom_strategy_id: z.string().uuid().optional()
      .describe('Id from custom_strategies of get_strategy_catalog. Use instead of objective_id + industry_id.'),
    custom_notes: z.string().max(1000).optional().describe('Free notes about how this brand applies the strategy.'),
  }).strict(),
  confirm: 'always',
  describe: async (ctx, input) => {
    if (input.custom_strategy_id) {
      const [custom, brand] = await Promise.all([getCustomStrategy(ctx, input.custom_strategy_id), brandName(ctx)]);
      return {
        brand,
        name: custom.name,
        kpi_primary: custom.kpi_primary,
        posts: custom.calendar.length,
      };
    }
    const [names, brand] = await Promise.all([strategyNames(ctx.language, input), brandName(ctx)]);
    return {
      brand,
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
      ? await setBrandStrategy(ctx, { custom_strategy_id: input.custom_strategy_id, custom_notes: input.custom_notes })
      : await setBrandStrategy(ctx, {
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
    'Organization-wide. Creates (no id) or updates (with id) a custom content strategy in the organization\'s ' +
    'library, which every brand of the organization can use. Saving does not activate it anywhere unless ' +
    'activate=true, which also makes it the active strategy of the brand in brand_id only (other brands: ' +
    'set_active_strategy). Editing one changes it for every brand that has it active. Write it when no catalog ' +
    'strategy fits or the user asks for a tailored one, in the user language and grounded in the brand profile: a ' +
    'clear name, the approach, KPIs, the recurring CTA mechanic and a calendar of 2-4 weeks with 2-4 pieces per week ' +
    '(format, channel, topic, angle, goal). You may adapt a catalog strategy (based_on_strategy_id). On update, ' +
    'calendar replaces the whole calendar. Always requires user confirmation. Costs no credits.',
  input: z.object({
    id: z.string().uuid().optional().describe('Existing custom strategy to update. Omit to create a new one.'),
    ...Object.fromEntries(
      Object.entries(customStrategyFields).map(([k, v]) => [k, k === 'name' || k === 'calendar' ? v.optional() : v]),
    ) as { [K in keyof typeof customStrategyFields]: z.ZodOptional<(typeof customStrategyFields)[K]> },
    activate: z.boolean().optional()
      .describe('Also make it the active strategy of the brand in brand_id (only that brand).'),
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
      brand: input.activate === true ? await brandName(ctx) : null,
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
    "Returns this week's content ideas (topic, format, goal) from the calendar of the active strategy of the brand " +
    'in brand_id. With no strategy, it uses the catalog strategy that matches the industry of the brand profile ' +
    '(source "industry_fallback"); with neither, it returns hint "no_strategy" and you can brainstorm ideas ' +
    'yourself. Costs no credits.',
  input: z.object({
    offset: z.number().int().min(0).max(50).optional().describe('Skip this many ideas to rotate through the calendar.'),
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
