// ─── Servicio: estrategias de contenido propias ──────────────────────────────
//
// Además del catálogo (objetivo × industria), una organización puede tener
// estrategias propias: las escribe el usuario en /brand/strategy o el
// asistente (save_custom_strategy). Tienen la misma forma que una del catálogo
// —framework, KPIs, mecánica de CTA y un calendario semanal— y se activan
// igual: kefy_org_strategies.custom_strategy_id manda sobre strategy_id.
//
// Siempre se filtra por org_id: una estrategia propia no existe fuera de su
// organización (404, no 403, para no confirmar que el id existe).

import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import { ORGANIC_CHANNELS } from '@/lib/channels';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';
import type { StrategyTemplate } from '@/lib/services/strategy';

const ROUTE = 'lib/services/custom-strategy';

export const CUSTOM_STRATEGY_LIMITS = {
  /** Estrategias propias por organización. */
  perOrg: 20,
  weeks: 12,
  posts: 60,
} as const;

export const CUSTOM_FORMATS = ['post', 'carousel', 'reel', 'story'] as const;
export type CustomFormat = (typeof CUSTOM_FORMATS)[number];

/** 'general' = sin red concreta (la pieza sirve para cualquiera). */
export const CUSTOM_CHANNELS = ['general', ...ORGANIC_CHANNELS.map((c) => c.value)] as [string, ...string[]];

// ─── Esquema de entrada (lo comparten la ruta y la herramienta) ──────────────

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullable().optional();

export const customCalendarItemSchema = z.object({
  week: z.number().int().min(1).max(CUSTOM_STRATEGY_LIMITS.weeks).describe('Week of the cycle, 1-12.'),
  format: z.enum(CUSTOM_FORMATS),
  channel: z.enum(CUSTOM_CHANNELS).default('general'),
  topic: text(300).min(1).describe('What the piece is about, in one line.'),
  angle: optionalText(500).describe('How to approach it: hook, structure or copy angle.'),
  goal: optionalText(200).describe('What the piece should achieve (e.g. saves, DMs, visits).'),
}).strict();

export const customStrategyFields = {
  name: text(120).min(1),
  description: optionalText(2000).describe('The approach / framework in a few sentences.'),
  objective_id: z.string().uuid().nullable().optional().describe('Catalog objective it pursues, if any.'),
  based_on_strategy_id: z.string().uuid().nullable().optional()
    .describe('Catalog strategy it was adapted from, if any.'),
  kpi_primary: optionalText(200),
  kpi_secondary: optionalText(200),
  cta_mechanic: optionalText(1000).describe('How the content converts: the recurring call to action.'),
  calendar: z.array(customCalendarItemSchema).min(1).max(CUSTOM_STRATEGY_LIMITS.posts)
    .describe('Content pieces of the cycle. The cycle repeats after the last week.'),
};

export const customStrategyInputSchema = z.object(customStrategyFields).strict();
export type CustomStrategyInput = z.input<typeof customStrategyInputSchema>;
type ParsedInput = z.output<typeof customStrategyInputSchema>;

/** Para una edición parcial: todos los campos opcionales. */
export const customStrategyPatchSchema = customStrategyInputSchema.partial().strict();
export type CustomStrategyPatch = z.input<typeof customStrategyPatchSchema>;

export type CustomCalendarItem = z.output<typeof customCalendarItemSchema>;

export interface CustomStrategy {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  objective_id: string | null;
  based_on_strategy_id: string | null;
  kpi_primary: string | null;
  kpi_secondary: string | null;
  cta_mechanic: string | null;
  calendar: CustomCalendarItem[];
  created_by: string | null;
  created_via: 'ui' | 'chat' | 'api' | 'mcp';
  updated_via: 'ui' | 'chat' | 'api' | 'mcp';
  created_at: string;
  updated_at: string;
}

const COLUMNS = `id, org_id, name, description, objective_id, based_on_strategy_id,
  kpi_primary, kpi_secondary, cta_mechanic, calendar, created_by, created_via, updated_via,
  created_at, updated_at`;

function dbError(message: string, ctx: ServiceContext, error: { message: string }): ServiceError {
  reportError(new Error(error.message), { route: ROUTE, service: 'supabase', auth: ctx.auth });
  return new ServiceError('unavailable', 500, message).markReported();
}

