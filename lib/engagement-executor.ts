// lib/engagement-executor.ts
// Evaluates active engagement rules for an org and executes matching actions
// when social events arrive (comments, reviews, DMs).

import { createSupabaseServer } from '@/lib/supabase';
import { generateContentText } from '@/lib/ai';
import { replyToComment, sendMessage } from '@/lib/zernio';

type DB = ReturnType<typeof createSupabaseServer>;

export type EngagementEvent =
  | {
      type: 'new_comment';
      socialAccountId: string;
      zernioAccountId: string;
      commentId: string;
      postId: string;
      body: string;
      platform: string;
      authorId: string;
    }
  | {
      type: 'new_dm';
      socialAccountId: string;
      zernioAccountId: string;
      threadId: string;
      body: string;
      platform: string;
      senderId: string;
    };

type EngagementRule = {
  id: string;
  org_id: string;
  trigger_type: string;
  condition_platform: string | null;
  condition_keyword: string | null;
  condition_rating: number | null;
  action_type: string;
  action_template: string;
  ai_context: string | null;
  delay_minutes: number;
};

function matchesTrigger(rule: EngagementRule, event: EngagementEvent): boolean {
  const t = rule.trigger_type;
  if (event.type === 'new_comment') {
    if (t === 'new_comment') return true;
    if (t === 'comment_contains_keyword' && rule.condition_keyword) {
      return event.body.toLowerCase().includes(rule.condition_keyword.toLowerCase());
    }
    return false;
  }
  if (event.type === 'new_dm') {
    if (t === 'new_dm') return true;
    if (t === 'dm_contains_keyword' && rule.condition_keyword) {
      return event.body.toLowerCase().includes(rule.condition_keyword.toLowerCase());
    }
    return false;
  }
  return false;
}

function matchesConditions(rule: EngagementRule, event: EngagementEvent): boolean {
  if (rule.condition_platform && rule.condition_platform !== event.platform) return false;
  if (
    rule.condition_keyword &&
    rule.trigger_type !== 'comment_contains_keyword' &&
    rule.trigger_type !== 'dm_contains_keyword'
  ) {
    const body = 'body' in event ? (event.body ?? '') : '';
    if (!body.toLowerCase().includes(rule.condition_keyword.toLowerCase())) return false;
  }
  return true;
}

async function generateAIReply(
  db: DB,
  orgId: string,
  rule: EngagementRule,
  contextBody: string,
): Promise<string> {
  const { data: brandKit } = await db
    .from('kefy_brand_kits')
    .select('tone, tagline, industry, notes, name')
    .eq('org_id', orgId)
    .maybeSingle();

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
  orgId: string,
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
      const text = await generateAIReply(db, orgId, rule, event.body);
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
      const text = await generateAIReply(db, orgId, rule, event.body);
      await sendMessage(event.zernioAccountId, event.threadId, text);
      break;
    }

    default:
      console.warn(`[Engagement] unknown action_type "${action_type}" for rule ${rule.id}`);
  }
}

export async function executeEngagementRules(
  db: DB,
  orgId: string,
  event: EngagementEvent,
): Promise<void> {
  const { data: rules, error } = await db
    .from('kefy_engagement_rules')
    .select(
      'id, org_id, trigger_type, condition_platform, condition_keyword, condition_rating, action_type, action_template, ai_context, delay_minutes',
    )
    .eq('org_id', orgId)
    .eq('is_active', true);

  if (error) {
    console.error('[Engagement] failed to fetch rules:', error.message);
    return;
  }

  if (!rules?.length) return;

  for (const rule of rules as EngagementRule[]) {
    if (!matchesTrigger(rule, event)) continue;
    if (!matchesConditions(rule, event)) continue;

    // Rules with a delay are not yet executed inline (future: queue them)
    if (rule.delay_minutes > 0) {
      console.log(`[Engagement] rule ${rule.id} has delay_minutes=${rule.delay_minutes} — skipping (not yet implemented)`);
      continue;
    }

    try {
      await executeAction(db, orgId, rule, event);

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
    } catch (err) {
      console.error(`[Engagement] rule ${rule.id} execution failed:`, err);
    }
  }
}
