// lib/engagement-executor.ts
// Evaluates active engagement rules for an org and executes matching actions
// when social events arrive (comments and DMs, the only events Zernio sends).
//
// Per event: the matching rules of the account's brand score the sender as a
// lead (lead_action_* + kefy_lead_scoring_config), then each rule answers right
// away or, with delay_minutes > 0, is queued in kefy_engagement_jobs for the
// cron /api/automations/engagement/run (runDueEngagementJobs).

import { createSupabaseServer } from '@/lib/supabase';
import { generateContentText } from '@/lib/ai';
import { replyToComment, sendMessage } from '@/lib/zernio';
import { getBrandKitForBrand } from '@/lib/services/brand-kit';
import { recordLeadInteraction } from '@/lib/services/lead-scoring';
import { checkAiSpend } from '@/lib/ai-guard';
import { reportError } from '@/lib/observability';
import { engagementRuleIssue, isKeywordTrigger, matchesKeywords, ruleKeywords } from '@/lib/engagement-rules';
import type { JWTPayload } from '@/types/auth';

type DB = ReturnType<typeof createSupabaseServer>;

export type EngagementEvent =
  | {
      type: 'new_comment';
      socialAccountId: string;
      /** Marca de la cuenta que recibió el evento (null en cuentas antiguas sin marca). */
      brandId: string | null;
      zernioAccountId: string;
      commentId: string;
      postId: string;
      body: string;
      platform: string;
      authorId: string;
      authorName?: string | null;
      authorAvatar?: string | null;
    }
  | {
      type: 'new_dm';
      socialAccountId: string;
      brandId: string | null;
      zernioAccountId: string;
      threadId: string;
      /** Id del mensaje en la red: identifica el evento al encolarlo. */
      messageId: string;
      body: string;
      platform: string;
      senderId: string;
      senderName?: string | null;
      senderAvatar?: string | null;
    };

type EngagementRule = {
  id: string;
  org_id: string;
  brand_id: string | null;
  is_active: boolean;
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  condition_platform: string | null;
  condition_keyword: string | null;
  action_type: string;
  action_template: string;
  ai_context: string | null;
  delay_minutes: number;
  lead_action_type: 'create_lead' | 'update_lead' | null;
  lead_action_score_delta: number | null;
  lead_action_stage: string | null;
};

const RULE_COLUMNS =
  'id, org_id, brand_id, is_active, trigger_type, trigger_config, condition_platform, condition_keyword, ' +
  'action_type, action_template, ai_context, delay_minutes, lead_action_type, lead_action_score_delta, lead_action_stage';

function matchesTrigger(rule: EngagementRule, event: EngagementEvent): boolean {
  const isComment = event.type === 'new_comment';
  if (rule.trigger_type === 'new_comment' || rule.trigger_type === 'comment_contains_keyword') return isComment;
  if (rule.trigger_type === 'new_dm' || rule.trigger_type === 'dm_contains_keyword') return !isComment;
  return false;
}

function matchesConditions(rule: EngagementRule, event: EngagementEvent): boolean {
  // 'all' lo guardaban versiones antiguas de la UI: es lo mismo que null.
  const platform = rule.condition_platform && rule.condition_platform !== 'all' ? rule.condition_platform : null;
  if (platform && platform !== event.platform) return false;
  // Las palabras clave filtran con cualquier disparador; con los *_keyword
  // además son obligatorias (sin ninguna, la regla no responde nada).
  const keywords = ruleKeywords(rule);
  if (keywords.length === 0) return !isKeywordTrigger(rule.trigger_type);
  return matchesKeywords(event.body ?? '', keywords);
}

/** Id del evento en la red: un webhook repetido no encola dos veces. */
function eventKey(event: EngagementEvent): string {
  return event.type === 'new_comment' ? `comment:${event.commentId}` : `dm:${event.messageId}`;
}

const ROUTE = 'lib/engagement-executor';

/** La respuesta con IA no se envía: la guardia de gasto no la autorizó. */
class SpendBlocked extends Error {}

