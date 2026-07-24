import Anthropic from '@anthropic-ai/sdk';
import OpenAI, { toFile } from 'openai';
import fs from 'fs';
import path from 'path';
import type {
  ContentChannel,
  GenerateTextOptions,
  GenerateTextResult,
  GenerateImageOptions,
  GenerateImageResult,
  CarouselSlide,
  GenerateCarouselOptions,
  GenerateCarouselResult,
  ReelScene,
  GenerateReelOptions,
  GenerateReelResult,
  GenerateSlideTextOptions,
  GenerateSlideTextResult,
  RecommendedContentType,
  ContentRecommendation,
  RecommendBrandContext,
  GenerateRecommendationsResult,
} from '@/types/ai';

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

// ─── Channel limits ───────────────────────────────────────────────────────────

const CHANNEL_LIMITS: Record<ContentChannel, { maxChars: number; hashtagCount: number }> = {
  linkedin:  { maxChars: 3000, hashtagCount: 5 },
  instagram: { maxChars: 2200, hashtagCount: 15 },
  facebook:  { maxChars: 2000, hashtagCount: 5 },
  twitter:   { maxChars: 280,  hashtagCount: 3 },
  tiktok:    { maxChars: 2200, hashtagCount: 10 },
  threads:   { maxChars: 500,  hashtagCount: 5 },
  // 'generic' sweet spot: readable on all platforms, avoids Instagram truncation
  // and TikTok photo title issues. ~700 chars fits comfortably on every feed.
  generic:   { maxChars: 700, hashtagCount: 8 },
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
  // Unicode-aware: \p{L} matches accented letters (Tecnología, etc.)
  const hashtagRegex = /(#[\p{L}\p{N}_]+)/gu;
  const hashtags = text.match(hashtagRegex) ?? [];
  const body = text.replace(hashtagRegex, '').replace(/\s{2,}/g, ' ').trim();
  return { body, hashtags };
}

// ─── Text generation ──────────────────────────────────────────────────────────

/**
 * Hard-truncate body text at the channel's maxChars limit.
 * Cuts at the last sentence boundary (. ! ?) within the limit to avoid mid-sentence cuts.
 */
function enforceCharLimit(body: string, maxChars: number): string {
  if (body.length <= maxChars) return body;
  const slice = body.slice(0, maxChars);
  // Try to cut at the last sentence boundary
  const lastSentence = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('\n'),
  );
  return lastSentence > maxChars * 0.6
    ? slice.slice(0, lastSentence + 1).trimEnd()
    : slice.trimEnd() + '…';
}

