import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { generateLibraryContent } from '@/lib/ai';
import { generateContentImage } from '@/lib/ai';
import { uploadBase64Image } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ─── /api/content-library/generate ───────────────────────────────────────────
// Daily cron job that generates new content library items for each industry.
//
// Auth: Vercel Cron `Authorization: Bearer ${CRON_SECRET}` or POST with
// body `{ cron_secret }` matching AUTOPILOT_CRON_SECRET.
//
// For each of the 7 industries, generates 1 content item (text + image) and
// inserts it into kefy_content_library. Processes industries sequentially to
// respect API rate limits. If image generation fails, the item is still saved
// without an image.

const CONTENT_TYPES: Array<'post' | 'carousel' | 'reel' | 'story'> = ['post', 'carousel', 'reel', 'story'];

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
  return runLibraryGeneration();
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.AUTOPILOT_CRON_SECRET;
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* no body */ }

  const isCronBody = cronSecret && typeof body.cron_secret === 'string' && body.cron_secret === cronSecret;
  const isCron = isCronBody || isVercelCronAuthorized(req);

  if (!isCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return runLibraryGeneration();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLibraryGeneration() {
  const db = createSupabaseServer();

  // Load all industries
  const { data: industries, error: indError } = await db
    .from('kefy_content_industries')
    .select('id, slug, name_es, name_en')
    .order('sort_order', { ascending: true });

  if (indError || !industries?.length) {
    console.error('content-library/generate: failed to load industries:', indError?.message);
    return NextResponse.json({ error: 'Failed to load industries' }, { status: 500 });
  }

  type RunResult = {
    industry: string;
    status: 'success' | 'failed';
    item_id?: string;
    has_image?: boolean;
    error?: string;
  };

  const results: RunResult[] = [];

  for (const industry of industries) {
    try {
      // Check if we already generated for this industry today
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const { count } = await db
        .from('kefy_content_library')
        .select('id', { count: 'exact', head: true })
        .eq('industry_id', industry.id)
        .eq('source', 'cron_generated')
        .gte('created_at', todayStart.toISOString());

      if ((count ?? 0) > 0) {
        results.push({ industry: industry.slug, status: 'success', error: 'already generated today' });
        continue;
      }

      // Load recent topics to avoid duplicates
      const { data: recentItems } = await db
        .from('kefy_content_library')
        .select('title')
        .eq('industry_id', industry.id)
        .order('created_at', { ascending: false })
        .limit(10);

      const recentTopics = (recentItems ?? []).map((i) => i.title).filter(Boolean);

      // Pick a content type — rotate based on day of week to get variety
      const dayIndex = new Date().getDay();
      const contentType = CONTENT_TYPES[dayIndex % CONTENT_TYPES.length];

      // Generate text content
      const generated = await generateLibraryContent({
        industryName: industry.name_es,
        contentType,
        language: 'es',
        recentTopics,
      });

      // Try to generate an image
      let imageUrl: string | null = null;
      try {
        if (generated.imagePrompt) {
          const imageResult = await generateContentImage({
            prompt:  generated.imagePrompt,
            size:    '1024x1024',
            quality: 'medium',
          });
          imageUrl = await uploadBase64Image(
            imageResult.b64,
            'library',
            `${industry.slug}-${Date.now()}.jpeg`,
          );
        }
      } catch (imgErr) {
        console.warn(`content-library/generate: image failed for ${industry.slug}:`, imgErr);
      }

      // Insert into library
      const { data: item, error: insertErr } = await db
        .from('kefy_content_library')
        .insert({
          industry_id:  industry.id,
          content_type: generated.contentType,
          title:        generated.title,
          body:         generated.body,
          hashtags:     generated.hashtags,
          image_url:    imageUrl,
          image_prompt: generated.imagePrompt || null,
          source:       'cron_generated',
          language:     'es',
        })
        .select('id')
        .single();

      if (insertErr) throw new Error(insertErr.message);

      results.push({
        industry:  industry.slug,
        status:    'success',
        item_id:   item?.id,
        has_image: !!imageUrl,
      });

      // Rate-limit pause between industries
      await sleep(2000);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`content-library/generate: ${industry.slug} failed:`, msg);
      results.push({ industry: industry.slug, status: 'failed', error: msg });
    }
  }

  const generated = results.filter((r) => r.status === 'success' && r.item_id).length;
  const failed    = results.filter((r) => r.status === 'failed').length;

  return NextResponse.json({ generated, failed, results }, {
    status: failed > 0 && generated === 0 ? 502 : 200,
  });
}
