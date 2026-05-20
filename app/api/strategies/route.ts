import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';

// GET /api/strategies
// Public — returns the full objectives + industries catalog for the selector UI
export async function GET() {
  const supabase = createSupabaseServer();

  const [objectivesRes, industriesRes] = await Promise.all([
    supabase
      .from('kefy_content_objectives')
      .select('id, slug, name_es, name_en, desc_es, desc_en, icon, sort_order')
      .order('sort_order', { ascending: true }),
    supabase
      .from('kefy_content_industries')
      .select('id, slug, name_es, name_en, icon, desc_es, sort_order')
      .order('sort_order', { ascending: true }),
  ]);

  if (objectivesRes.error) {
    console.error('[api/strategies] objectives error:', objectivesRes.error.message);
    return NextResponse.json({ error: 'Failed to load objectives' }, { status: 500 });
  }

  if (industriesRes.error) {
    console.error('[api/strategies] industries error:', industriesRes.error.message);
    return NextResponse.json({ error: 'Failed to load industries' }, { status: 500 });
  }

  return NextResponse.json({
    objectives: objectivesRes.data ?? [],
    industries: industriesRes.data ?? [],
  });
}
