import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { computeNextRun } from '../route';
import type { Frequency } from '@/types/automations';

const VALID_FREQ = ['daily', 'weekly', 'biweekly', 'monthly'] as const;

// ─── GET /api/autopilot/rules/[ruleId] ────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ruleId } = await params;
  const db = createSupabaseServer();

  const { data, error } = await db
    .from('kefy_autopilot_rules')
    .select('*, kefy_autopilot_runs ( id, status, ran_at, content_item_id )')
    .eq('id', ruleId)
    .eq('org_id', auth.orgId)
    .order('ran_at', { referencedTable: 'kefy_autopilot_runs', ascending: false })
    .limit(10, { referencedTable: 'kefy_autopilot_runs' })
    .maybeSingle();

  if (error) {
    console.error('autopilot rule get error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch rule' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

  return NextResponse.json({ data });
}

// ─── PATCH /api/autopilot/rules/[ruleId] ─────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { ruleId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  const db = createSupabaseServer();

  // Verify ownership
  const { data: existing } = await db
    .from('kefy_autopilot_rules')
    .select('id, frequency, day_of_week, time_of_day, timezone, status')
    .eq('id', ruleId)
    .eq('org_id', auth.orgId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if (typeof input.name === 'string' && input.name.trim()) patch.name = input.name.trim();
  if (typeof input.channel === 'string')        patch.channel        = input.channel;
  if (Array.isArray(input.social_account_ids))  patch.social_account_ids = input.social_account_ids;
  if (typeof input.ai_model === 'string')        patch.ai_model       = input.ai_model;
  if (typeof input.tone === 'string')            patch.tone           = input.tone;
  if (Array.isArray(input.topic_hints))          patch.topic_hints    = input.topic_hints;

  if (typeof input.status === 'string' && ['active', 'paused'].includes(input.status)) {
    patch.status = input.status;
  }

  // If schedule-related fields changed, recompute next_run_at
  const scheduleChanged =
    input.frequency !== undefined ||
    input.day_of_week !== undefined ||
    input.time_of_day !== undefined ||
    input.timezone !== undefined;

  if (scheduleChanged) {
    const frequency = (input.frequency ?? existing.frequency) as Frequency;
    const dayOfWeek = input.day_of_week != null
      ? Number(input.day_of_week)
      : existing.day_of_week;
    const timeOfDay = (input.time_of_day ?? existing.time_of_day) as string;
    const timezone  = (input.timezone   ?? existing.timezone)     as string;

    if (VALID_FREQ.includes(frequency)) patch.frequency = frequency;
    if (dayOfWeek !== null && dayOfWeek !== undefined) patch.day_of_week = dayOfWeek;
    patch.time_of_day = timeOfDay;
    patch.timezone    = timezone;
    patch.next_run_at = computeNextRun(frequency, dayOfWeek ?? null, timeOfDay, timezone).toISOString();
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 422 });
  }

  const { data, error } = await db
    .from('kefy_autopilot_rules')
    .update(patch)
    .eq('id', ruleId)
    .select()
    .single();

  if (error) {
    console.error('autopilot rule update error:', error.message);
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// ─── DELETE /api/autopilot/rules/[ruleId] ────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { ruleId } = await params;
  const db = createSupabaseServer();

  const { error } = await db
    .from('kefy_autopilot_rules')
    .delete()
    .eq('id', ruleId)
    .eq('org_id', auth.orgId);

  if (error) {
    console.error('autopilot rule delete error:', error.message);
    return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
