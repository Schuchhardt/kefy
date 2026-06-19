import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import type { Frequency } from '@/types/automations';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const VALID_CHANNELS  = ['linkedin','instagram','facebook','twitter','tiktok','threads','generic'] as const;
const VALID_MODELS    = ['claude', 'gpt'] as const;
const VALID_FREQ      = ['daily', 'weekly', 'biweekly', 'monthly'] as const;

/** Compute the next run timestamp based on a rule's schedule. */
export function computeNextRun(
  frequency: Frequency,
  dayOfWeek: number | null,
  timeOfDay: string, // "HH:MM"
  timezone: string,
  after: Date = new Date(),
): Date {
  // Build a target date using Intl to respect the rule's timezone
  const [hh, mm] = timeOfDay.split(':').map(Number);

  const tzNow = new Date(
    new Date(after).toLocaleString('en-US', { timeZone: timezone }),
  );

  const candidate = new Date(after);
  candidate.setHours(hh, mm ?? 0, 0, 0);

  // Advance past "now" first
  if (candidate <= after) {
    if (frequency === 'daily') {
      candidate.setDate(candidate.getDate() + 1);
    } else {
      candidate.setDate(candidate.getDate() + 7);
    }
  }

  if (frequency === 'weekly' || frequency === 'biweekly') {
    const targetDay = dayOfWeek ?? 1; // Monday default
    while (candidate.getDay() !== targetDay) {
      candidate.setDate(candidate.getDate() + 1);
    }
    if (frequency === 'biweekly' && candidate <= after) {
      candidate.setDate(candidate.getDate() + 14);
    }
  } else if (frequency === 'monthly') {
    // Same day next month
    const next = new Date(tzNow);
    next.setMonth(next.getMonth() + 1);
    next.setHours(hh, mm ?? 0, 0, 0);
    return next;
  }

  return candidate;
}

function validateRuleInput(input: Record<string, unknown>) {
  const errors: string[] = [];

  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    errors.push('name is required');
  }
  if (!VALID_CHANNELS.includes(input.channel as typeof VALID_CHANNELS[number])) {
    errors.push(`channel must be one of: ${VALID_CHANNELS.join(', ')}`);
  }
  if (!Array.isArray(input.social_account_ids)) {
    errors.push('social_account_ids must be an array');
  }
  if (input.frequency && !VALID_FREQ.includes(input.frequency as Frequency)) {
    errors.push(`frequency must be one of: ${VALID_FREQ.join(', ')}`);
  }
  if (input.ai_model && !VALID_MODELS.includes(input.ai_model as typeof VALID_MODELS[number])) {
    errors.push(`ai_model must be one of: ${VALID_MODELS.join(', ')}`);
  }
  if (input.day_of_week !== undefined && input.day_of_week !== null) {
    const d = Number(input.day_of_week);
    if (!Number.isInteger(d) || d < 0 || d > 6) errors.push('day_of_week must be 0-6');
  }

  return errors;
}

// ─── GET /api/autopilot/rules ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const db = createSupabaseServer();

  const { data, error } = await db
    .from('kefy_autopilot_rules')
    .select('*')
    .eq('brand_id', brand.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('autopilot rules list error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
  }

  const res = NextResponse.json({ data });
  if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
  return res;
}

// ─── POST /api/autopilot/rules ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const errors = validateRuleInput(input);
  if (errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 422 });

  const frequency  = (input.frequency ?? 'weekly') as Frequency;
  const dayOfWeek  = input.day_of_week != null ? Number(input.day_of_week) : null;
  const timeOfDay  = typeof input.time_of_day === 'string' ? input.time_of_day : '09:00';
  const timezone   = typeof input.timezone    === 'string' ? input.timezone    : 'UTC';
  const nextRunAt  = computeNextRun(frequency, dayOfWeek, timeOfDay, timezone);

  const db = createSupabaseServer();

  const { data, error } = await db
    .from('kefy_autopilot_rules')
    .insert({
      org_id:             auth.orgId,
      created_by:         auth.userId,
      name:               (input.name as string).trim(),
      channel:            input.channel as string,
      social_account_ids: input.social_account_ids as string[],
      frequency,
      day_of_week:        dayOfWeek,
      time_of_day:        timeOfDay,
      timezone,
      ai_model:           (input.ai_model ?? 'claude') as string,
      tone:               typeof input.tone === 'string' ? input.tone : null,
      topic_hints:        Array.isArray(input.topic_hints) ? input.topic_hints : [],
      status:             'active',
      next_run_at:        nextRunAt.toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('autopilot rule create error:', error.message);
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
