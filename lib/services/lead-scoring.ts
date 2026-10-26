// ─── Servicio: scoring de leads ───────────────────────────────────────────────
//
// Cuántos puntos suma cada interacción y desde qué puntaje sube de etapa un
// lead (kefy_lead_scoring_config, una fila por marca). Lógica de
// /api/automations/leads/scoring, compartida con las herramientas del
// asistente (get_lead_scoring, update_lead_scoring).
//
// recordLeadInteraction lo usa el executor de engagement cuando llega un
// comentario o un DM: crea o actualiza el lead, suma los puntos y registra la
// interacción en kefy_lead_interactions. Antes la configuración se guardaba
// pero nada la leía, y la ruta buscaba la fila por org_id, que con varias
// marcas fallaba (la columna única es brand_id desde la migración de marcas).

import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';
import { LEAD_STAGES, type LeadStage } from '@/lib/services/leads';

type Db = ReturnType<typeof createSupabaseServer>;

const ROUTE = 'lib/services/lead-scoring';

/** Tipos de interacción (CHECK de kefy_lead_interactions). */
export const INTERACTION_TYPES = ['comment', 'dm', 'mention', 'follow', 'share', 'click', 'manual'] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

/** Etapas a las que se sube por puntaje (frio es el punto de partida). */
export const THRESHOLD_STAGES = ['tibio', 'caliente', 'contactado', 'convertido'] as const;
type ThresholdStage = (typeof THRESHOLD_STAGES)[number];

export interface LeadScoringConfig {
  defaults: Record<InteractionType, number>;
  thresholds: Record<ThresholdStage, number>;
}

/** Los mismos valores que el DEFAULT de la migración (sin 'review', que ya no existe). */
export const DEFAULT_LEAD_SCORING: LeadScoringConfig = {
  defaults: { comment: 5, dm: 15, mention: 8, follow: 3, share: 12, click: 2, manual: 0 },
  thresholds: { tibio: 20, caliente: 50, contactado: 70, convertido: 100 },
};

const points = z.number().int().min(-1000).max(1000);
const threshold = z.number().int().min(0).max(100000);

const patchSchema = z.object({
  defaults: z.object(Object.fromEntries(INTERACTION_TYPES.map((k) => [k, points.optional()])) as {
    [K in InteractionType]: z.ZodOptional<typeof points>
  }).strip().optional(),
  thresholds: z.object(Object.fromEntries(THRESHOLD_STAGES.map((k) => [k, threshold.optional()])) as {
    [K in ThresholdStage]: z.ZodOptional<typeof threshold>
  }).strip().optional(),
}).strip();

export type LeadScoringPatch = z.input<typeof patchSchema>;

/** Completa una fila guardada con los valores por defecto y descarta claves viejas. */
function normalize(row: { defaults?: unknown; thresholds?: unknown } | null): LeadScoringConfig {
  const pick = <K extends string>(keys: readonly K[], src: unknown, fallback: Record<K, number>) =>
    Object.fromEntries(keys.map((k) => {
      const v = (src as Record<string, unknown> | null | undefined)?.[k];
      return [k, typeof v === 'number' && Number.isFinite(v) ? v : fallback[k]];
    })) as Record<K, number>;
  return {
    defaults: pick(INTERACTION_TYPES, row?.defaults, DEFAULT_LEAD_SCORING.defaults),
    thresholds: pick(THRESHOLD_STAGES, row?.thresholds, DEFAULT_LEAD_SCORING.thresholds),
  };
}

async function loadConfig(db: Db, brandId: string): Promise<{ config: LeadScoringConfig; error: { message: string } | null }> {
  const { data, error } = await db
    .from('kefy_lead_scoring_config')
    .select('defaults, thresholds')
    .eq('brand_id', brandId)
    .maybeSingle();
  return { config: normalize(data), error };
}

// ─── Configuración ────────────────────────────────────────────────────────────

/** Configuración de la marca del contexto (la de por defecto si no hay fila). */
export async function getLeadScoringConfig(ctx: ServiceContext): Promise<LeadScoringConfig> {
  const { config, error } = await loadConfig(createSupabaseServer(), ctx.brandId);
  if (error) {
    reportError(new Error(error.message), { route: ROUTE, service: 'supabase', auth: ctx.auth });
    throw new ServiceError('unavailable', 500, 'Failed to fetch lead scoring').markReported();
  }
  return config;
}

