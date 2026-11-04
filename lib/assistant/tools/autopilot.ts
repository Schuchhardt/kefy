// ─── Herramientas del asistente: autopilot ───────────────────────────────────
//
// list_autopilot_rules, save_autopilot_rule, delete_autopilot_rule y
// run_autopilot_now. Llaman a lib/services/autopilot.ts, el mismo servicio que
// /api/autopilot/**.
//
// Una regla activa genera y programa piezas sola en las cuentas de la marca:
// crearla, editarla o reanudarla es 'publish' (la API key necesita ese scope y
// el chat siempre pide confirmación). Borrarla es 'write'. Como en la UI, solo
// owner/admin las gestionan.
//
// Cada regla dice qué genera (`format`, la mezcla semanal `weekly_formats` y
// la story derivada `also_story`) y cuánto cuesta (`cost`): list y la tarjeta
// de confirmación lo muestran, sobre todo por los reels (~55 créditos).

import { z } from 'zod';
import { defineTool } from '@/lib/assistant/registry';
import { buildDashboardHref } from '@/lib/assistant/links';
import type { ToolLink } from '@/lib/assistant/types';
import { ServiceError, msg } from '@/lib/services/errors';
import { STORY_DELAY_DEFAULT_MINUTES, estimateFormatCredits, type RuleCost } from '@/lib/autopilot-formats';
import {
  MAX_MANUAL_RUN, autopilotRuleCostFor, autopilotRuleFields, createAutopilotRule, deleteAutopilotRule,
  estimateAutopilotRuleCredits, getAutopilotRule, listAutopilotRules, previewAutopilotRuleCost, runAutopilotNow,
  updateAutopilotRule, type AutopilotLastRun, type AutopilotRuleRow,
} from '@/lib/services/autopilot';

const FORMAT_LABELS = {
  es: { post: 'Post con imagen', carousel: 'Carrusel', story: 'Historia', reel: 'Reel', auto: 'Automático', skip: 'No publica' },
  en: { post: 'Post with image', carousel: 'Carousel', story: 'Story', reel: 'Reel', auto: 'Automatic', skip: 'No post' },
} as const;
const DAY_LABELS = {
  es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
} as const;

/** «Jue: Reel · Dom: No publica» para la tarjeta de confirmación. */
function weeklyLabel(lang: 'es' | 'en', weekly: Record<string, string | undefined> | null | undefined): string | null {
  if (!weekly) return null;
  const parts = Object.entries(weekly)
    .filter(([, v]) => !!v)
    .map(([d, v]) => `${DAY_LABELS[lang][Number(d)]}: ${FORMAT_LABELS[lang][v as keyof (typeof FORMAT_LABELS)['es']] ?? v}`);
  return parts.length ? parts.join(' · ') : null;
}

function delayLabel(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return minutes > 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

function autopilotLink(lang: 'es' | 'en'): ToolLink {
  return { label: msg(lang, 'Abrir autopilot', 'Open autopilot'), href: buildDashboardHref(lang, 'automations') };
}

function lastRunView(run: AutopilotLastRun | null) {
  if (!run) return null;
  return {
    status: run.status,
    ran_at: run.ran_at,
    format: run.format,
    content_item_id: run.content_item_id,
    scheduled_post_ids: run.scheduled_post_ids,
    error: run.error_message,
    credits_estimated: run.credits_estimated,
    // Solo en reels: get_video_status(content_item_id) da el avance paso a paso.
    video: run.format === 'reel' || run.video_status
      ? { status: run.video_status, attempts: run.video_attempts }
      : null,
    story: run.story_status ? { status: run.story_status, error: run.story_error } : null,
  };
}

function ruleView(r: AutopilotRuleRow, extra: { last_run?: AutopilotLastRun | null; cost?: RuleCost } = {}) {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    paused_reason: r.paused_reason,
    channel: r.channel,
    social_account_ids: r.social_account_ids,
    format: r.format ?? 'auto',
    weekly_formats: r.weekly_formats,
    also_story: r.also_story,
    story_delay_minutes: r.story_delay_minutes,
    frequency: r.frequency,
    day_of_week: r.day_of_week,
    time_of_day: r.time_of_day,
    timezone: r.timezone,
    ai_model: r.ai_model,
    tone: r.tone,
    topic_hints: r.topic_hints,
    next_run_at: r.next_run_at,
    last_run_at: r.last_run_at,
    ...(extra.cost ? { cost: extra.cost } : {}),
    ...('last_run' in extra ? { last_run: lastRunView(extra.last_run ?? null) } : {}),
  };
}

// ─── list_autopilot_rules ────────────────────────────────────────────────────

