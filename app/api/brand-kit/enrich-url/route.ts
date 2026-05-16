import { NextRequest, NextResponse } from 'next/server';
import FirecrawlApp from '@mendable/firecrawl-js';
import { z } from 'zod';
import { getAuthFromRequest } from '@/lib/auth';
import type { BrandKit } from '@/lib/brand-kit';

const brandSchema = z.object({
  name:                z.string().nullable().optional(),
  tagline:             z.string().nullable().optional(),
  mission:             z.string().nullable().optional(),
  industry:            z.string().nullable().optional(),
  niche:               z.string().nullable().optional(),
  target_audience:     z.string().nullable().optional(),
  language:            z.enum(['es', 'en']).nullable().optional(),
  uses_emojis:         z.boolean().nullable().optional(),
  communication_style: z.string().nullable().optional(),
  tone:                z.array(z.enum(['professional','friendly','authoritative','playful','inspirational','educational','casual','formal'])).optional(),
  customer_locations:  z.array(z.string()).optional(),
  competitors:         z.array(z.string()).optional(),
  social_urls:         z.object({
    instagram: z.string().nullable().optional(),
    linkedin:  z.string().nullable().optional(),
    twitter:   z.string().nullable().optional(),
    facebook:  z.string().nullable().optional(),
    tiktok:    z.string().nullable().optional(),
    youtube:   z.string().nullable().optional(),
  }).optional(),
});

// POST /api/brand-kit/enrich-url
// Body: { url: string, lang?: string }
// Returns: { extracted: Partial<BrandKit> }
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['owner', 'admin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { url, lang } = body as { url: string; lang?: string };
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    return NextResponse.json({ error: 'Firecrawl not configured' }, { status: 500 });
  }

  const location = lang === 'en'
    ? { country: 'US', languages: ['en'] }
    : { country: 'CL', languages: ['es'] };

  try {
    const firecrawl = new FirecrawlApp({ apiKey: firecrawlKey });
    const scrapeOptions = { onlyMainContent: true, location };

    // Two parallel calls: identity/content (json schema) + visual identity (branding)
    const [jsonResult, brandingResult] = await Promise.all([
      firecrawl.scrape(url, {
        ...scrapeOptions,
        formats: [{ type: 'json', schema: z.toJSONSchema(brandSchema) }] as never,
      }),
      firecrawl.scrape(url, {
        ...scrapeOptions,
        formats: ['branding'] as never,
      }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (jsonResult as any).json as z.infer<typeof brandSchema> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const branding = (brandingResult as any).branding as Record<string, unknown> | undefined;

    const extracted: Partial<BrandKit> = {};

    // ── Identity fields from JSON extraction ─────────────────────────────────
    if (typeof raw?.name === 'string' && raw.name.trim())                extracted.name                = raw.name.trim();
    if (typeof raw?.tagline === 'string' && raw.tagline.trim())          extracted.tagline             = raw.tagline.trim();
    if (typeof raw?.mission === 'string' && raw.mission.trim())          extracted.mission             = raw.mission.trim();
    if (typeof raw?.industry === 'string' && raw.industry.trim())        extracted.industry            = raw.industry.trim();
    if (typeof raw?.niche === 'string' && raw.niche.trim())              extracted.niche               = raw.niche.trim();
    if (typeof raw?.target_audience === 'string' && raw.target_audience.trim()) extracted.target_audience = raw.target_audience.trim();
    if (raw?.language === 'es' || raw?.language === 'en')                extracted.language            = raw.language as 'es' | 'en';
    if (typeof raw?.uses_emojis === 'boolean')                           extracted.uses_emojis         = raw.uses_emojis;
    if (typeof raw?.communication_style === 'string' && raw.communication_style.trim()) extracted.communication_style = raw.communication_style.trim();
    if (Array.isArray(raw?.tone) && raw.tone.length > 0)                 extracted.tone                = raw.tone as BrandKit['tone'];
    if (Array.isArray(raw?.customer_locations) && raw.customer_locations.length > 0) extracted.customer_locations = (raw.customer_locations as string[]).slice(0, 10);
    if (Array.isArray(raw?.competitors) && raw.competitors.length > 0)  extracted.competitors         = (raw.competitors as string[]).slice(0, 10);

    if (raw?.social_urls && typeof raw.social_urls === 'object') {
      const su: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw.social_urls as Record<string, unknown>)) {
        if (typeof v === 'string' && v.trim()) su[k] = v.trim();
      }
      if (Object.keys(su).length > 0) extracted.social_urls = su;
    }

    // ── Visual identity from branding profile ────────────────────────────────
    if (branding) {
      const logoUrl = (branding.logo ?? (branding.images as Record<string, unknown>)?.logo) as string | undefined;
      if (typeof logoUrl === 'string' && logoUrl.startsWith('http')) extracted.logo_url = logoUrl;

      const colors = branding.colors as Record<string, string> | undefined;
      if (typeof colors?.primary === 'string')   extracted.primary_color   = colors.primary;
      if (typeof colors?.secondary === 'string') extracted.secondary_color = colors.secondary;
      if (typeof colors?.accent === 'string')    extracted.accent_color    = colors.accent;

      const typography = branding.typography as Record<string, unknown> | undefined;
      const fontFamilies = typography?.fontFamilies as Record<string, string> | undefined;
      if (typeof fontFamilies?.heading === 'string') extracted.font_heading = fontFamilies.heading;
      if (typeof fontFamilies?.primary === 'string') extracted.font_body    = fontFamilies.primary;
    }

    return NextResponse.json({ extracted });
  } catch (err) {
    console.error('enrich-url error:', err);
    return NextResponse.json({ error: 'Failed to enrich URL' }, { status: 502 });
  }
}
