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
// Solo se guardan reglas que el executor ejecuta (engagementRuleIssue de
// lib/engagement-rules.ts): comentarios y DMs, cada uno con su acción. Una
// regla con delay_minutes > 0 se encola y la responde el cron
// /api/automations/engagement/run.
//
// Packs (kefy_automation_packs): plantillas de reglas por objetivo. Solo se
// ofrecen e instalan las reglas que se ejecutan, en la marca del contexto.

import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';
import {
  ENGAGEMENT_ACTIONS, ENGAGEMENT_TRIGGERS, MAX_DELAY_MINUTES, engagementRuleIssue, ruleKeywords,
} from '@/lib/engagement-rules';

type Db = ReturnType<typeof createSupabaseServer>;

const ROUTE = 'lib/services/engagement';

export {
  ENGAGEMENT_ACTIONS, ENGAGEMENT_TRIGGERS, WORKING_TRIGGERS, engagementRuleIssue,
  type EngagementAction, type EngagementTrigger,
} from '@/lib/engagement-rules';

export const engagementRuleFields = {
  name: z.string().trim().min(1).max(100),
  trigger_type: z.enum(ENGAGEMENT_TRIGGERS),
  trigger_config: z.record(z.string(), z.unknown()),
  conditions: z.array(z.unknown()).max(50),
  action_type: z.enum(ENGAGEMENT_ACTIONS),
  action_config: z.record(z.string(), z.unknown()),
  action_template: z.string().max(2000),
  ai_context: z.string().max(2000).nullable(),
  delay_minutes: z.number().int().min(0).max(MAX_DELAY_MINUTES),
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

/** Rechaza una regla que el executor nunca ejecutaría. */
function assertRuns(ctx: ServiceContext, rule: Parameters<typeof engagementRuleIssue>[0]): void {
  const issue = engagementRuleIssue(rule, ctx.language);
  if (issue) throw new ServiceError('invalid_input', 422, issue, { error: issue });
}

/** Campos que cambian cuándo o cómo responde una regla (renombrar o pausar no). */
const BEHAVIOR_FIELDS = ['trigger_type', 'trigger_config', 'action_type', 'action_template', 'condition_keyword'] as const;

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
  assertRuns(ctx, parsed);
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
  const current = await getEngagementRule(ctx, id, db);

  const updates = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined));
  if (Object.keys(updates).length === 0) {
    throw new ServiceError('invalid_input', 422, msg(ctx.language, 'No hay campos válidos', 'No valid fields to update'));
  }
  // Una regla antigua que no se ejecuta se puede renombrar, pausar o borrar;
  // cambiar su mecánica la tiene que dejar en una combinación que funcione.
  if (BEHAVIOR_FIELDS.some((k) => k in updates)) assertRuns(ctx, { ...current, ...updates } as EngagementRuleRow);

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

// ─── Packs ────────────────────────────────────────────────────────────────────

export interface EngagementPackRuleRow {
  id: string;
  pack_id: string;
  name_es: string;
  name_en: string;
  desc_es: string | null;
  desc_en: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  action_type: string;
  action_config: Record<string, unknown> | null;
  ai_context: string | null;
  delay_minutes: number | null;
  lead_action_type: 'create_lead' | 'update_lead' | null;
  lead_action_score_delta: number | null;
  lead_action_stage: string | null;
  sort_order: number;
}

export interface EngagementPackRow {
  id: string;
  objective_id: string;
  name_es: string;
  name_en: string;
  desc_es: string | null;
  desc_en: string | null;
  icon: string | null;
  sort_order: number;
  kefy_automation_pack_rules: EngagementPackRuleRow[];
}

/** Una regla de pack vista como regla de engagement, para validarla. */
function packRuleShape(pr: EngagementPackRuleRow) {
  return {
    trigger_type: pr.trigger_type,
    trigger_config: pr.trigger_config ?? {},
    action_type: pr.action_type,
    action_template: '',
    condition_keyword: null,
  };
}