function notFound(ctx: ServiceContext): ServiceError {
  return new ServiceError(
    'not_found',
    404,
    msg(ctx.language, 'No encontramos esa estrategia', 'Strategy not found'),
  );
}

/** Origen para las columnas created_via / updated_via. */
function via(ctx: ServiceContext): CustomStrategy['created_via'] {
  return ctx.source === 'route' ? 'ui' : ctx.source;
}

/** Ordena el calendario por semana, conservando el orden dentro de cada una. */
function sortCalendar(items: CustomCalendarItem[]): CustomCalendarItem[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => a.item.week - b.item.week || a.i - b.i)
    .map(({ item }) => item);
}

function normalize(row: Record<string, unknown>): CustomStrategy {
  const calendar = Array.isArray(row.calendar) ? (row.calendar as CustomCalendarItem[]) : [];
  return { ...(row as unknown as CustomStrategy), calendar };
}

/** true si una integración (API / MCP) escribió o editó su texto. */
export function isExternalCustomStrategy(s: Pick<CustomStrategy, 'created_via' | 'updated_via'>): boolean {
  return s.created_via === 'api' || s.created_via === 'mcp' || s.updated_via === 'api' || s.updated_via === 'mcp';
}

function parseInput<T extends z.ZodTypeAny>(ctx: ServiceContext, schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const message = msg(ctx.language, 'Entrada inválida', 'Invalid input');
    throw new ServiceError('invalid_input', 422, message, { error: message, issues: z.flattenError(parsed.error) });
  }
  return parsed.data;
}

/** El objetivo y la estrategia base, si vienen, tienen que existir en el catálogo. */
async function assertCatalogRefs(
  ctx: ServiceContext,
  refs: { objective_id?: string | null; based_on_strategy_id?: string | null },
): Promise<void> {
  const db = createSupabaseServer();
  const invalid = (field: string) => new ServiceError(
    'invalid_input',
    422,
    msg(ctx.language, `El campo ${field} no existe en el catálogo`, `${field} is not in the catalog`),
  );
  if (refs.objective_id) {
    const { data } = await db.from('kefy_content_objectives').select('id').eq('id', refs.objective_id).maybeSingle();
    if (!data) throw invalid('objective_id');
  }
  if (refs.based_on_strategy_id) {
    const { data } = await db.from('kefy_content_strategies').select('id').eq('id', refs.based_on_strategy_id).maybeSingle();
    if (!data) throw invalid('based_on_strategy_id');
  }
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function listCustomStrategies(ctx: ServiceContext): Promise<CustomStrategy[]> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_custom_strategies')
    .select(COLUMNS)
    .eq('org_id', ctx.auth.orgId)
    .order('updated_at', { ascending: false });
  if (error) throw dbError('Failed to load custom strategies', ctx, error);
  return ((data ?? []) as Record<string, unknown>[]).map(normalize);
}

