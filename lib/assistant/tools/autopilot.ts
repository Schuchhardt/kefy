// ─── Herramientas del asistente: autopilot ───────────────────────────────────
//
// list_autopilot_rules, save_autopilot_rule, delete_autopilot_rule y
// run_autopilot_now. Llaman a lib/services/autopilot.ts, el mismo servicio que
// /api/autopilot/**.
//
// Una regla activa genera y programa posts sola en las cuentas de la marca:
// crearla, editarla o reanudarla es 'publish' (la API key necesita ese scope y
// el chat siempre pide confirmación). Borrarla es 'write'. Como en la UI, solo
// owner/admin las gestionan.

import { z } from 'zod';
import { defineTool } from '@/lib/assistant/registry';
import { buildDashboardHref } from '@/lib/assistant/links';
import type { ToolLink } from '@/lib/assistant/types';
import { ServiceError, msg } from '@/lib/services/errors';
import {
  MAX_MANUAL_RUN, autopilotRuleFields, createAutopilotRule, deleteAutopilotRule, getAutopilotRule,
  listAutopilotRules, runAutopilotNow, updateAutopilotRule, type AutopilotRuleRow,
} from '@/lib/services/autopilot';

function autopilotLink(lang: 'es' | 'en'): ToolLink {
  return { label: msg(lang, 'Abrir autopilot', 'Open autopilot'), href: buildDashboardHref(lang, 'automations') };
}

function ruleView(r: AutopilotRuleRow) {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    channel: r.channel,
    social_account_ids: r.social_account_ids,
    frequency: r.frequency,
    day_of_week: r.day_of_week,
    time_of_day: r.time_of_day,
    timezone: r.timezone,
    ai_model: r.ai_model,
    tone: r.tone,
    topic_hints: r.topic_hints,
    next_run_at: r.next_run_at,
    last_run_at: r.last_run_at,
  };
}

// ─── list_autopilot_rules ────────────────────────────────────────────────────

const listAutopilotRulesTool = defineTool({
  name: 'list_autopilot_rules',
  title: { es: 'Ver reglas de autopilot', en: 'List autopilot rules' },
  kind: 'read',
  description:
    "Lists the brand's autopilot rules: each one generates a post with AI and schedules it on the given accounts on " +
    'a recurring schedule (status, schedule, next run, topics). Costs no credits.',
  input: z.object({}).strict(),
  confirm: 'never',
  handler: async (ctx) => {
    const rules = await listAutopilotRules(ctx);
    return { data: { rules: rules.map(ruleView) }, links: [autopilotLink(ctx.language)] };
  },
});

// ─── save_autopilot_rule ─────────────────────────────────────────────────────

const optionalFields = Object.fromEntries(
  Object.entries(autopilotRuleFields).map(([k, v]) => [k, v.optional()]),
) as { [K in keyof typeof autopilotRuleFields]: z.ZodOptional<(typeof autopilotRuleFields)[K]> };

