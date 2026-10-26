// ─── Servicio: reglas de engagement ──────────────────────────────────────────
//
// Respuestas automáticas a comentarios y DMs (kefy_engagement_rules). Lógica de
// /api/automations/engagement/rules/**, compartida con las herramientas del
// asistente (list_engagement_rules, save_engagement_rule,
// delete_engagement_rule). Las ejecuta lib/engagement-executor.ts cuando llega
// un webhook de Zernio.
//
// Marca: una regla nueva se guarda con la marca del contexto y solo responde en
// las cuentas de esa marca. Las reglas antiguas sin brand_id son de toda la
// organización (responden en todas las marcas): se listan junto con las de la
// marca y se pueden editar, pero una API key atada a una marca no las puede
// tocar (lo comprueba la herramienta, que conoce la key).
//
// Lo que de verdad se ejecuta: el executor solo entiende los disparadores
// WORKING_TRIGGERS y las acciones de ENGAGEMENT_ACTIONS, y se salta toda regla
// con delay_minutes > 0 (la espera no está implementada). La UI todavía ofrece
// más disparadores y esperas; la ruta los sigue aceptando, las herramientas no.

import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';

type Db = ReturnType<typeof createSupabaseServer>;

const ROUTE = 'lib/services/engagement';

/** Disparadores que admite la base (CHECK de kefy_engagement_rules). */
export const ENGAGEMENT_TRIGGERS = [
  'new_comment', 'new_follower', 'mention', 'comment_contains_keyword', 'new_dm',
  'dm_contains_keyword', 'brand_mention', 'post_shared', 'lead_score_threshold',
] as const;

/** Disparadores que el executor sabe ejecutar. */
export const WORKING_TRIGGERS = [
  'new_comment', 'comment_contains_keyword', 'new_dm', 'dm_contains_keyword',
] as const;

export const ENGAGEMENT_ACTIONS = ['reply_comment', 'reply_comment_ai', 'send_dm', 'send_dm_ai_response'] as const;

export type EngagementTrigger = (typeof ENGAGEMENT_TRIGGERS)[number];
export type EngagementAction = (typeof ENGAGEMENT_ACTIONS)[number];

const KEYWORD_TRIGGERS = new Set<string>(['comment_contains_keyword', 'dm_contains_keyword']);
const COMMENT_TRIGGERS = new Set<string>(['new_comment', 'comment_contains_keyword']);
const TEMPLATE_ACTIONS = new Set<string>(['reply_comment', 'send_dm']);
const COMMENT_ACTIONS = new Set<string>(['reply_comment', 'reply_comment_ai']);

export const engagementRuleFields = {
  name: z.string().trim().min(1).max(100),
  trigger_type: z.enum(ENGAGEMENT_TRIGGERS),
  trigger_config: z.record(z.string(), z.unknown()),
  conditions: z.array(z.unknown()).max(50),
  action_type: z.enum(ENGAGEMENT_ACTIONS),
  action_config: z.record(z.string(), z.unknown()),
  action_template: z.string().max(2000),
  ai_context: z.string().max(2000).nullable(),
  delay_minutes: z.number().int().min(0).max(1440),
  is_active: z.boolean(),
  condition_platform: z.string().trim().max(30).nullable(),
  condition_keyword: z.string().trim().max(100).nullable(),
  condition_rating: z.number().int().min(1).max(5).nullable(),
  lead_action_type: z.enum(['create_lead', 'update_lead']).nullable(),
  lead_action_score_delta: z.number().int().min(-1000).max(1000),
  lead_action_stage: z.string().max(30).nullable(),
};

const createSchema = z.object({
  ...engagementRuleFields,
  trigger_config: engagementRuleFields.trigger_config.default({}),
  conditions: engagementRuleFields.conditions.default([]),
  action_config: engagementRuleFields.action_config.default({}),
  action_template: engagementRuleFields.action_template.default(''),
  ai_context: engagementRuleFields.ai_context.optional().default(null),
  delay_minutes: engagementRuleFields.delay_minutes.default(0),
  is_active: engagementRuleFields.is_active.default(true),
  condition_platform: engagementRuleFields.condition_platform.optional().default(null),
  condition_keyword: engagementRuleFields.condition_keyword.optional().default(null),
  condition_rating: engagementRuleFields.condition_rating.optional().default(null),
  lead_action_type: engagementRuleFields.lead_action_type.optional().default(null),
  lead_action_score_delta: engagementRuleFields.lead_action_score_delta.default(0),
  lead_action_stage: engagementRuleFields.lead_action_stage.optional().default(null),
}).strip();

const patchSchema = z.object(
  Object.fromEntries(Object.entries(engagementRuleFields).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof typeof engagementRuleFields]: z.ZodOptional<(typeof engagementRuleFields)[K]>
  },
).strip();

export type EngagementRuleInput = z.input<typeof createSchema>;
export type EngagementRulePatch = z.input<typeof patchSchema>;

export interface EngagementRuleRow {
  id: string;
  org_id: string;
  brand_id: string | null;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  conditions: unknown[];
  action_type: string;
  action_config: Record<string, unknown>;
  action_template: string;
  ai_context: string | null;
  delay_minutes: number;
  is_active: boolean;
  condition_platform: string | null;
  condition_keyword: string | null;
  condition_rating: number | null;
  lead_action_type: string | null;
  lead_action_score_delta: number | null;
  lead_action_stage: string | null;
  created_from: string | null;
  times_triggered: number | null;
  last_triggered_at: string | null;
  created_at: string;
}