/** Cambia solo las claves que vienen; el resto se queda como estaba. */
export async function updateLeadScoringConfig(ctx: ServiceContext, input: unknown): Promise<LeadScoringConfig> {
  const r = patchSchema.safeParse(input);
  if (!r.success) {
    const issues = z.flattenError(r.error);
    const message = [
      ...issues.formErrors,
      ...Object.entries(issues.fieldErrors).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`),
    ].join('; ') || msg(ctx.language, 'Entrada inválida', 'Invalid input');
    throw new ServiceError('invalid_input', 422, message, { error: message, issues });
  }

  const current = await getLeadScoringConfig(ctx);
  const defined = <T extends object>(o: T | undefined) =>
    Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined));
  const next: LeadScoringConfig = {
    defaults: { ...current.defaults, ...defined(r.data.defaults) },
    thresholds: { ...current.thresholds, ...defined(r.data.thresholds) },
  };

  // Las etapas van en orden: un umbral menor que el de la etapa anterior haría
  // saltar etapas al revés.
  for (let i = 1; i < THRESHOLD_STAGES.length; i++) {
    const prev = THRESHOLD_STAGES[i - 1];
    const stage = THRESHOLD_STAGES[i];
    if (next.thresholds[stage] < next.thresholds[prev]) {
      const message = msg(
        ctx.language,
        `El umbral de ${stage} no puede ser menor que el de ${prev}`,
        `The ${stage} threshold cannot be lower than the ${prev} one`,
      );
      throw new ServiceError('invalid_input', 422, message, { error: message });
    }
  }

  const db = createSupabaseServer();
  const { error } = await db
    .from('kefy_lead_scoring_config')
    .upsert(
      { org_id: ctx.auth.orgId, brand_id: ctx.brandId, ...next, updated_at: new Date().toISOString() },
      { onConflict: 'brand_id' },
    );
  if (error) {
    reportError(new Error(error.message), { route: ROUTE, service: 'supabase', auth: ctx.auth });
    throw new ServiceError('unavailable', 500, 'Failed to save lead scoring').markReported();
  }
  return next;
}

// ─── Interacciones ────────────────────────────────────────────────────────────

const STAGE_RANK = Object.fromEntries(LEAD_STAGES.map((s, i) => [s, i])) as Record<LeadStage, number>;

function isStage(s: unknown): s is LeadStage {
  return typeof s === 'string' && (LEAD_STAGES as readonly string[]).includes(s);
}

/** La etapa más alta cuyo umbral alcanza el puntaje. */
export function stageForScore(score: number, thresholds: LeadScoringConfig['thresholds']): LeadStage {
  let stage: LeadStage = 'frio';
  for (const s of THRESHOLD_STAGES) if (score >= thresholds[s]) stage = s;
  return stage;
}

/** Un lead nunca baja de etapa solo: eso lo decide una persona. */
function highestStage(...stages: Array<LeadStage | null | undefined>): LeadStage {
  return stages.filter(isStage).reduce<LeadStage>((a, b) => (STAGE_RANK[b] > STAGE_RANK[a] ? b : a), 'frio');
}

export interface LeadInteractionInput {
  orgId: string;
  brandId: string;
  channel: string;
  /** Id del usuario en la red: estable aunque cambie su nombre. */
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  type: InteractionType;
  preview?: string | null;
  postId?: string | null;
  ruleId?: string | null;
  /** Puntos de la regla; null usa los de la configuración para `type`. */
  scoreDelta?: number | null;
  /** Etapa mínima en la que deja la regla al lead. */
  stage?: string | null;
  /** false: solo suma si el lead ya existe (update_lead o sin regla). */
  create: boolean;
}

/**
 * Suma una interacción a un lead de la marca. Devuelve null si el lead no
 * existe y no hay que crearlo. Lanza ante un error de base: el executor lo
 * reporta sin cortar las respuestas automáticas.
 */
export async function recordLeadInteraction(
  db: Db,
  input: LeadInteractionInput,
): Promise<{ leadId: string; score: number; stage: LeadStage; created: boolean } | null> {
  const { data: lead, error } = await db
    .from('kefy_leads')
    .select('id, score, stage, display_name, avatar_url')
    .eq('brand_id', input.brandId)
    .eq('channel', input.channel)
    .eq('username', input.username)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead && !input.create) return null;

  const { config, error: configError } = await loadConfig(db, input.brandId);
  if (configError) throw new Error(configError.message);

  const delta = input.scoreDelta ?? config.defaults[input.type] ?? 0;
  const score = (lead?.score ?? 0) + delta;
  const stage = highestStage(lead?.stage as LeadStage | undefined, stageForScore(score, config.thresholds),
    isStage(input.stage) ? input.stage : null);
  const now = new Date().toISOString();

  let leadId: string;
  if (lead) {
    const { error: updateError } = await db
      .from('kefy_leads')
      .update({
        score,
        stage,
        last_interaction_at: now,
        display_name: lead.display_name ?? input.displayName ?? null,
        avatar_url: input.avatarUrl ?? lead.avatar_url ?? null,
      })
      .eq('id', lead.id);
    if (updateError) throw new Error(updateError.message);
    leadId = lead.id;
  } else {
    const { data: created, error: insertError } = await db
      .from('kefy_leads')
      .insert({
        org_id: input.orgId,
        brand_id: input.brandId,
        channel: input.channel,
        username: input.username,
        display_name: input.displayName ?? null,
        avatar_url: input.avatarUrl ?? null,
        score,
        stage,
        first_interaction_at: now,
        last_interaction_at: now,
      })
      .select('id')
      .single();
    // Otro webhook lo creó entre la lectura y la escritura: se suma a ese.
    if (insertError?.code === '23505') return recordLeadInteraction(db, { ...input, create: false });
    if (insertError || !created) throw new Error(insertError?.message ?? 'insert returned no row');
    leadId = created.id;
  }

  const { error: interactionError } = await db.from('kefy_lead_interactions').insert({
    lead_id: leadId,
    org_id: input.orgId,
    brand_id: input.brandId,
    type: input.type,
    content_preview: input.preview ? input.preview.slice(0, 280) : null,
    post_id: input.postId ?? null,
    score_delta: delta,
    rule_id: input.ruleId ?? null,
  });
  if (interactionError) throw new Error(interactionError.message);

  return { leadId, score, stage, created: !lead };
}
