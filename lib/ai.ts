import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// ─── Client singletons ────────────────────────────────────────────────────────

function getAnthropic(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Missing ANTHROPIC_API_KEY env var');
  return new Anthropic({ apiKey: key });
}

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Missing OPENAI_API_KEY env var');
  return new OpenAI({ apiKey: key });
}

// ─── Prompt loader ────────────────────────────────────────────────────────────

/**
 * Load a prompt template from `prompts/{name}.prompt.md`.
 * Falls back to the provided inline string if the file is missing.
 * Supports simple `{{variable}}` template substitution.
 */
function loadPrompt(name: string, vars: Record<string, string> = {}, fallback = ''): string {
  try {
    const filePath = path.join(process.cwd(), 'prompts', `${name}.prompt.md`);
    let template   = fs.readFileSync(filePath, 'utf-8');
    // Strip optional YAML frontmatter (--- ... ---)
    template = template.replace(/^---[\s\S]*?---\s*/m, '');
    // Substitute {{variable}} placeholders
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`).trim();
  } catch {
    return fallback;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip markdown code fences that Claude sometimes wraps around JSON output. */
function stripJsonFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContentChannel =
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'tiktok'
  | 'threads'
  | 'generic';

export type AIModel = 'claude' | 'gpt';

export interface GenerateTextOptions {
  channel:    ContentChannel;
  topic:      string;
  tone?:      string[];
  language?:  'es' | 'en';
  model?:     AIModel;
  brandName?: string;
  tagline?:   string;
  extraCtx?:  string;
}

export interface GenerateTextResult {
  body:       string;
  hashtags:   string[];
  model:      string;
  tokensUsed: number;
}

export interface BrandImageContext {
  name?:           string;
  primaryColor?:   string;
  secondaryColor?: string;
  accentColor?:    string;
  tone?:           string[];
  logoB64?:        string;  // raw base64, no data-URI prefix
  logoMimeType?:   string;  // e.g. 'image/png'
}

export interface GenerateImageOptions {
  prompt:           string;
  size?:            '1024x1024' | '1536x1024' | '1024x1536' | '1080x1080' | '1024x1792' | 'auto';
  quality?:         'low' | 'medium' | 'high' | 'auto';
  brand?:           BrandImageContext;
  referenceImages?: string[];  // Public URLs of user-uploaded reference images
}

export interface GenerateImageResult {
  b64:           string;   // raw base64, no data-URI prefix
  revisedPrompt: string;
}

export interface CarouselSlide {
  slide_order:   number;
  title:         string;
  body:          string;
  image_prompt?: string;
}

export interface GenerateCarouselOptions {
  channel:     ContentChannel;
  topic:       string;
  slide_count: number;  // 3–10
  tone?:       string[];
  language?:   'es' | 'en';
  brandName?:  string;
  tagline?:    string;
  extraCtx?:   string;
}

export interface GenerateCarouselResult {
  slides:     CarouselSlide[];
  model:      string;
  tokensUsed: number;
}

// ─── Channel limits ───────────────────────────────────────────────────────────

const CHANNEL_LIMITS: Record<ContentChannel, { maxChars: number; hashtagCount: number }> = {
  linkedin:  { maxChars: 3000, hashtagCount: 5 },
  instagram: { maxChars: 2200, hashtagCount: 15 },
  facebook:  { maxChars: 2000, hashtagCount: 5 },
  twitter:   { maxChars: 280,  hashtagCount: 3 },
  tiktok:    { maxChars: 2200, hashtagCount: 10 },
  threads:   { maxChars: 500,  hashtagCount: 5 },
  generic:   { maxChars: 3000, hashtagCount: 5 },
};

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(opts: GenerateTextOptions): string {
  const lang  = opts.language === 'en' ? 'English' : 'Spanish';
  const limit = CHANNEL_LIMITS[opts.channel];
  const tone  = opts.tone?.join(', ') || 'professional';

  const brandCtx = opts.brandName
    ? `Brand: "${opts.brandName}"${opts.tagline ? ` — "${opts.tagline}"` : ''}.`
    : '';

  const inlinePrompt = [
    `You are an expert social media copywriter. Write content for ${opts.channel} in ${lang}.`,
    `Tone: ${tone}.`,
    `Max characters: ${limit.maxChars}.`,
    `Include exactly ${limit.hashtagCount} relevant hashtags at the end, each starting with #.`,
    brandCtx,
    opts.extraCtx || '',
    'Return ONLY the post text followed by the hashtags. No extra explanations.',
  ]
    .filter(Boolean)
    .join(' ');

  return loadPrompt('post', {
    channel:         opts.channel,
    language:        lang,
    tone,
    maxChars:        String(limit.maxChars),
    hashtagCount:    String(limit.hashtagCount),
    brandCtx:        brandCtx,
    extraCtx:        opts.extraCtx ?? '',
  }, inlinePrompt);
}

// ─── Extract hashtags from generated text ────────────────────────────────────

