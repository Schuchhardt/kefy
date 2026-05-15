import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createSupabaseServer();

  const { data: user } = await db
    .from('users')
    .select('id, email, name, created_at')
    .eq('id', auth.userId)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { data: org } = await db
    .from('organizations')
    .select('id, name, slug, plan')
    .eq('id', auth.orgId)
    .maybeSingle();

  return NextResponse.json({
    user,
    org,
    role: auth.role,
    plan: auth.plan,
  });
}
