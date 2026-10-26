// ─── Servicio: leads ──────────────────────────────────────────────────────────
//
// El pipeline de contactos de una marca (kefy_leads, único por marca + red +
// usuario). Lógica de /api/automations/leads/**, compartida con las
// herramientas del asistente (list_leads, save_lead, delete_lead).
//
// Siempre se lista por la marca del contexto. Cargar un lead por id filtra por
// org_id y, con brandScope 'strict', también por brand_id: antes PATCH y DELETE
// solo filtraban por organización.

import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';

type Db = ReturnType<typeof createSupabaseServer>;

const ROUTE = 'lib/services/leads';

export const LEAD_STAGES = ['frio', 'tibio', 'caliente', 'contactado', 'convertido'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export interface LeadRow {
  id: string;
  org_id: string;
  brand_id: string | null;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  channel: string;
  stage: LeadStage;
  score: number;
  notes: string | null;
  tags: string[];
  contacted: boolean;
  contacted_at: string | null;
  converted: boolean;
  converted_at: string | null;
  first_interaction_at: string;
  last_interaction_at: string;
  created_at: string;
}

const leadFields = {
  display_name: z.string().trim().max(200).nullable(),
  avatar_url: z.string().trim().max(2048).nullable(),
  stage: z.enum(LEAD_STAGES),
  score: z.number().int().min(-100000).max(100000),
  notes: z.string().max(5000).nullable(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30),
};

const createSchema = z.object({
  username: z.string().trim().min(1).max(200),
  channel: z.string().trim().min(1).max(30),
  display_name: leadFields.display_name.optional(),
  avatar_url: leadFields.avatar_url.optional(),
  stage: leadFields.stage.optional(),
  score: leadFields.score.optional(),
  notes: leadFields.notes.optional(),
  tags: leadFields.tags.optional(),
});

const patchSchema = z.object({
  ...Object.fromEntries(Object.entries(leadFields).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof typeof leadFields]: z.ZodOptional<(typeof leadFields)[K]>
  },
  contacted: z.boolean().optional(),
  contacted_at: z.iso.datetime({ offset: true }).nullable().optional(),
  converted: z.boolean().optional(),
  converted_at: z.iso.datetime({ offset: true }).nullable().optional(),
});

export type LeadCreateInput = z.input<typeof createSchema>;
export type LeadPatch = z.input<typeof patchSchema>;

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

/** Escapa los comodines de LIKE para buscar el texto tal cual. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ─── Lectura ──────────────────────────────────────────────────────────────────

export interface ListLeadsInput {
  stage?: string | null;
  channel?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

/** Leads de la marca del contexto, por última interacción. */
export async function listLeads(
  ctx: ServiceContext,
  input: ListLeadsInput = {},
): Promise<{ leads: LeadRow[]; total: number }> {
  const limit = Math.min(Math.max(Number.isFinite(input.limit) ? Number(input.limit) : 100, 1), 200);
  const offset = Math.max(Number.isFinite(input.offset) ? Number(input.offset) : 0, 0);

  const db = createSupabaseServer();
  let q = db
    .from('kefy_leads')
    .select('*', { count: 'exact' })
    .eq('org_id', ctx.auth.orgId)
    .eq('brand_id', ctx.brandId)
    .order('last_interaction_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (input.stage) q = q.eq('stage', input.stage);
  if (input.channel) q = q.eq('channel', input.channel);
  if (input.search) q = q.ilike('username', `%${escapeLike(input.search)}%`);

  const { data, error, count } = await q;
  if (error) throw dbError(ctx, 'Failed to fetch leads', error);
  return { leads: (data ?? []) as LeadRow[], total: count ?? 0 };
}

export async function getLead(ctx: ServiceContext, id: string, db: Db = createSupabaseServer()): Promise<LeadRow> {
  let q = db
    .from('kefy_leads')
    .select('*')
    .eq('id', id)
    .eq('org_id', ctx.auth.orgId);
  if (ctx.brandScope === 'strict') q = q.eq('brand_id', ctx.brandId);
  const { data, error } = await q.maybeSingle();
  if (error) throw dbError(ctx, 'Failed to fetch lead', error);
  if (!data) throw new ServiceError('not_found', 404, msg(ctx.language, 'Lead no encontrado', 'Lead not found'));
  return data as LeadRow;
}

// ─── Escritura ────────────────────────────────────────────────────────────────

/**
 * Crea un lead de la marca o, si ya existe el mismo usuario en esa red, lo
 * sobrescribe (como hacía POST /api/automations/leads).
 */
export async function upsertLead(ctx: ServiceContext, input: unknown): Promise<LeadRow> {
  const parsed = parse(ctx, createSchema, input);
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_leads')
    .upsert({
      org_id: ctx.auth.orgId,
      brand_id: ctx.brandId,
      username: parsed.username,
      channel: parsed.channel,
      display_name: parsed.display_name ?? null,
      avatar_url: parsed.avatar_url ?? null,
      stage: parsed.stage ?? 'frio',
      score: parsed.score ?? 0,
      notes: parsed.notes ?? null,
      tags: parsed.tags ?? [],
      last_interaction_at: new Date().toISOString(),
    }, { onConflict: 'brand_id,channel,username' })
    .select('*')
    .single();
  if (error || !data) throw dbError(ctx, 'Failed to save lead', error ?? { message: 'upsert returned no row' });
  return data as LeadRow;
}

export async function updateLead(ctx: ServiceContext, id: string, input: unknown): Promise<LeadRow> {
  const parsed = parse(ctx, patchSchema, input);
  const db = createSupabaseServer();
  await getLead(ctx, id, db);

  const updates: Record<string, unknown> = Object.fromEntries(
    Object.entries(parsed).filter(([, v]) => v !== undefined),
  );
  // Marcar como contactado o convertido pone la fecha si no viene.
  const now = new Date().toISOString();
  if (parsed.contacted === true && !parsed.contacted_at) updates.contacted_at = now;
  if (parsed.converted === true && !parsed.converted_at) updates.converted_at = now;

  if (Object.keys(updates).length === 0) {
    throw new ServiceError('invalid_input', 422, msg(ctx.language, 'No hay campos válidos', 'No valid fields to update'));
  }

  const { data, error } = await db
    .from('kefy_leads')
    .update(updates)
    .eq('id', id)
    .eq('org_id', ctx.auth.orgId)
    .select('*')
    .single();
  if (error || !data) throw dbError(ctx, 'Failed to update lead', error ?? { message: 'update returned no row' });
  return data as LeadRow;
}

export async function deleteLead(ctx: ServiceContext, id: string): Promise<void> {
  const db = createSupabaseServer();
  await getLead(ctx, id, db);
  const { error } = await db
    .from('kefy_leads')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.auth.orgId);
  if (error) throw dbError(ctx, 'Failed to delete lead', error);
}
