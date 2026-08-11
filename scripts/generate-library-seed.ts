/**
 * generate-library-seed.ts
 *
 * One-time bulk seed for kefy_content_library: tops up every industry to
 * ~30 items (spread across post/carousel/reel/story), text + image, using
 * the same generation pipeline as the daily cron (lib/ai.ts's
 * generateLibraryContent + generateContentImage).
 *
 * Safely re-runnable: for each industry+content_type it only generates
 * enough NEW items to reach TARGET_PER_TYPE, counting whatever already
 * exists in the DB (seed or cron-generated).
 *
 * Usage:
 *   npx tsx scripts/generate-library-seed.ts
 *
 * Env knobs (optional):
 *   DRY_RUN=1              — generate text only, skip image gen + DB insert
 *   ONLY_INDUSTRY=<slugs>  — restrict to a comma-separated list of industries
 *   TARGET_TOTAL=<n>       — items per industry instead of the default 30;
 *                            spread round-robin over post/carousel/reel/story
 *
 * Reads ANTHROPIC_API_KEY / OPENAI_API_KEY / SUPABASE_* from .env.local.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createSupabaseServer } from '@/lib/supabase';
import { generateLibraryContent, generateContentImage } from '@/lib/ai';
import { uploadBase64Image } from '@/lib/storage';

type ContentType = 'post' | 'carousel' | 'reel' | 'story';

const CONTENT_TYPES: ContentType[] = ['post', 'carousel', 'reel', 'story'];

// Spread `total` items round-robin across the four content types, so
// TARGET_TOTAL=30 gives the default 8/8/7/7 and TARGET_TOTAL=10 gives 3/3/2/2.
function targetsFor(total: number): Record<ContentType, number> {
  const out = { post: 0, carousel: 0, reel: 0, story: 0 };
  for (let i = 0; i < total; i++) out[CONTENT_TYPES[i % CONTENT_TYPES.length]]++;
  return out;
}

const TARGET_TOTAL = Math.max(1, Number(process.env.TARGET_TOTAL) || 30);
const TARGET_PER_TYPE = targetsFor(TARGET_TOTAL);

const LANGUAGE = 'es' as const;
const DRY_RUN = process.env.DRY_RUN === '1';
const ONLY_INDUSTRY = process.env.ONLY_INDUSTRY || null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const db = createSupabaseServer();

  const { data: industries, error } = await db
    .from('kefy_content_industries')
    .select('id, slug, name_es')
    .order('sort_order', { ascending: true });

  if (error || !industries?.length) {
    console.error('Failed to load industries:', error?.message);
    process.exit(1);
  }

  const onlySlugs = ONLY_INDUSTRY?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
  const targetIndustries = onlySlugs
    ? industries.filter((i) => onlySlugs.includes(i.slug))
    : industries;

  if (targetIndustries.length === 0) {
    console.error(`No industry matches slug "${ONLY_INDUSTRY}"`);
    process.exit(1);
  }

  if (DRY_RUN) console.log('*** DRY RUN — no images, no DB writes ***');

  let totalCreated = 0;
  let totalFailed = 0;

  for (const industry of targetIndustries) {
    console.log(`\n=== ${industry.slug} ===`);

    const { data: existingRows } = await db
      .from('kefy_content_library')
      .select('content_type, title')
      .eq('industry_id', industry.id)
      .eq('language', LANGUAGE);

    const recentTopics: string[] = (existingRows ?? []).map((r) => r.title);
    const existingByType: Partial<Record<ContentType, number>> = {};
    for (const row of existingRows ?? []) {
      const ct = row.content_type as ContentType;
      existingByType[ct] = (existingByType[ct] ?? 0) + 1;
    }

    for (const contentType of Object.keys(TARGET_PER_TYPE) as ContentType[]) {
      const have = existingByType[contentType] ?? 0;
      const need = TARGET_PER_TYPE[contentType] - have;

      if (need <= 0) {
        console.log(`  ${contentType}: already has ${have}/${TARGET_PER_TYPE[contentType]}, skipping`);
        continue;
      }

      for (let i = 0; i < need; i++) {
        try {
          const generated = await generateLibraryContent({
            industryName: industry.name_es,
            contentType,
            language: LANGUAGE,
            recentTopics: recentTopics.slice(-15),
          });

          let imageUrl: string | null = null;
          if (!DRY_RUN) {
            try {
              if (generated.imagePrompt) {
                const imageResult = await generateContentImage({
                  prompt: generated.imagePrompt,
                  size: '1024x1024',
                  quality: 'medium',
                });
                imageUrl = await uploadBase64Image(
                  imageResult.b64,
                  'library',
                  `${industry.slug}-${contentType}-${Date.now()}.jpeg`,
                );
              }
            } catch (imgErr) {
              console.warn('    image failed:', imgErr instanceof Error ? imgErr.message : imgErr);
            }

            const { error: insertErr } = await db
              .from('kefy_content_library')
              .insert({
                industry_id:  industry.id,
                content_type: generated.contentType,
                title:        generated.title,
                body:         generated.body,
                hashtags:     generated.hashtags,
                image_url:    imageUrl,
                image_prompt: generated.imagePrompt || null,
                source:       'seed',
                language:     LANGUAGE,
              });

            if (insertErr) throw new Error(insertErr.message || JSON.stringify(insertErr));
          }

          recentTopics.push(generated.title);
          totalCreated++;
          console.log(`  ✓ ${contentType}: "${generated.title}"${imageUrl ? '' : DRY_RUN ? '' : ' (no image)'}`);
        } catch (err) {
          totalFailed++;
          console.error(`  ✗ ${contentType} failed:`, err instanceof Error ? err.message : err);
        }

        // Rate-limit pause between items (Anthropic + OpenAI calls).
        await sleep(1500);
      }
    }
  }

  console.log(`\nDone. Created ${totalCreated} items, ${totalFailed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
