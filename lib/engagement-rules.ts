// ─── Reglas de engagement: qué combinaciones se ejecutan ─────────────────────
//
// Lo comparten la UI (/dashboard/automations/engagement), el servicio
// (lib/services/engagement.ts), las herramientas del asistente y el executor
// (lib/engagement-executor.ts). Sin imports de servidor: lo importa el cliente.
//
// La base admite más disparadores (CHECK de kefy_engagement_rules) de los que
// Zernio avisa por webhook: solo llegan comentarios (comment.received) y DMs
// (message.received). Una regla con otro disparador nunca se ejecutaría, así
// que no se puede crear; las que ya existen se marcan en el listado.

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
export type WorkingTrigger = (typeof WORKING_TRIGGERS)[number];
export type EngagementAction = (typeof ENGAGEMENT_ACTIONS)[number];

const KEYWORD_TRIGGERS = new Set<string>(['comment_contains_keyword', 'dm_contains_keyword']);
const COMMENT_TRIGGERS = new Set<string>(['new_comment', 'comment_contains_keyword']);
const TEMPLATE_ACTIONS = new Set<string>(['reply_comment', 'send_dm']);
const COMMENT_ACTIONS: readonly EngagementAction[] = ['reply_comment', 'reply_comment_ai'];
const DM_ACTIONS: readonly EngagementAction[] = ['send_dm', 'send_dm_ai_response'];

/** Espera máxima de una regla (24 h); la ejecuta el cron de engagement. */
export const MAX_DELAY_MINUTES = 1440;

export function isWorkingTrigger(t: string): t is WorkingTrigger {
  return (WORKING_TRIGGERS as readonly string[]).includes(t);
}

export function isKeywordTrigger(t: string): boolean {
  return KEYWORD_TRIGGERS.has(t);
}

/** Un comentario se responde en el comentario; un DM, por DM. */
export function actionsForTrigger(t: string): readonly EngagementAction[] {
  return COMMENT_TRIGGERS.has(t) ? COMMENT_ACTIONS : DM_ACTIONS;
}

/**
 * Palabras clave de una regla. condition_keyword admite varias separadas por
 * comas («precio, info»); las reglas de los packs las traen además en
 * trigger_config.keywords. Basta con que el texto contenga una.
 */
export function ruleKeywords(rule: { condition_keyword: string | null; trigger_config?: unknown }): string[] {
  const fromCondition = (rule.condition_keyword ?? '').split(',');
  const cfg = rule.trigger_config as { keywords?: unknown } | null | undefined;
  const fromConfig = Array.isArray(cfg?.keywords) ? cfg.keywords.filter((k): k is string => typeof k === 'string') : [];
  return [...new Set([...fromCondition, ...fromConfig].map((k) => k.trim().toLowerCase()).filter(Boolean))];
}

export function matchesKeywords(body: string, keywords: string[]): boolean {
  const text = body.toLowerCase();
  return keywords.some((k) => text.includes(k));
}

const say = (lang: 'es' | 'en', es: string, en: string) => (lang === 'es' ? es : en);

export interface RuleShape {
  trigger_type: string;
  action_type: string;
  action_template: string | null;
  condition_keyword: string | null;
  trigger_config?: unknown;
}

/**
 * Por qué una regla no va a ejecutarse nunca, o null si se ejecuta. El
 * servicio rechaza guardar una regla así; el listado avisa de las antiguas.
 */
export function engagementRuleIssue(rule: RuleShape, lang: 'es' | 'en' = 'en'): string | null {
  if (!isWorkingTrigger(rule.trigger_type)) {
    return say(
      lang,
      `El disparador ${rule.trigger_type} no se ejecuta: solo llegan comentarios y DMs`,
      `Trigger ${rule.trigger_type} never runs: only comments and DMs arrive`,
    );
  }
  if (!actionsForTrigger(rule.trigger_type).includes(rule.action_type as EngagementAction)) {
    return say(
      lang,
      'Un comentario se responde con reply_comment / reply_comment_ai y un DM con send_dm / send_dm_ai_response',
      'Comments are answered with reply_comment / reply_comment_ai and DMs with send_dm / send_dm_ai_response',
    );
  }
  if (isKeywordTrigger(rule.trigger_type) && ruleKeywords(rule).length === 0) {
    return say(lang, 'Este disparador necesita condition_keyword', 'This trigger needs condition_keyword');
  }
  if (TEMPLATE_ACTIONS.has(rule.action_type) && !rule.action_template?.trim()) {
    return say(lang, 'Esta acción necesita action_template', 'This action needs action_template');
  }
  return null;
}