export async function generateContentText(
  opts: GenerateTextOptions,
): Promise<GenerateTextResult> {
  const systemPrompt = buildSystemPrompt(opts);
  const userMessage  = `Write a ${opts.channel} post about: ${opts.topic}`;
  const maxChars     = CHANNEL_LIMITS[opts.channel].maxChars;

  const result = await (!opts.model || opts.model === 'claude'
    ? generateWithClaude(systemPrompt, userMessage)
    : generateWithGPT(systemPrompt, userMessage));

  return { ...result, body: enforceCharLimit(result.body, maxChars) };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editFn     = client.images.edit.bind(client.images)     as (params: any) => Promise<any>;

  let response: { data?: Array<{ b64_json?: string; revised_prompt?: string }> };

  if (hasLogo || hasReferences) {
    // Reference-image-guided generation: use images.edit with the logo and any
    // user-provided references as input images. `images.generate` only accepts
    // text prompts — example/reference images must go through `images.edit`.
    const imageFiles: Awaited<ReturnType<typeof toFile>>[] = [];

    // User reference images (up to 3) — downloaded and converted to File
    const refs = (opts.referenceImages ?? []).slice(0, 3);
    for (let i = 0; i < refs.length; i++) {
      try {
        const res = await fetch(refs[i]);
        if (!res.ok) continue;
        const buf  = Buffer.from(await res.arrayBuffer());
        const mime = res.headers.get('content-type') ?? 'image/png';
        const ext  = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
        imageFiles.push(await toFile(buf, `ref-${i}.${ext}`, { type: mime }));
      } catch {
        // Skip unreachable references rather than failing the whole request
      }
    }

    // Brand logo (already base64 in memory)
    if (hasLogo) {
      const logoBuf  = Buffer.from(opts.brand!.logoB64!, 'base64');
      const logoMime = opts.brand!.logoMimeType!;
      const ext      = logoMime.includes('jpeg') ? 'jpg' : logoMime.includes('webp') ? 'webp' : 'png';
      imageFiles.push(await toFile(logoBuf, `logo.${ext}`, { type: logoMime }));
    }

    if (imageFiles.length === 0) {
      // All references failed to load — fall back to text-only generation
      response = await generateFn({
        model:         'gpt-image-2-2026-04-21',
        prompt:        enrichedPrompt,
        n:             1,
        size,
        quality,
        output_format: 'jpeg',
      });
    } else {
      const referenceGuidance = refs.length > 0
        ? ' Use the provided reference images to guide the visual style, composition, and mood.'
        : '';
      const logoGuidance = hasLogo
        ? ' Incorporate the provided brand logo into the composition in a natural and visually balanced way.'
        : '';

      response = await editFn({
        model:         'gpt-image-2-2026-04-21',
        image:         imageFiles.length === 1 ? imageFiles[0] : imageFiles,
        prompt:        enrichedPrompt + referenceGuidance + logoGuidance,
        n:             1,
        size,
        quality,
        output_format: 'jpeg',
      });
    }
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
  const lang         = opts.language === 'en' ? 'English' : 'Spanish';
  const tone         = opts.tone?.join(', ') || 'professional';
  const slideCount   = Math.min(10, Math.max(3, opts.slide_count));
  const limits       = CHANNEL_LIMITS[opts.channel];
  const maxChars     = String(limits.maxChars);
  const hashtagCount = String(limits.hashtagCount);

  const brandCtx = opts.brandName
    ? `Brand: "${opts.brandName}"${opts.tagline ? ` — "${opts.tagline}"` : ''}.`
    : '';

  const inlineCarouselSystem = [
    `You are an expert social media content strategist creating a ${slideCount}-slide carousel for ${opts.channel} in ${lang}.`,
    `Tone: ${tone}.`,
    brandCtx,
    opts.extraCtx ?? '',
    'Return ONLY valid JSON (no markdown fences) with this shape:',
    `{"description":"<single post caption max ${limits.maxChars} chars + ${limits.hashtagCount} hashtags>","slides":[{"slide_order":1,"title":"<max 60 chars, text on image>","body":"<max 120 chars, text on image>","image_prompt":"<background visual, English, max 100 chars>"}]}`,
    'description: one caption for the whole post with hashtags appended. title/body: text that will appear ON each slide image. image_prompt: background only (app overlays text).',
  ].filter(Boolean).join(' ');

  const system = loadPrompt('carousel', {
    slideCount:   String(slideCount),
    channel:      opts.channel,
    language:     lang,
    tone,
    brandCtx,
    extraCtx:     opts.extraCtx ?? '',
    maxChars,
    hashtagCount,
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

  let parsed: { description: string; slides: CarouselSlide[] };
  try {
    parsed = JSON.parse(stripJsonFences(raw)) as typeof parsed;
    if (!Array.isArray(parsed.slides)) throw new Error('slides is not an array');
    if (typeof parsed.description !== 'string') throw new Error('description missing');
  } catch {
    throw new Error(`Claude returned invalid carousel JSON: ${raw.slice(0, 200)}`);
  }

  const { body: descBody, hashtags } = extractHashtags(parsed.description);
  const description = enforceCharLimit(descBody, limits.maxChars);

  return {
    slides:     parsed.slides,
    description,
    hashtags,
    model,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
  };
}

// ─── Single slide / scene text regeneration ───────────────────────────────────

/**
 * Regenerate the on-image text (title + body) for ONE carousel slide or reel
 * scene, keeping it consistent with the brand voice. Used by the per-slide
 * "Regenerar texto con IA" button in the edit modal.
 */
export async function generateSlideText(
  opts: GenerateSlideTextOptions,
): Promise<GenerateSlideTextResult> {
  const lang = opts.language === 'en' ? 'English' : 'Spanish';
  const tone = opts.tone?.join(', ') || 'professional';
  const unit = opts.kind === 'reel' ? 'reel scene' : 'carousel slide';

  const brandCtx = opts.brandName
    ? `Brand: "${opts.brandName}"${opts.tagline ? ` — "${opts.tagline}"` : ''}.`
    : '';

  const current = [
    opts.title ? `Current title: "${opts.title}"` : '',
    opts.body ? `Current body: "${opts.body}"` : '',
  ].filter(Boolean).join('\n');

  const system = [
    `You are an expert social media copywriter rewriting the on-image text of a single ${unit} for ${opts.channel} in ${lang}.`,
    `Tone: ${tone}.`,
    brandCtx,
    'Return ONLY valid JSON (no markdown fences) with this exact shape:',
    '{"title":"<max 60 chars headline shown on the slide>","body":"<max 120 chars supporting copy shown on the slide>"}',
    'Keep it punchy and self-contained. Do not add hashtags or emojis unless clearly on-brand.',
  ].filter(Boolean).join(' ');

  const instruction = opts.feedback?.trim()
    ? `Rewrite this ${unit} applying: "${opts.feedback.trim()}".`
    : `Rewrite this ${unit} to be sharper and more engaging while keeping the same idea.`;

  const userMessage = [instruction, current].filter(Boolean).join('\n\n')
    || `Write an engaging ${unit}.`;

  const client = getAnthropic();
  const model  = 'claude-opus-4-5';

  const response = await client.messages.create({
    model,
    max_tokens: 512,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  let parsed: { title?: string; body?: string };
  try {
    parsed = JSON.parse(stripJsonFences(raw)) as typeof parsed;
  } catch {
    throw new Error(`Claude returned invalid slide JSON: ${raw.slice(0, 200)}`);
  }

  return {
    title:      (parsed.title ?? '').slice(0, 80),
    body:       (parsed.body ?? '').slice(0, 200),
    model,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
  };
}

// ─── Reel script generation ───────────────────────────────────────────────────

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

// ─── Content recommendations (AI fallback when no strategy) ──────────────────

/**
 * Generate 3 channel-agnostic content recommendations from Brand Kit context.
 * Used when the org has no active strategy and no industry match in the
 * strategy catalog. Output drives the "✦ Recomiéndame contenido" chips.
 */
export async function generateContentRecommendations(
  ctx: RecommendBrandContext,
  count = 3,
): Promise<GenerateRecommendationsResult> {
  const lang = ctx.language === 'en' ? 'English' : 'Spanish';
  const brandLines = [
    ctx.name            ? `Brand: "${ctx.name}".` : '',
    ctx.tagline         ? `Tagline: "${ctx.tagline}".` : '',
    ctx.industry        ? `Industry: ${ctx.industry}.` : '',
    ctx.niche           ? `Niche: ${ctx.niche}.` : '',
    ctx.target_audience ? `Target audience: ${ctx.target_audience}.` : '',
    ctx.mission         ? `Mission: ${ctx.mission}.` : '',
    ctx.differentiators?.length ? `Differentiators: ${ctx.differentiators.join('; ')}.` : '',
    ctx.tone?.length    ? `Voice tone: ${ctx.tone.join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  const strategyLines = ctx.strategy
    ? [
        ctx.strategy.framework_name ? `Active strategy framework: ${ctx.strategy.framework_name}.` : '',
        ctx.strategy.kpi_primary    ? `Primary KPI: ${ctx.strategy.kpi_primary}.` : '',
        ctx.strategy.current_week && ctx.strategy.total_weeks
          ? `Calendar position: week ${ctx.strategy.current_week} of ${ctx.strategy.total_weeks}.`
          : '',
        ctx.strategy.sample_topics?.length
          ? `Topics already scheduled this week (do not repeat verbatim): ${ctx.strategy.sample_topics.slice(0, 6).join(' | ')}.`
          : '',
      ].filter(Boolean).join(' ')
    : '';

  const recentLines = ctx.recent_topics?.length
    ? `Recently published topics (avoid repeating): ${ctx.recent_topics.slice(0, 10).join(' | ')}.`
    : '';

  const hintClean = (ctx.hint ?? '').trim().slice(0, 500);
  const hintLines = hintClean
    ? `USER GUIDANCE (highest priority — every idea MUST address this): "${hintClean}".`
    : '';

  const inlineSystem = [
    `You are a senior social media strategist. Suggest ${count} fresh, high-performing channel-agnostic content ideas in ${lang} for the brand below.`,
    brandLines,
    strategyLines,
    recentLines,
    hintLines,
    'Return ONLY a valid JSON array (no markdown fences) with this exact shape:',
    `[{"topic":"<concrete content idea, 1-2 sentences, max 240 chars>","content_type":"post"|"carousel"|"reel"|"story","rationale_short":"<why this idea fits the brand, max 100 chars>"}]`,
    'Mix the 4 content_type values across the items when possible: post (single image), carousel (multi-slide), reel (short video), story (timely/ephemeral, 24h). Avoid generic motivational fluff — be specific to the brand.',
  ].filter(Boolean).join(' ');

  const system = loadPrompt('recommend', {
    count:    String(count),
    language: lang,
    brand:    brandLines,
    strategy: strategyLines,
    recent:   recentLines,
    hint:     hintLines,
  }, inlineSystem);

  const client = getAnthropic();
  const model  = 'claude-opus-4-5';

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: `Give me ${count} content ideas.` }],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  let parsed: ContentRecommendation[];
  try {
    parsed = JSON.parse(stripJsonFences(raw)) as ContentRecommendation[];
    if (!Array.isArray(parsed)) throw new Error('Not an array');
  } catch {
    throw new Error(`Claude returned invalid recommendations JSON: ${raw.slice(0, 200)}`);
  }

  // Sanitize + clamp
  const valid: RecommendedContentType[] = ['post', 'carousel', 'reel', 'story'];
  const recommendations = parsed.slice(0, count).map((r) => ({
    topic:           String(r.topic ?? '').slice(0, 280),
    content_type:    valid.includes(r.content_type) ? r.content_type : ('post' as RecommendedContentType),
    rationale_short: String(r.rationale_short ?? '').slice(0, 140),
  })).filter((r) => r.topic.length > 0);

  return {
    recommendations,
    model,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
  };
}