/** Solo las reglas del pack que el executor ejecuta (los seeds traen reseñas, seguidores…). */
function runnablePackRules(rules: EngagementPackRuleRow[]): EngagementPackRuleRow[] {
  return rules
    .filter((pr) => engagementRuleIssue(packRuleShape(pr)) === null)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Packs de un objetivo con sus reglas ejecutables. Un pack sin ninguna no se
 * ofrece: instalarlo no haría nada.
 */
export async function listEngagementPacks(ctx: ServiceContext, objectiveId?: string | null): Promise<EngagementPackRow[]> {
  const db = createSupabaseServer();
  let q = db
    .from('kefy_automation_packs')
    .select('id, objective_id, name_es, name_en, desc_es, desc_en, icon, sort_order')
    .order('sort_order');
  if (objectiveId) q = q.eq('objective_id', objectiveId);
  const { data: packs, error } = await q;
  if (error) throw dbError(ctx, 'Failed to fetch packs', error);
  if (!packs?.length) return [];

  const { data: rules, error: rulesError } = await db
    .from('kefy_automation_pack_rules')
    .select('*')
    .in('pack_id', packs.map((p) => p.id));
  if (rulesError) throw dbError(ctx, 'Failed to fetch pack rules', rulesError);

  return (packs as Omit<EngagementPackRow, 'kefy_automation_pack_rules'>[])
    .map((p) => ({
      ...p,
      kefy_automation_pack_rules: runnablePackRules(
        ((rules ?? []) as EngagementPackRuleRow[]).filter((r) => r.pack_id === p.id),
      ),
    }))
    .filter((p) => p.kefy_automation_pack_rules.length > 0);
}

/**
 * Instala las reglas ejecutables de un pack en la marca del contexto. Antes se
 * insertaban sin marca (respondían en todas) y con las palabras clave en
 * trigger_config, que el executor no leía. Instalarlo dos veces en la misma
 * marca no duplica las reglas.
 */
export async function installEngagementPack(
  ctx: ServiceContext,
  packId: string,
): Promise<{ rules: EngagementRuleRow[]; inserted: number }> {
  const db = createSupabaseServer();
  const { data: packRules, error } = await db
    .from('kefy_automation_pack_rules')
    .select('*')
    .eq('pack_id', packId);
  if (error) throw dbError(ctx, 'Failed to fetch pack rules', error);

  const runnable = runnablePackRules((packRules ?? []) as EngagementPackRuleRow[]);
  if (runnable.length === 0) {
    throw new ServiceError('not_found', 404, msg(ctx.language, 'Pack no encontrado o vacío', 'Pack not found or empty'));
  }

  const createdFrom = `pack:${packId}`;
  const { data: existing, error: existingError } = await db
    .from('kefy_engagement_rules')
    .select('*')
    .eq('org_id', ctx.auth.orgId)
    .eq('brand_id', ctx.brandId)
    .eq('created_from', createdFrom);
  if (existingError) throw dbError(ctx, 'Failed to fetch rules', existingError);
  if (existing?.length) return { rules: existing as EngagementRuleRow[], inserted: 0 };

  const toInsert = runnable.map((pr) => {
    // Las palabras clave pasan a condition_keyword, que es lo que la UI
    // muestra y edita; si quedaran en trigger_config, borrar una en la UI no
    // la quitaría.
    const { keywords: _keywords, ...triggerConfig } = pr.trigger_config ?? {};
    return {
      org_id: ctx.auth.orgId,
      brand_id: ctx.brandId,
      name: ctx.language === 'en' ? pr.name_en : pr.name_es,
      trigger_type: pr.trigger_type,
      trigger_config: triggerConfig,
      conditions: [],
      condition_keyword: ruleKeywords(packRuleShape(pr)).join(', ') || null,
      action_type: pr.action_type,
      action_config: pr.action_config ?? {},
      action_template: '',
      ai_context: pr.ai_context ?? null,
      delay_minutes: Math.min(Math.max(pr.delay_minutes ?? 0, 0), MAX_DELAY_MINUTES),
      is_active: true,
      created_from: createdFrom,
      lead_action_type: pr.lead_action_type ?? null,
      lead_action_score_delta: pr.lead_action_score_delta ?? 0,
      lead_action_stage: pr.lead_action_stage ?? null,
    };
  });

  const { data, error: insertError } = await db.from('kefy_engagement_rules').insert(toInsert).select('*');
  if (insertError) throw dbError(ctx, 'Failed to install pack', insertError);
  return { rules: (data ?? []) as EngagementRuleRow[], inserted: data?.length ?? 0 };
}