const saveAutopilotRuleTool = defineTool({
  name: 'save_autopilot_rule',
  title: { es: 'Guardar regla de autopilot', en: 'Save autopilot rule' },
  kind: 'publish',
  roles: ['owner', 'admin'],
  description:
    'Creates (no id) or updates (with id) an autopilot rule of the brand. Use status "paused" / "active" to pause or ' +
    'resume it. To create, name, channel and social_account_ids are required (active accounts of this brand from ' +
    'list_social_accounts); frequency defaults to weekly, time_of_day to 09:00, timezone to UTC — ask the user for ' +
    'their time zone. Every run generates one post (1 AI credit only when run manually) and schedules it. ' +
    'Always requires user confirmation. Costs no credits itself.',
  input: z.object({
    id: z.string().uuid().optional().describe('Existing rule to update. Omit to create a new one.'),
    ...optionalFields,
    status: z.enum(['active', 'paused']).optional(),
  }).strict(),
  confirm: 'always',
  describe: async (ctx, input) => {
    const current = input.id ? await getAutopilotRule(ctx, input.id) : null;
    return {
      name: input.name ?? current?.name ?? null,
      new_status: input.status ?? null,
      channel: input.channel ?? null,
      frequency: input.frequency ?? null,
      when: input.time_of_day ? `${input.time_of_day} ${input.timezone ?? current?.timezone ?? 'UTC'}` : null,
      accounts: input.social_account_ids?.length ?? null,
      topic: input.topic_hints?.slice(0, 3).join(' · ') ?? null,
    };
  },
  // Si alguien edita la regla entre la tarjeta y el clic, no se guarda encima.
  snapshot: async (ctx, input) => (input.id ? (await getAutopilotRule(ctx, input.id)).updated_at : null),
  handler: async (ctx, input) => {
    const { id, ...fields } = input;
    let rule: AutopilotRuleRow;
    if (id) {
      rule = await updateAutopilotRule(ctx, id, fields);
    } else {
      if (!fields.name || !fields.channel || !fields.social_account_ids) {
        throw new ServiceError(
          'invalid_input',
          422,
          msg(ctx.language, 'Para crear una regla hacen falta name, channel y social_account_ids',
            'name, channel and social_account_ids are required to create a rule'),
        );
      }
      if (fields.status) {
        throw new ServiceError('invalid_input', 422, msg(ctx.language, 'Una regla nueva empieza activa', 'A new rule starts active'));
      }
      rule = await createAutopilotRule(ctx, fields);
    }
    return { data: { rule: ruleView(rule) }, links: [autopilotLink(ctx.language)], dataChanged: ['autopilot'] };
  },
});

// ─── delete_autopilot_rule ───────────────────────────────────────────────────

const deleteAutopilotRuleTool = defineTool({
  name: 'delete_autopilot_rule',
  title: { es: 'Borrar regla de autopilot', en: 'Delete autopilot rule' },
  kind: 'write',
  roles: ['owner', 'admin'],
  description:
    'Deletes an autopilot rule of the brand. Posts it already scheduled are not cancelled (use ' +
    'list_scheduled_posts / cancel_scheduled_post). To stop it temporarily, pause it instead. Always requires user ' +
    'confirmation. Costs no credits.',
  input: z.object({ rule_id: z.string().uuid() }).strict(),
  confirm: 'always',
  describe: async (ctx, input) => {
    const rule = await getAutopilotRule(ctx, input.rule_id);
    return { name: rule.name, status: rule.status };
  },
  handler: async (ctx, input) => {
    await deleteAutopilotRule(ctx, input.rule_id);
    return { data: { deleted: input.rule_id }, links: [autopilotLink(ctx.language)], dataChanged: ['autopilot'] };
  },
});

// ─── run_autopilot_now ───────────────────────────────────────────────────────

const runAutopilotNowTool = defineTool({
  name: 'run_autopilot_now',
  title: { es: 'Ejecutar autopilot ahora', en: 'Run autopilot now' },
  kind: 'publish',
  roles: ['owner', 'admin'],
  description:
    `Runs active autopilot rules of the brand right now (at most ${MAX_MANUAL_RUN}): each one generates a post with AI ` +
    "and schedules it on its accounts for the rule's next slot, then advances the schedule. Costs 1 AI credit per " +
    'rule (refunded if the run fails). Always requires user confirmation.',
  input: z.object({
    rule_ids: z.array(z.string().uuid()).min(1).max(MAX_MANUAL_RUN),
  }).strict(),
  confirm: 'always',
  estimateCredits: (input) => input.rule_ids.length,
  describe: async (ctx, input) => {
    const names: string[] = [];
    for (const id of input.rule_ids) names.push((await getAutopilotRule(ctx, id)).name);
    return { title: names.join(' · ') };
  },
  handler: async (ctx, input) => {
    const summary = await runAutopilotNow(ctx, input.rule_ids, 'tool:run_autopilot_now');
    return {
      data: summary,
      links: [
        autopilotLink(ctx.language),
        { label: msg(ctx.language, 'Ver calendario', 'Open calendar'), href: buildDashboardHref(ctx.language, 'content_calendar') },
      ],
      dataChanged: ['autopilot', 'content', 'scheduled'],
    };
  },
});

export const autopilotTools = [
  listAutopilotRulesTool,
  saveAutopilotRuleTool,
  deleteAutopilotRuleTool,
  runAutopilotNowTool,
];