/**
 * Identidad con la que el webhook cobra a la organización. No hay usuario
 * detrás (lo dispara un comentario o DM), así que el plan se lee de la
 * organización: es el que fija el tope de créditos.
 */
async function systemAuth(db: DB, orgId: string): Promise<JWTPayload> {
  const { data: org } = await db.from('kefy_organizations').select('plan').eq('id', orgId).maybeSingle();
  const plan = (org?.plan as JWTPayload['plan'] | undefined) ?? 'starter';
  return { userId: 'system:engagement', orgId, role: 'owner', plan };
}

/**
 * Cobra la respuesta con IA con la misma guardia que las rutas (suscripción →
 * rate limit → créditos de texto). Sin esto cualquier comentario o DM
 * entrante gastaba en Anthropic sin límite, también con el mes gratis vencido
 * o los créditos agotados. Si la guardia bloquea, la regla no responde.
 */
async function chargeAIReply(db: DB, orgId: string, rule: EngagementRule): Promise<() => Promise<void>> {
  const auth = await systemAuth(db, orgId);
  const spend = await checkAiSpend(auth, { operation: 'text', route: ROUTE });
  if (spend.ok) return spend.refund;
  // Créditos agotados, suscripción vencida o ráfaga: es el freno funcionando.
  // Solo se reporta cuando no se pudo verificar (503).
  if (spend.status >= 500) {
    reportError(new Error(String(spend.body.error)), { route: ROUTE, auth, extra: { ruleId: rule.id } });
  }
  throw new SpendBlocked(`spend blocked (${spend.status})`);
}

async function generateAIReply(
  db: DB,
  orgId: string,
  brandId: string | null,
  rule: EngagementRule,
  contextBody: string,
): Promise<string> {
  const refund = await chargeAIReply(db, orgId, rule);
  try {
    return await writeAIReply(db, brandId, rule, contextBody);
  } catch (err) {
    // Un fallo de la IA no se le cobra a la organización.
    await refund();
    throw err;
  }
}

async function writeAIReply(
  db: DB,
  brandId: string | null,
  rule: EngagementRule,
  contextBody: string,
): Promise<string> {
  // El kit de la marca de la cuenta: antes se leía con .eq('org_id')
  // .maybeSingle(), que con varias marcas devuelve error y responde sin voz.
  const { data: brandKit } = brandId
    ? await getBrandKitForBrand(db, brandId)
    : { data: null };

  const extraCtx = [rule.ai_context, brandKit?.notes].filter(Boolean).join('\n');

  const result = await generateContentText({
    channel:    'generic',
    model:      'claude',
    tone:       brandKit?.tone ?? undefined,
    topic:      contextBody,
    brandName:  brandKit?.name ?? undefined,
    tagline:    brandKit?.tagline ?? undefined,
    extraCtx:   extraCtx || undefined,
  });

  // Strip hashtags from replies — they look odd in comment/DM replies
  return result.body.trim();
}

async function executeAction(
  db: DB,
  rule: EngagementRule,
  event: EngagementEvent,
): Promise<void> {
  const { action_type, action_template } = rule;

  switch (action_type) {
    case 'reply_comment': {
      if (event.type !== 'new_comment') break;
      if (!action_template) break;
      await replyToComment(event.zernioAccountId, event.postId, event.commentId, action_template);
      break;
    }

    case 'reply_comment_ai': {
      if (event.type !== 'new_comment') break;
      const text = await generateAIReply(db, rule.org_id, event.brandId, rule, event.body);
      await replyToComment(event.zernioAccountId, event.postId, event.commentId, text);
      break;
    }

    case 'send_dm': {
      if (event.type !== 'new_dm') break;
      if (!action_template) break;
      await sendMessage(event.zernioAccountId, event.threadId, action_template);
      break;
    }

    case 'send_dm_ai_response': {
      if (event.type !== 'new_dm') break;
      const text = await generateAIReply(db, rule.org_id, event.brandId, rule, event.body);
      await sendMessage(event.zernioAccountId, event.threadId, text);
      break;
    }

    default:
      console.warn(`[Engagement] unknown action_type "${action_type}" for rule ${rule.id}`);
  }
}

