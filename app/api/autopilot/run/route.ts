import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { generateContentText } from '@/lib/ai';
import { publishPost } from '@/lib/zernio';
import { computeNextRun } from '../rules/route';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ─── /api/autopilot/run ───────────────────────────────────────────────────────
// Evaluate active autopilot rules whose next_run_at <= now and execute them.
//
// Invocation modes:
//   - GET  (Vercel Cron): header `Authorization: Bearer ${CRON_SECRET}`.
//     Vercel sets this automatically for cron schedules defined in vercel.json.
//     Falls back to AUTOPILOT_CRON_SECRET if CRON_SECRET is not set.
//   - POST (manual/webhook): authenticated user (owner/admin) OR
//     body `{ cron_secret: string }` matching AUTOPILOT_CRON_SECRET.
//
// POST body (optional):
//   { rule_ids?: string[] }   — run only specific rules (org-scoped)
//   { cron_secret?: string }  — allow unauthenticated cron invocation

function isVercelCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.AUTOPILOT_CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isVercelCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runAutopilot({ orgId: null, ruleIds: null });
}

export async function POST(req: NextRequest) {
  // Support both authenticated users and cron calls via shared secret
  const cronSecret = process.env.AUTOPILOT_CRON_SECRET;
  let orgId: string | null = null;

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* no body */ }

  const isCronBody = cronSecret && typeof body.cron_secret === 'string' && body.cron_secret === cronSecret;
  const isCron = isCronBody || isVercelCronAuthorized(req);

  if (!isCron) {
    const auth = await getAuthFromRequest(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.role !== 'owner' && auth.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    orgId = auth.orgId;
  }

  const ruleIds = Array.isArray(body.rule_ids)
    ? (body.rule_ids as unknown[]).filter((id): id is string => typeof id === 'string')
    : null;

  return runAutopilot({ orgId, ruleIds });
}

async function runAutopilot(opts: { orgId: string | null; ruleIds: string[] | null }) {
  const { orgId, ruleIds } = opts;
  const db = createSupabaseServer();
  const now = new Date();

  // Build rules query — due rules only
  let rulesQuery = db
    .from('kefy_autopilot_rules')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_at', now.toISOString());

  if (orgId)               rulesQuery = rulesQuery.eq('org_id', orgId);
  if (ruleIds?.length)     rulesQuery = rulesQuery.in('id', ruleIds);

  const { data: rules, error: rulesError } = await rulesQuery;

  if (rulesError) {
    console.error('autopilot/run rules fetch error:', rulesError.message);
    return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
  }

  if (!rules || rules.length === 0) {
    return NextResponse.json({ executed: 0, results: [] });
  }

  type RunResult = {
    rule_id: string;
    rule_name: string;
    status: 'success' | 'failed';
    content_item_id?: string;
    scheduled_post_ids?: string[];
    error?: string;
  };

  const results: RunResult[] = [];

  for (const rule of rules) {
    try {
      // 1. Fetch brand kit for context
      const { data: brandKit } = await db
        .from('kefy_brand_kits')
        .select('tone, tagline, industry, notes')
        .eq('org_id', rule.org_id)
        .maybeSingle();

      // 2. Generate content
      const topicHints: string[] = Array.isArray(rule.topic_hints) ? rule.topic_hints : [];
      const topicHint = topicHints.length > 0
        ? topicHints[Math.floor(Math.random() * topicHints.length)]
        : undefined;

      const generated = await generateContentText({
        channel:   rule.channel,
        model:     rule.ai_model === 'gpt' ? 'gpt' : 'claude',
        tone:      rule.tone ? [rule.tone] : (brandKit?.tone ?? undefined),
        topic:     topicHint ?? rule.name,
        tagline:   brandKit?.tagline ?? undefined,
        extraCtx:  brandKit?.notes ?? undefined,
      });

      // 3. Create content item (auto-approved for autopilot)
      const { data: contentItem, error: contentError } = await db
        .from('kefy_content_items')
        .insert({
          org_id:    rule.org_id,
          channel:   rule.channel,
          body:      generated.body,
          hashtags:  generated.hashtags,
          status:    'approved',
          metadata:  { autopilot: true, rule_id: rule.id, model: rule.ai_model },
          created_by: null,
        })
        .select('id')
        .single();

      if (contentError || !contentItem) throw new Error(contentError?.message ?? 'Failed to create content item');

      // 4. Fetch the active social accounts for this rule
      const { data: accounts } = await db
        .from('kefy_social_accounts')
        .select('id, zernio_account_id, platform')
        .in('id', rule.social_account_ids as string[])
        .eq('org_id', rule.org_id)
        .eq('status', 'active');

      const scheduledPostIds: string[] = [];

      for (const account of accounts ?? []) {
        try {
          const zResult = await publishPost({
            account_id:   account.zernio_account_id!,
            text:         generated.body,
            hashtags:     generated.hashtags,
            scheduled_at: rule.next_run_at,
          });

          const { data: sp } = await db
            .from('kefy_scheduled_posts')
            .insert({
              org_id:            rule.org_id,
              content_item_id:   contentItem.id,
              social_account_id: account.id,
              scheduled_at:      rule.next_run_at,
              zernio_post_id:    zResult.post_id,
              platform_post_id:  zResult.platform_post_id ?? null,
              status:            'scheduled',
              created_by:        null,
            })
            .select('id')
            .single();

          if (sp) scheduledPostIds.push(sp.id);
        } catch (accountErr) {
          console.warn(`Autopilot: publish failed for account ${account.id}:`, accountErr);
        }
      }

      // 5. Update content item to scheduled
      await db
        .from('kefy_content_items')
        .update({ status: 'scheduled' })
        .eq('id', contentItem.id);

      // 6. Compute next run and update rule
      const nextRun = computeNextRun(
        rule.frequency,
        rule.day_of_week ?? null,
        rule.time_of_day,
        rule.timezone,
        now,
      );

      await db
        .from('kefy_autopilot_rules')
        .update({ last_run_at: now.toISOString(), next_run_at: nextRun.toISOString() })
        .eq('id', rule.id);

      // 7. Record audit run
      await db.from('kefy_autopilot_runs').insert({
        rule_id:            rule.id,
        org_id:             rule.org_id,
        content_item_id:    contentItem.id,
        scheduled_post_ids: scheduledPostIds,
        status:             'success',
      });

      results.push({
        rule_id:             rule.id,
        rule_name:           rule.name,
        status:              'success',
        content_item_id:     contentItem.id,
        scheduled_post_ids:  scheduledPostIds,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Autopilot rule ${rule.id} failed:`, msg);

      await db.from('kefy_autopilot_runs').insert({
        rule_id:       rule.id,
        org_id:        rule.org_id,
        status:        'failed',
        error_message: msg,
      });

      results.push({ rule_id: rule.id, rule_name: rule.name, status: 'failed', error: msg });
    }
  }

  const executed = results.filter((r) => r.status === 'success').length;
  const failed   = results.filter((r) => r.status === 'failed').length;

  return NextResponse.json({ executed, failed, results }, {
    status: failed > 0 && executed === 0 ? 502 : 200,
  });
}