function extractHashtags(text: string): { body: string; hashtags: string[] } {
  const hashtagRegex = /(#\w+)/g;
  const hashtags = text.match(hashtagRegex) ?? [];
  const body = text.replace(hashtagRegex, '').replace(/\s{2,}/g, ' ').trim();
  return { body, hashtags };
}

// ─── Text generation ──────────────────────────────────────────────────────────

export async function generateContentText(
  opts: GenerateTextOptions,
): Promise<GenerateTextResult> {
  const systemPrompt = buildSystemPrompt(opts);
  const userMessage  = `Write a ${opts.channel} post about: ${opts.topic}`;

  if (!opts.model || opts.model === 'claude') {
    return generateWithClaude(systemPrompt, userMessage);
  }
  return generateWithGPT(systemPrompt, userMessage);
}

async function generateWithClaude(
  system: string,
  message: string,
): Promise<GenerateTextResult> {
  const client = getAnthropic();
  const model  = 'claude-opus-4-5';

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: message }],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const { body, hashtags } = extractHashtags(raw);

  return {
    body,
    hashtags,
    model,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
  };
}

async function generateWithGPT(
  system: string,
  message: string,
): Promise<GenerateTextResult> {
  const client = getOpenAI();
  const model  = 'gpt-4o';

  const response = await client.chat.completions.create({
    model,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: message },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? '';
  const { body, hashtags } = extractHashtags(raw);

  return {
    body,
    hashtags,
    model,
    tokensUsed: response.usage?.total_tokens ?? 0,
  };
}

// ─── Image generation (gpt-image-2) ──────────────────────────────────────────

export async function generateContentImage(
  opts: GenerateImageOptions,
): Promise<GenerateImageResult> {
  const client = getOpenAI();

  // Enrich prompt with brand colors and style
  const brandParts: string[] = [];
  if (opts.brand?.name)            brandParts.push(`Brand: "${opts.brand.name}".`);
  if (opts.brand?.primaryColor)    brandParts.push(`Primary color: ${opts.brand.primaryColor}.`);
  if (opts.brand?.secondaryColor)  brandParts.push(`Secondary color: ${opts.brand.secondaryColor}.`);
  if (opts.brand?.accentColor)     brandParts.push(`Accent color: ${opts.brand.accentColor}.`);
  if (opts.brand?.tone?.length)    brandParts.push(`Visual style: ${opts.brand.tone.join(', ')}.`);

  // Load enriched prompt from file if available
  const imagePromptTemplate = loadPrompt('reel-image', {
    prompt:    opts.prompt,
    brandCtx:  brandParts.join(' '),
  });

  const enrichedPrompt = imagePromptTemplate || (brandParts.length
    ? `${opts.prompt}\n\nBrand guidelines: ${brandParts.join(' ')}`
    : opts.prompt);

  const size    = (opts.size === 'auto' || !opts.size) ? '1024x1024' : opts.size;
  const quality = opts.quality === 'auto' ? 'medium' : (opts.quality ?? 'medium');

  const hasLogo       = !!(opts.brand?.logoB64 && opts.brand?.logoMimeType);
  const hasReferences = !!(opts.referenceImages?.length);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateFn = client.images.generate.bind(client.images) as (params: any) => Promise<any>;

  let response: { data: Array<{ b64_json?: string; revised_prompt?: string }> };

  if (hasLogo || hasReferences) {
    // Multi-image input mode: logo + reference images guide the generation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputParts: any[] = [];

    // Reference images from user uploads (up to 3)
    const refs = (opts.referenceImages ?? []).slice(0, 3);
    for (const refUrl of refs) {
      inputParts.push({ type: 'image_url', image_url: { url: refUrl } });
    }

    // Brand logo
    if (hasLogo) {
      const logoDataUrl = `data:${opts.brand!.logoMimeType!};base64,${opts.brand!.logoB64!}`;
      inputParts.push({ type: 'image_url', image_url: { url: logoDataUrl } });
    }

    // Prompt text — include guidance to use the reference images
    const referenceGuidance = refs.length > 0
      ? ' Use the provided reference images to guide the visual style, composition, and mood.'
      : '';
    const logoGuidance = hasLogo
      ? ' Incorporate the provided brand logo into the composition in a natural and visually balanced way.'
      : '';

    inputParts.push({
      type: 'text',
      text: enrichedPrompt + referenceGuidance + logoGuidance,
    });

    response = await generateFn({
      model:         'gpt-image-2-2026-04-21',
      input:         inputParts,
      n:             1,
      size,
      quality,
      output_format: 'jpeg',
    });
  } else {
    response = await generateFn({
      model:         'gpt-image-2-2026-04-21',
      prompt:        enrichedPrompt,
      n:             1,
      size,
      quality,
      output_format: 'jpeg',
    });
  }

  const img = response.data?.[0];
  const b64 = (img as { b64_json?: string })?.b64_json;
  if (!b64) throw new Error('gpt-image-2 did not return base64 image data');

  return {
    b64,
    revisedPrompt: (img as { revised_prompt?: string })?.revised_prompt ?? opts.prompt,
  };
}

// ─── Carousel generation ──────────────────────────────────────────────────────

export async function generateCarouselSlides(
  opts: GenerateCarouselOptions,
): Promise<GenerateCarouselResult> {
  const lang       = opts.language === 'en' ? 'English' : 'Spanish';
  const tone       = opts.tone?.join(', ') || 'professional';
  const slideCount = Math.min(10, Math.max(3, opts.slide_count));

  const brandCtx = opts.brandName
    ? `Brand: "${opts.brandName}"${opts.tagline ? ` — "${opts.tagline}"` : ''}.`
    : '';

  const inlineCarouselSystem = [
    `You are an expert social media content strategist creating a ${slideCount}-slide carousel for ${opts.channel} in ${lang}.`,
    `Tone: ${tone}.`,
    brandCtx,
    opts.extraCtx ?? '',
    'Return ONLY a valid JSON array with exactly this shape, no markdown fences:',
    `[{"slide_order":1,"title":"...","body":"...","image_prompt":"..."}]`,
    'title: short hook (max 60 chars). body: slide copy (max 150 chars). image_prompt: visual description for image generation (max 100 chars, English).',
  ].filter(Boolean).join(' ');

  const system = loadPrompt('carousel', {
    slideCount: String(slideCount),
    channel:    opts.channel,
    language:   lang,
    tone,
    brandCtx:   brandCtx,
    extraCtx:   opts.extraCtx ?? '',
  }, inlineCarouselSystem);

  const userMessage = `Create a ${slideCount}-slide carousel about: ${opts.topic}`;

  const client = getAnthropic();
  const model  = 'claude-opus-4-5';

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  let slides: CarouselSlide[];
  try {
    slides = JSON.parse(stripJsonFences(raw)) as CarouselSlide[];
    if (!Array.isArray(slides)) throw new Error('Not an array');
  } catch {
    throw new Error(`Claude returned invalid carousel JSON: ${raw.slice(0, 200)}`);
  }

  return {
    slides,
    model,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
  };
}

// ─── Reel script generation ───────────────────────────────────────────────────

export interface ReelScene {
  scene_order:      number;
  title:            string;   // on-screen hook/headline (max 60 chars)
  body:             string;   // supporting copy (max 120 chars)
  image_prompt:     string;   // English visual description for gpt-image-2
  duration_seconds: number;   // 2–5
  image_url?:       string;   // populated after image generation
}

export interface GenerateReelOptions {
  channel:      ContentChannel;
  topic:        string;
  scene_count?: number;   // 3–8, default 5
  tone?:        string[];
  language?:    'es' | 'en';
  brandName?:   string;
  tagline?:     string;
  extraCtx?:    string;
}

export interface GenerateReelResult {
  scenes:     ReelScene[];
  hook:       string;         // opening caption / CTA for the post
  hashtags:   string[];
  model:      string;
  tokensUsed: number;
}

export async function generateReelScript(
  opts: GenerateReelOptions,
): Promise<GenerateReelResult> {
  const lang       = opts.language === 'en' ? 'English' : 'Spanish';
  const tone       = opts.tone?.join(', ') || 'dynamic, engaging';
  const sceneCount = Math.min(8, Math.max(3, opts.scene_count ?? 5));

  const brandCtx = opts.brandName
    ? `Brand: "${opts.brandName}"${opts.tagline ? ` — "${opts.tagline}"` : ''}.`
    : '';

  const inlineReelSystem = [
    `You are a short-form video director creating a ${sceneCount}-scene vertical reel for ${opts.channel} in ${lang}.`,
    `Tone: ${tone}.`,
    brandCtx,
    opts.extraCtx ?? '',
    'Return ONLY valid JSON (no markdown fences) with this exact shape:',
    `{"hook":"<opening caption>","hashtags":["#tag1"],"scenes":[{"scene_order":1,"title":"...","body":"...","image_prompt":"...","duration_seconds":3}]}`,
    'title: text overlay headline (max 60 chars). body: supporting copy shown on screen (max 120 chars). image_prompt: vivid English visual description for image generation (max 120 chars). duration_seconds: 2-5.',
    `hook: compelling ${lang} caption for the post description (max 150 chars). hashtags: 8 relevant tags.`,
  ].filter(Boolean).join(' ');

  const system = loadPrompt('reel-script', {
    sceneCount: String(sceneCount),
    channel:    opts.channel,
    language:   lang,
    tone,
    brandCtx:   brandCtx,
    extraCtx:   opts.extraCtx ?? '',
  }, inlineReelSystem);

  const userMessage = `Create a ${sceneCount}-scene vertical reel about: ${opts.topic}`;

  const client = getAnthropic();
  const model  = 'claude-opus-4-5';

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  let parsed: { hook: string; hashtags: string[]; scenes: ReelScene[] };
  try {
    parsed = JSON.parse(stripJsonFences(raw)) as typeof parsed;
    if (!Array.isArray(parsed.scenes)) throw new Error('scenes not an array');
  } catch {
    throw new Error(`Claude returned invalid reel JSON: ${raw.slice(0, 200)}`);
  }

  return {
    scenes:     parsed.scenes,
    hook:       parsed.hook ?? '',
    hashtags:   parsed.hashtags ?? [],
    model,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
  };
}