type RuleOutcome = 'done' | 'skipped';

/** Ejecuta la acción de una regla y suma el contador. Lanza si falla. */
async function runRule(db: DB, rule: EngagementRule, event: EngagementEvent): Promise<RuleOutcome> {
  try {
    await executeAction(db, rule, event);
  } catch (err) {
    if (err instanceof SpendBlocked) return 'skipped';
    throw err;
  }

  const { data: current } = await db
    .from('kefy_engagement_rules')
    .select('times_triggered')
    .eq('id', rule.id)
    .single();

  await db
    .from('kefy_engagement_rules')
    .update({
      times_triggered:   (current?.times_triggered ?? 0) + 1,
      last_triggered_at: new Date().toISOString(),
    })
    .eq('id', rule.id);
  return 'done';
}

/**
 * Suma la interacción al lead que la envió, una vez por evento. Manda la
 * primera regla que crea leads; si no hay, la que solo actualiza; sin ninguna,
 * solo puntúa a quien ya es lead (con los puntos de la configuración).
 */
async function scoreLead(db: DB, orgId: string, event: EngagementEvent, rules: EngagementRule[]): Promise<void> {
  if (!event.brandId) return;
  const rule = rules.find((r) => r.lead_action_type === 'create_lead')
    ?? rules.find((r) => r.lead_action_type === 'update_lead');
  const isComment = event.type === 'new_comment';

  await recordLeadInteraction(db, {
    orgId,
    brandId:     event.brandId,
    channel:     event.platform,
    username:    isComment ? event.authorId : event.senderId,
    displayName: isComment ? event.authorName : event.senderName,
    avatarUrl:   isComment ? event.authorAvatar : event.senderAvatar,
    type:        isComment ? 'comment' : 'dm',
    preview:     event.body,
    postId:      isComment ? event.postId : null,
    ruleId:      rule?.id ?? null,
    // 0 en una regla de pack significa «los puntos por defecto».
    scoreDelta:  rule?.lead_action_score_delta || null,
    stage:       rule?.lead_action_stage ?? null,
    create:      rule?.lead_action_type === 'create_lead',
  });
}

async function enqueue(db: DB, rule: EngagementRule, event: EngagementEvent): Promise<void> {
  const { error } = await db.from('kefy_engagement_jobs').insert({
    org_id:    rule.org_id,
    brand_id:  event.brandId,
    rule_id:   rule.id,
    event_key: eventKey(event),
    event,
    run_at:    new Date(Date.now() + rule.delay_minutes * 60_000).toISOString(),
  });
  // 23505: el mismo evento ya estaba en cola (webhook repetido).
  if (error && error.code !== '23505') {
    reportError(new Error(error.message), { route: ROUTE, service: 'supabase', extra: { ruleId: rule.id } });
  }
}

export async function executeEngagementRules(
  db: DB,
  orgId: string,
  event: EngagementEvent,
): Promise<void> {
  const { data: rules, error } = await db
    .from('kefy_engagement_rules')
    .select(RULE_COLUMNS)
    .eq('org_id', orgId)
    .eq('is_active', true)
    // Solo las reglas de la marca de la cuenta y las antiguas sin marca (de
    // toda la org). Sin este filtro, una regla de una marca respondía en las
    // cuentas de todas las demás.
    .or(event.brandId ? `brand_id.is.null,brand_id.eq.${event.brandId}` : 'brand_id.is.null');

  if (error) {
    reportError(new Error(error.message), { route: ROUTE, service: 'supabase', extra: { orgId } });
    return;
  }

  // Una regla antigua con una combinación que no se ejecuta (disparador sin
  // webhook, comentario respondido por DM…) no responde ni suma puntos.
  const matched = ((rules ?? []) as unknown as EngagementRule[]).filter((rule) =>
    engagementRuleIssue(rule) === null && matchesTrigger(rule, event) && matchesConditions(rule, event));

  try {
    await scoreLead(db, orgId, event, matched);
  } catch (err) {
    reportError(err, { route: ROUTE, extra: { orgId, step: 'lead_scoring' } });
  }

  for (const rule of matched) {
    if (rule.delay_minutes > 0) {
      await enqueue(db, rule, event);
      continue;
    }
    try {
      await runRule(db, rule, event);
    } catch (err) {
      reportError(err, { route: ROUTE, extra: { ruleId: rule.id, orgId } });
    }
  }
}