const listAutopilotRulesTool = defineTool({
  name: 'list_autopilot_rules',
  title: { es: 'Ver reglas de autopilot', en: 'List autopilot rules' },
  kind: 'read',
  description:
    "Lists the brand's autopilot rules: each one generates a piece with AI (format: post, carousel, story, reel or " +
    'auto; optional weekly mix and derived story) and schedules it on the given accounts on a recurring schedule. ' +
    'For each rule: status (paused_reason "credits_exhausted" = paused by the system, it resumes when credits ' +
    'renew), schedule, next run, cost in credits (per run min/max, by format and per month) and last_run with its ' +
    'status, error, video status of a reel (producing / published / failed, attempts) and derived story status. ' +
    'Use get_video_status with last_run.content_item_id for the step-by-step progress of a reel. Costs no credits.',
  input: z.object({}).strict(),
  confirm: 'never',
  handler: async (ctx) => {
    const rules = await listAutopilotRules(ctx);
    return {
      data: { rules: rules.map((r) => ruleView(r, { last_run: r.last_run, cost: r.cost })) },
      links: [autopilotLink(ctx.language)],
    };
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
    'their time zone. `format` picks what each run generates (post ~4 credits, carousel ~16, story ~4, reel ~55 ' +
    'and published once its video is ready); `weekly_formats` mixes formats in a daily rule (e.g. format "post" + ' +
    '{"4": "reel"} = post every day, reel on Thursdays); `also_story` adds a derived story (+4 credits) ' +
    '`story_delay_minutes` after each piece (default 120). Runs cost those credits; when they run out the rule is ' +
    'paused and resumes when credits renew. The confirmation shows the cost per run and per month. Always requires ' +
    'user confirmation. Costs no credits itself.',
  input: z.object({
    id: z.string().uuid().optional().describe('Existing rule to update. Omit to create a new one.'),
    ...optionalFields,
    status: z.enum(['active', 'paused']).optional(),
  }).strict(),
  confirm: 'always',
  describe: async (ctx, input) => {
    const current = input.id ? await getAutopilotRule(ctx, input.id) : null;
    const cost = await previewAutopilotRuleCost(ctx, {
      name: input.name ?? current?.name ?? '',
      frequency: input.frequency ?? current?.frequency ?? 'weekly',
      format: input.format !== undefined ? input.format : current?.format ?? null,
      weekly_formats: input.weekly_formats !== undefined ? input.weekly_formats : current?.weekly_formats ?? null,
      also_story: input.also_story ?? current?.also_story ?? false,
      topic_hints: input.topic_hints ?? current?.topic_hints ?? [],
      social_account_ids: input.social_account_ids ?? current?.social_account_ids ?? [],
      timezone: input.timezone ?? current?.timezone,
    }).catch(() => null);
    const alsoStory = input.also_story ?? current?.also_story ?? false;
    const lang = ctx.language;
    return {
      name: input.name ?? current?.name ?? null,
      new_status: input.status ?? null,
      channel: input.channel ?? null,
      frequency: input.frequency ?? null,
      when: input.time_of_day ? `${input.time_of_day} ${input.timezone ?? current?.timezone ?? 'UTC'}` : null,
      accounts: input.social_account_ids?.length ?? null,
      topic: input.topic_hints?.slice(0, 3).join(' · ') ?? null,
      format: input.format !== undefined ? FORMAT_LABELS[lang][input.format ?? 'auto'] : null,
      weekly_formats: weeklyLabel(lang, input.weekly_formats),
      also_story: input.also_story ?? null,
      story_delay_minutes: alsoStory
        ? delayLabel(input.story_delay_minutes ?? current?.story_delay_minutes ?? STORY_DELAY_DEFAULT_MINUTES)
        : null,
      credits_per_run: cost
        ? (cost.per_run_min === cost.per_run_max ? `${cost.per_run_max}` : `${cost.per_run_min}–${cost.per_run_max}`)
        : null,
      credits_per_month: cost?.per_month ?? null,
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
    const cost = await autopilotRuleCostFor(rule);
    return { data: { rule: ruleView(rule, { cost }) }, links: [autopilotLink(ctx.language)], dataChanged: ['autopilot'] };
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
  input: z.object({ rule_id: z.string().uuid().describe('Autopilot rule of this brand (from list_autopilot_rules).') }).strict(),
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
    `Runs active autopilot rules of the brand right now (at most ${MAX_MANUAL_RUN}): each one generates a piece with ` +
    "its media in the rule's format for its next slot (weekly mix included; with format auto, the picked topic's " +
    'tag decides: [POST], [CARRUSEL n slides], [STORY], [REEL 30s]; untagged = reel for TikTok/YouTube-only rules, ' +
    'post otherwise), schedules it on its accounts for that slot (a reel, once its video is ready; a story only on ' +
    'Instagram/Facebook/Snapchat), adds the derived story if also_story, and advances the schedule. Costs the ' +
    'credits of that format (~4 for a post or story, up to ~60 for a reel, +4 for a derived story). Always requires ' +
    'user confirmation.',
  input: z.object({
    rule_ids: z.array(z.string().uuid()).min(1).max(MAX_MANUAL_RUN)
      .describe('Autopilot rules of this brand to run (from list_autopilot_rules).'),
  }).strict(),
  confirm: 'always',
  estimateCredits: (input, preview) =>
    typeof preview.max_credits === 'number' ? preview.max_credits : input.rule_ids.length * estimateFormatCredits('post'),
  describe: async (ctx, input) => {
    const names: string[] = [];
    let maxCredits = 0;
    for (const id of input.rule_ids) {
      const rule = await getAutopilotRule(ctx, id);
      names.push(rule.name);
      maxCredits += await estimateAutopilotRuleCredits(rule);
    }
    return { title: names.join(' · '), max_credits: maxCredits };
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
