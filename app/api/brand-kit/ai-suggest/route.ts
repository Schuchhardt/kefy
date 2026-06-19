import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthFromRequest } from '@/lib/auth';
import type { BrandKit } from '@/types/brand-kit';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Field-specific prompt templates
const FIELD_PROMPTS: Record<string, (ctx: Partial<BrandKit>, lang: string) => string> = {
  tagline: (ctx, lang) => `
    Brand name: "${ctx.name ?? ''}". Industry: "${ctx.industry ?? ''}". Mission: "${ctx.mission ?? ''}".
    Generate 5 short catchy taglines/slogans for this brand in ${lang === 'es' ? 'Spanish' : 'English'}.
    Each must be under 80 characters. Return ONLY a JSON array of strings.`,

  mission: (ctx, lang) => `
    Brand name: "${ctx.name ?? ''}". Industry: "${ctx.industry ?? ''}". Target audience: "${ctx.target_audience ?? ''}". Niche: "${ctx.niche ?? ''}".
    Generate 4 concise mission statement options in ${lang === 'es' ? 'Spanish' : 'English'} (1-2 sentences each).
    Return ONLY a JSON array of strings.`,

  communication_style: (ctx, lang) => `
    Brand: "${ctx.name ?? ''}". Tone: [${(ctx.tone ?? []).join(', ')}]. Uses emojis: ${ctx.uses_emojis ?? false}. Industry: "${ctx.industry ?? ''}".
    Suggest 5 communication style descriptions in ${lang === 'es' ? 'Spanish' : 'English'} (e.g. "Directo y cercano, sin tecnicismos").
    Return ONLY a JSON array of strings.`,

  niche: (ctx, lang) => `
    Brand: "${ctx.name ?? ''}". Industry: "${ctx.industry ?? ''}". Target audience: "${ctx.target_audience ?? ''}".
    Suggest 5 specific niche descriptions in ${lang === 'es' ? 'Spanish' : 'English'} (e.g. "Coaches de vida para mujeres latinas +35").
    Return ONLY a JSON array of strings.`,

  target_audience: (ctx, lang) => `
    Brand: "${ctx.name ?? ''}". Industry: "${ctx.industry ?? ''}". Niche: "${ctx.niche ?? ''}". Company size: "${ctx.company_size ?? ''}".
    Suggest 5 specific target audience descriptions in ${lang === 'es' ? 'Spanish' : 'English'} (e.g. "Emprendedores digitales de 25-40 años").
    Return ONLY a JSON array of strings.`,

  differentiators: (ctx, lang) => `
    Brand: "${ctx.name ?? ''}". Industry: "${ctx.industry ?? ''}". Mission: "${ctx.mission ?? ''}". Competitors: [${(ctx.competitors ?? []).join(', ')}].
    Suggest 5 potential differentiators/USPs in ${lang === 'es' ? 'Spanish' : 'English'} (short phrases, e.g. "Atención al cliente 24/7 en español").
    Return ONLY a JSON array of strings.`,

  challenges: (ctx, lang) => `
    Brand: "${ctx.name ?? ''}". Industry: "${ctx.industry ?? ''}". Company size: "${ctx.company_size ?? ''}". Target audience: "${ctx.target_audience ?? ''}".
    Suggest 5 common business challenges/pain points in ${lang === 'es' ? 'Spanish' : 'English'} this type of company might face.
    Return ONLY a JSON array of strings.`,

  competitors: (ctx, lang) => `
    Brand: "${ctx.name ?? ''}". Industry: "${ctx.industry ?? ''}". Niche: "${ctx.niche ?? ''}". Website: "${ctx.website_url ?? ''}".
    Suggest 5 likely competitors (brand/company names) in ${lang === 'es' ? 'Spanish' : 'English'}.
    Return ONLY a JSON array of strings.`,

  customer_locations: (ctx, lang) => `
    Brand: "${ctx.name ?? ''}". Industry: "${ctx.industry ?? ''}". Language: "${ctx.language ?? 'es'}". Target audience: "${ctx.target_audience ?? ''}".
    Suggest 6 likely customer locations (countries or cities) in ${lang === 'es' ? 'Spanish' : 'English'}.
    Return ONLY a JSON array of strings.`,

  industry: (_ctx, lang) => `
    List 12 common business industries/verticals in ${lang === 'es' ? 'Spanish' : 'English'}.
    Return ONLY a JSON array of strings.`,

  tone: (_ctx, lang) => `
    List these 8 brand tone options translated to ${lang === 'es' ? 'Spanish' : 'English'}:
    professional, friendly, authoritative, playful, inspirational, educational, casual, formal.
    Return ONLY a JSON array of strings (the translated values).`,

  company_size: (_ctx, lang) => `
    List typical company size ranges used for segmentation in ${lang === 'es' ? 'Spanish' : 'English'}.
    Return ONLY a JSON array of exactly these strings: ["1-10", "11-50", "51-200", "201-500", "500+"].`,
};

// POST /api/brand-kit/ai-suggest
// Body: { field: string, context: Partial<BrandKit>, lang?: string }
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  const { field, context, lang } = body as {
    field: string;
    context: Partial<BrandKit>;
    lang?: string;
  };

  if (!field || typeof field !== 'string') {
    return NextResponse.json({ error: 'field is required' }, { status: 400 });
  }

  const promptFn = FIELD_PROMPTS[field];
  if (!promptFn) {
    return NextResponse.json({ error: `No suggestions available for field: ${field}` }, { status: 400 });
  }

  const language = lang ?? context?.language ?? 'es';
  const prompt = promptFn(context ?? {}, language);

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: prompt.trim(),
        },
      ],
    });

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    // Extract JSON array from the response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions: string[] = JSON.parse(match[0]);
    return NextResponse.json({ suggestions: suggestions.slice(0, 6) });
  } catch (err) {
    console.error('ai-suggest error:', err);
    return NextResponse.json({ error: 'AI suggestion failed' }, { status: 500 });
  }
}