// ─── Respuestas con espera ────────────────────────────────────────────────────

/** Una respuesta que llega más de esto tarde (cron caído) ya no tiene sentido. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

type JobRow = {
  id: string;
  org_id: string;
  brand_id: string | null;
  rule_id: string;
  event: EngagementEvent;
  run_at: string;
  attempts: number;
};

export interface EngagementJobsSummary {
  done: number;
  skipped: number;
  failed: number;
}

async function finishJob(db: DB, id: string, status: 'done' | 'skipped' | 'failed', lastError: string | null = null) {
  await db
    .from('kefy_engagement_jobs')
    .update({ status, last_error: lastError, updated_at: new Date().toISOString() })
    .eq('id', id);
}

/**
 * Ejecuta las respuestas encoladas que ya vencieron. La regla se vuelve a leer
 * al ejecutar: si la pausaron, la borraron o la dejaron en una combinación que
 * no funciona, el trabajo se salta. La IA se cobra aquí, no al encolar.
 */
export async function runDueEngagementJobs(
  db: DB,
  opts: { now?: Date; limit?: number } = {},
): Promise<EngagementJobsSummary> {
  const now = opts.now ?? new Date();
  const summary: EngagementJobsSummary = { done: 0, skipped: 0, failed: 0 };

  const { data: jobs, error } = await db
    .from('kefy_engagement_jobs')
    .select('id, org_id, brand_id, rule_id, event, run_at, attempts')
    .eq('status', 'pending')
    .lte('run_at', now.toISOString())
    .order('run_at', { ascending: true })
    .limit(opts.limit ?? 25);
  if (error) {
    reportError(new Error(error.message), { route: ROUTE, service: 'supabase', extra: { step: 'jobs' } });
    return summary;
  }

  for (const job of (jobs ?? []) as JobRow[]) {
    // Reclamo atómico: si otra ejecución del cron ya lo tomó, no hay fila.
    const { data: claimed } = await db
      .from('kefy_engagement_jobs')
      .update({ status: 'running', attempts: job.attempts + 1, updated_at: now.toISOString() })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select('id');
    if (!claimed?.length) continue;

    if (now.getTime() - new Date(job.run_at).getTime() > STALE_AFTER_MS) {
      await finishJob(db, job.id, 'skipped', 'stale');
      summary.skipped++;
      continue;
    }

    const { data: rule } = await db
      .from('kefy_engagement_rules')
      .select(RULE_COLUMNS)
      .eq('id', job.rule_id)
      .eq('org_id', job.org_id)
      .maybeSingle();
    const r = rule as unknown as EngagementRule | null;
    if (!r || !r.is_active || engagementRuleIssue(r) !== null || (r.brand_id && r.brand_id !== job.brand_id)) {
      await finishJob(db, job.id, 'skipped', 'rule_inactive');
      summary.skipped++;
      continue;
    }

    try {
      const outcome = await runRule(db, r, job.event);
      await finishJob(db, job.id, outcome, outcome === 'skipped' ? 'spend_blocked' : null);
      summary[outcome]++;
    } catch (err) {
      reportError(err, { route: ROUTE, extra: { ruleId: r.id, orgId: job.org_id, jobId: job.id } });
      await finishJob(db, job.id, 'failed', err instanceof Error ? err.message.slice(0, 500) : 'error');
      summary.failed++;
    }
  }
  return summary;
}