export async function getCustomStrategy(ctx: ServiceContext, id: string): Promise<CustomStrategy> {
  if (!z.string().uuid().safeParse(id).success) throw notFound(ctx);
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_custom_strategies')
    .select(COLUMNS)
    .eq('id', id)
    .eq('org_id', ctx.auth.orgId)
    .maybeSingle();
  if (error) throw dbError('Failed to load custom strategy', ctx, error);
  if (!data) throw notFound(ctx);
  return normalize(data as Record<string, unknown>);
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export async function createCustomStrategy(ctx: ServiceContext, input: unknown): Promise<CustomStrategy> {
  const parsed: ParsedInput = parseInput(ctx, customStrategyInputSchema, input);
  await assertCatalogRefs(ctx, parsed);

  const db = createSupabaseServer();
  const { count, error: countError } = await db
    .from('kefy_custom_strategies')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', ctx.auth.orgId);
  if (countError) throw dbError('Failed to count custom strategies', ctx, countError);
  if ((count ?? 0) >= CUSTOM_STRATEGY_LIMITS.perOrg) {
    throw new ServiceError(
      'conflict',
      409,
      msg(
        ctx.language,
        `Llegaste al máximo de ${CUSTOM_STRATEGY_LIMITS.perOrg} estrategias propias. Borra una para crear otra.`,
        `You've reached the maximum of ${CUSTOM_STRATEGY_LIMITS.perOrg} custom strategies. Delete one to create another.`,
      ),
    );
  }

  const { data, error } = await db
    .from('kefy_custom_strategies')
    .insert({
      org_id: ctx.auth.orgId,
      name: parsed.name,
      description: parsed.description ?? null,
      objective_id: parsed.objective_id ?? null,
      based_on_strategy_id: parsed.based_on_strategy_id ?? null,
      kpi_primary: parsed.kpi_primary ?? null,
      kpi_secondary: parsed.kpi_secondary ?? null,
      cta_mechanic: parsed.cta_mechanic ?? null,
      calendar: sortCalendar(parsed.calendar),
      created_by: ctx.auth.userId,
      created_via: via(ctx),
      updated_via: via(ctx),
    })
    .select(COLUMNS)
    .single();
  if (error || !data) throw dbError('Failed to create custom strategy', ctx, error ?? { message: 'no row' });
  return normalize(data as Record<string, unknown>);
}

export async function updateCustomStrategy(
  ctx: ServiceContext,
  id: string,
  patch: unknown,
): Promise<CustomStrategy> {
  const parsed = parseInput(ctx, customStrategyPatchSchema, patch);
  if (Object.keys(parsed).length === 0) {
    throw new ServiceError('invalid_input', 400, msg(ctx.language, 'No hay cambios', 'No changes'));
  }
  await getCustomStrategy(ctx, id);
  await assertCatalogRefs(ctx, parsed);

  const update: Record<string, unknown> = { updated_via: via(ctx) };
  for (const [key, value] of Object.entries(parsed)) {
    if (value === undefined) continue;
    update[key] = key === 'calendar' ? sortCalendar(value as CustomCalendarItem[]) : value;
  }

  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_custom_strategies')
    .update(update)
    .eq('id', id)
    .eq('org_id', ctx.auth.orgId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw dbError('Failed to update custom strategy', ctx, error);
  if (!data) throw notFound(ctx);
  return normalize(data as Record<string, unknown>);
}

/** Borra la estrategia. Si estaba activa, la FK deja la org con la del catálogo. */
export async function deleteCustomStrategy(ctx: ServiceContext, id: string): Promise<void> {
  if (!z.string().uuid().safeParse(id).success) throw notFound(ctx);
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_custom_strategies')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.auth.orgId)
    .select('id');
  if (error) throw dbError('Failed to delete custom strategy', ctx, error);
  if (!data || data.length === 0) throw notFound(ctx);
}

// ─── Adaptador al formato del catálogo ───────────────────────────────────────
// Las ideas de contenido y el contexto de generación leen plantillas del
// catálogo (topic_es / topic_en…). Una estrategia propia está en un solo
// idioma, así que el mismo texto va en ambos.

export interface CustomStrategyBundle {
  framework_name_es: string;
  framework_name_en: string;
  kpi_primary_es: string | null;
  kpi_primary_en: string | null;
  templates: StrategyTemplate[];
}

/** Carga una estrategia propia de `orgId` con la forma de una del catálogo, o null. */
export async function loadCustomStrategyBundle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  customStrategyId: string,
): Promise<CustomStrategyBundle | null> {
  const { data } = await db
    .from('kefy_custom_strategies')
    .select('id, name, kpi_primary, calendar')
    .eq('id', customStrategyId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (!data) return null;
  return customToBundle(normalize(data as Record<string, unknown>));
}

export function customToBundle(s: Pick<CustomStrategy, 'id' | 'name' | 'kpi_primary' | 'calendar'>): CustomStrategyBundle {
  const perWeek = new Map<number, number>();
  const templates: StrategyTemplate[] = sortCalendar(s.calendar).map((item, i) => {
    const postNum = (perWeek.get(item.week) ?? 0) + 1;
    perWeek.set(item.week, postNum);
    return {
      id: `custom-${s.id}-${i}`,
      week_num: item.week,
      post_num: postNum,
      format: item.format,
      channel_hint: item.channel ?? 'general',
      topic_es: item.topic,
      topic_en: item.topic,
      goal_es: item.goal ?? null,
      goal_en: item.goal ?? null,
      sort_order: i,
      copy_structure_es: item.angle ?? null,
      copy_structure_en: item.angle ?? null,
    };
  });
  return {
    framework_name_es: s.name,
    framework_name_en: s.name,
    kpi_primary_es: s.kpi_primary,
    kpi_primary_en: s.kpi_primary,
    templates,
  };
}