function parse<T extends z.ZodTypeAny>(ctx: ServiceContext, schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const issues = z.flattenError(r.error);
    const message = [
      ...issues.formErrors,
      ...Object.entries(issues.fieldErrors).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`),
    ].join('; ') || msg(ctx.language, 'Entrada inválida', 'Invalid input');
    throw new ServiceError('invalid_input', 422, message, { error: message, issues });
  }
  return r.data;
}

function dbError(ctx: ServiceContext, message: string, error: { message: string }): ServiceError {
  reportError(new Error(error.message), { route: ROUTE, service: 'supabase', auth: ctx.auth });
  return new ServiceError('unavailable', 500, message).markReported();
}

function notFound(ctx: ServiceContext): ServiceError {
  return new ServiceError('not_found', 404, msg(ctx.language, 'Regla no encontrada', 'Rule not found'));
}

/** Filtro de marca de una regla: la de la marca o una antigua de toda la org. */
function brandFilter(brandId: string): string {
  return `brand_id.is.null,brand_id.eq.${brandId}`;
}

/**
 * Por qué una regla no va a ejecutarse nunca, o null si se ejecuta. Lo usan la
 * herramienta (para rechazar reglas que no funcionan) y el listado (para
 * avisar de las que creó la UI con opciones que el executor no entiende).
 */
export function engagementRuleIssue(
  rule: Pick<EngagementRuleRow, 'trigger_type' | 'action_type' | 'action_template' | 'condition_keyword' | 'delay_minutes'>,
  lang: 'es' | 'en' = 'en',
): string | null {
  if (!(WORKING_TRIGGERS as readonly string[]).includes(rule.trigger_type)) {
    return msg(lang, `El disparador ${rule.trigger_type} todavía no se ejecuta`, `Trigger ${rule.trigger_type} is not executed yet`);
  }
  if ((rule.delay_minutes ?? 0) > 0) {
    return msg(lang, 'Las reglas con espera todavía no se ejecutan', 'Rules with a delay are not executed yet');
  }
  if (COMMENT_TRIGGERS.has(rule.trigger_type) !== COMMENT_ACTIONS.has(rule.action_type)) {
    return msg(
      lang,
      'Un comentario se responde con reply_comment / reply_comment_ai y un DM con send_dm / send_dm_ai_response',
      'Comments are answered with reply_comment / reply_comment_ai and DMs with send_dm / send_dm_ai_response',
    );
  }
  if (KEYWORD_TRIGGERS.has(rule.trigger_type) && !rule.condition_keyword?.trim()) {
    return msg(lang, 'Este disparador necesita condition_keyword', 'This trigger needs condition_keyword');
  }
  if (TEMPLATE_ACTIONS.has(rule.action_type) && !rule.action_template?.trim()) {
    return msg(lang, 'Esta acción necesita action_template', 'This action needs action_template');
  }
  return null;
}

// ─── Lectura ──────────────────────────────────────────────────────────────────

/**
 * Reglas de la marca del contexto y las antiguas de toda la organización, de
 * la más nueva a la más vieja. También desde la ruta: la página es de la marca
 * activa, y una regla de otra marca no responde en esta.
 */
export async function listEngagementRules(ctx: ServiceContext): Promise<EngagementRuleRow[]> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_engagement_rules')
    .select('*')
    .eq('org_id', ctx.auth.orgId)
    .or(brandFilter(ctx.brandId))
    .order('created_at', { ascending: false });
  if (error) throw dbError(ctx, 'Failed to fetch rules', error);
  return (data ?? []) as EngagementRuleRow[];
}

/** Una regla de la org; con brandScope 'strict', además de la marca (o sin marca). */
export async function getEngagementRule(ctx: ServiceContext, id: string, db: Db = createSupabaseServer()): Promise<EngagementRuleRow> {
  let q = db
    .from('kefy_engagement_rules')
    .select('*')
    .eq('id', id)
    .eq('org_id', ctx.auth.orgId);
  if (ctx.brandScope === 'strict') q = q.or(brandFilter(ctx.brandId));
  const { data, error } = await q.maybeSingle();
  if (error) throw dbError(ctx, 'Failed to fetch rule', error);
  if (!data) throw notFound(ctx);
  return data as EngagementRuleRow;
}

// ─── Escritura ────────────────────────────────────────────────────────────────

export async function createEngagementRule(ctx: ServiceContext, input: unknown): Promise<EngagementRuleRow> {
  const parsed = parse(ctx, createSchema, input);
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_engagement_rules')
    .insert({ ...parsed, org_id: ctx.auth.orgId, brand_id: ctx.brandId || null })
    .select('*')
    .single();
  if (error || !data) throw dbError(ctx, 'Failed to create rule', error ?? { message: 'insert returned no row' });
  return data as EngagementRuleRow;
}

export async function updateEngagementRule(ctx: ServiceContext, id: string, input: unknown): Promise<EngagementRuleRow> {
  const parsed = parse(ctx, patchSchema, input);
  const db = createSupabaseServer();
  await getEngagementRule(ctx, id, db);

  const updates = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined));
  if (Object.keys(updates).length === 0) {
    throw new ServiceError('invalid_input', 422, msg(ctx.language, 'No hay campos válidos', 'No valid fields to update'));
  }

  const { data, error } = await db
    .from('kefy_engagement_rules')
    .update(updates)
    .eq('id', id)
    .eq('org_id', ctx.auth.orgId)
    .select('*')
    .single();
  if (error || !data) throw dbError(ctx, 'Failed to update rule', error ?? { message: 'update returned no row' });
  return data as EngagementRuleRow;
}

export async function deleteEngagementRule(ctx: ServiceContext, id: string): Promise<void> {
  const db = createSupabaseServer();
  await getEngagementRule(ctx, id, db);
  const { error } = await db
    .from('kefy_engagement_rules')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.auth.orgId);
  if (error) throw dbError(ctx, 'Failed to delete rule', error);
}
