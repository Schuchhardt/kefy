// ─── Servicio: leer la web de una marca ──────────────────────────────────────
//
// Lógica de POST /api/brand-kit/enrich-url, compartida con el onboarding
// («pega tu web → 3 posts», lib/services/onboarding.ts) y con la herramienta
// del asistente import_brand_from_website.
//
// Firecrawl lee la página dos veces en paralelo: la identidad (un esquema JSON
// que rellena un modelo en su lado) y el branding visual (logo, colores,
// tipografías). Es gasto real con un proveedor de IA: antes la ruta no pasaba
// por ninguna guardia y cualquier cuenta —incluso con el mes gratis vencido—
// podía llamarla sin límite. Ahora cobra 1 crédito de texto con chargeOrThrow
// (suscripción → rate limit → créditos) y lo devuelve si la lectura falla.
//
// Lo que devuelve la web son datos de terceros: quien los muestre al modelo
// del asistente los envuelve como <untrusted_content>.
//
// El branding de Firecrawl trae más de una imagen de marca (logo, images.logo,
// favicon, a veces otras). collectWebLogos las junta todas y storeWebLogos las
// guarda en la biblioteca de logos de la marca (se clasifican solas), así el
// logo principal queda alojado en Kefy y no apuntando a la web.

import FirecrawlApp from '@mendable/firecrawl-js';
import { z } from 'zod';
import { normalizeWebsiteUrl, validateBrandKitUpdate } from '@/lib/brand-kit';
import { reportError } from '@/lib/observability';
import type { BrandKit } from '@/types/brand-kit';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, chargeOrThrow, msg } from '@/lib/services/errors';
import { getOrCreateBrandKit, updateBrandKit } from '@/lib/services/brand-kit';
import { importBrandLogos } from '@/lib/services/brand-assets';

export const ENRICH_ROUTE = 'POST /api/brand-kit/enrich-url';

const TONES = [
  'professional', 'friendly', 'authoritative', 'playful',
  'inspirational', 'educational', 'casual', 'formal',
] as const;

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
  tone:                z.array(z.enum(TONES)).optional(),
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

/**
 * URL normalizada y validada (http/https), o ServiceError 400. Se comprueba
 * antes de cobrar: una URL mal escrita no debe costar un crédito.
 */
export function validateWebsiteUrl(rawUrl: unknown, lang: 'es' | 'en' = 'es'): string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new ServiceError('invalid_input', 400, msg(lang, 'Falta la URL', 'url is required'));
  }
  const url = normalizeWebsiteUrl(rawUrl.trim());
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ServiceError('invalid_input', 400, msg(lang, 'La URL no es válida', 'Invalid URL'));
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) {
    throw new ServiceError('invalid_input', 400, msg(lang, 'La URL no es válida', 'Invalid URL'));
  }
  return url;
}

/**
 * Convierte lo que devuelve Firecrawl en campos del Brand Kit. Pura: se
 * prueba sin red. Solo copia valores con forma válida y recorta las listas.
 */
export function mapFirecrawlResult(
  raw: z.infer<typeof brandSchema> | undefined,
  branding: Record<string, unknown> | undefined,
): Partial<BrandKit> {
  const extracted: Partial<BrandKit> = {};
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  // ── Identidad (extracción JSON) ──────────────────────────────────────────
  const name = text(raw?.name);                               if (name) extracted.name = name;
  const tagline = text(raw?.tagline);                         if (tagline) extracted.tagline = tagline;
  const mission = text(raw?.mission);                         if (mission) extracted.mission = mission;
  const industry = text(raw?.industry);                       if (industry) extracted.industry = industry;
  const niche = text(raw?.niche);                             if (niche) extracted.niche = niche;
  const audience = text(raw?.target_audience);                if (audience) extracted.target_audience = audience;
  const style = text(raw?.communication_style);               if (style) extracted.communication_style = style;
  if (raw?.language === 'es' || raw?.language === 'en')       extracted.language = raw.language;
  if (typeof raw?.uses_emojis === 'boolean')                  extracted.uses_emojis = raw.uses_emojis;
  if (Array.isArray(raw?.tone) && raw.tone.length > 0)        extracted.tone = raw.tone as BrandKit['tone'];
  if (Array.isArray(raw?.customer_locations) && raw.customer_locations.length > 0) {
    extracted.customer_locations = raw.customer_locations.filter((v) => typeof v === 'string').slice(0, 10);
  }
  if (Array.isArray(raw?.competitors) && raw.competitors.length > 0) {
    extracted.competitors = raw.competitors.filter((v) => typeof v === 'string').slice(0, 10);
  }
  if (raw?.social_urls && typeof raw.social_urls === 'object') {
    const su: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.social_urls as Record<string, unknown>)) {
      const value = text(v);
      if (value) su[k] = value;
    }
    if (Object.keys(su).length > 0) extracted.social_urls = su;
  }

  // ── Identidad visual (perfil de branding) ────────────────────────────────
  if (branding) {
    const logoUrl = (branding.logo ?? (branding.images as Record<string, unknown> | undefined)?.logo) as unknown;
    if (typeof logoUrl === 'string' && logoUrl.startsWith('http')) extracted.logo_url = logoUrl;

    const colors = branding.colors as Record<string, unknown> | undefined;
    if (typeof colors?.primary === 'string')   extracted.primary_color   = colors.primary;
    if (typeof colors?.secondary === 'string') extracted.secondary_color = colors.secondary;
    if (typeof colors?.accent === 'string')    extracted.accent_color    = colors.accent;

    const typography = branding.typography as Record<string, unknown> | undefined;
    const fontFamilies = typography?.fontFamilies as Record<string, unknown> | undefined;
    if (typeof fontFamilies?.heading === 'string') extracted.font_heading = fontFamilies.heading;
    if (typeof fontFamilies?.primary === 'string') extracted.font_body    = fontFamilies.primary;
  }

  return extracted;
}

/** Una imagen de marca que trae la web. `kind` solo da el nombre: la forma se mide al importarla. */
export interface WebLogo {
  url: string;
  kind: 'logo' | 'icon';
}

/** Claves de branding.images que no son logos. */
const NOT_LOGOS = new Set(['ogImage', 'ogimage', 'og_image', 'twitterImage', 'screenshot']);

/**
 * Todas las URLs de logos e íconos del branding de Firecrawl (y el favicon de
 * los metadatos), sin repetir y primero el logo principal. Solo https (lo
 * único que se descarga) y sin .ico, que sharp no sabe leer. Pura.
 */
export function collectWebLogos(
  branding: Record<string, unknown> | undefined,
  metadata?: Record<string, unknown>,
): WebLogo[] {
  const out: WebLogo[] = [];
  const add = (value: unknown, kind: WebLogo['kind']) => {
    if (typeof value !== 'string') return;
    const url = value.trim();
    let parsed: URL;
    try { parsed = new URL(url); } catch { return; }
    if (parsed.protocol !== 'https:' || /\.ico$/i.test(parsed.pathname)) return;
    if (out.some((l) => l.url === url)) return;
    out.push({ url, kind });
  };

  const images = (branding?.images ?? {}) as Record<string, unknown>;
  add(branding?.logo, 'logo');
  add(images.logo, 'logo');
  for (const [key, value] of Object.entries(images)) {
    if (key === 'logo' || key === 'favicon' || NOT_LOGOS.has(key)) continue;
    if (/logo/i.test(key)) add(value, 'logo');
    else if (/icon/i.test(key)) add(value, 'icon');
  }
  add(images.favicon, 'icon');
  add(metadata?.favicon, 'icon');
  return out;
}

interface ScrapedBrand {
  extracted: Partial<BrandKit>;
  logos: WebLogo[];
}

/** Lee la web con Firecrawl. Sin cobro: lo hace enrichBrandFromUrl. */
async function scrapeBrand(url: string, lang: 'es' | 'en', apiKey: string): Promise<ScrapedBrand> {
  const location = lang === 'en'
    ? { country: 'US', languages: ['en'] }
    : { country: 'CL', languages: ['es'] };

  const firecrawl = new FirecrawlApp({ apiKey });
  const scrapeOptions = { onlyMainContent: true, location };

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

  const raw = (jsonResult as { json?: unknown }).json as z.infer<typeof brandSchema> | undefined;
  const branding = (brandingResult as { branding?: unknown }).branding as Record<string, unknown> | undefined;
  const metadata = (brandingResult as { metadata?: unknown }).metadata as Record<string, unknown> | undefined;
  return { extracted: mapFirecrawlResult(raw, branding), logos: collectWebLogos(branding, metadata) };
}

export interface EnrichBrandResult {
  url: string;
  extracted: Partial<BrandKit>;
  /** Logos e íconos de la web, sin guardar todavía (storeWebLogos). */
  logos: WebLogo[];
}

/**
 * Lee la web y devuelve los campos del Brand Kit que se pudieron extraer.
 * No guarda nada: quien llama decide qué aplica (el wizard los enseña para
 * confirmar; el onboarding solo rellena los campos vacíos).
 *
 * Cuesta 1 crédito de texto, que se devuelve si Firecrawl falla.
 */
export async function enrichBrandFromUrl(
  ctx: ServiceContext,
  input: { url: unknown },
): Promise<EnrichBrandResult> {
  const url = validateWebsiteUrl(input.url, ctx.language);

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    // Configuración nuestra, no del usuario: que llegue a Sentry.
    reportError(new Error('FIRECRAWL_API_KEY no configurada'), { route: ENRICH_ROUTE, auth: ctx.auth });
    throw new ServiceError(
      'unavailable', 503,
      msg(ctx.language, 'La lectura de webs no está disponible ahora mismo.', 'Website import is not available right now.'),
    ).markReported();
  }

  const refund = await chargeOrThrow(ctx, 'text', ENRICH_ROUTE);
  try {
    const { extracted, logos } = await scrapeBrand(url, ctx.language, apiKey);
    return { url, extracted, logos };
  } catch (err) {
    await refund();
    reportError(err, { route: ENRICH_ROUTE, auth: ctx.auth, service: 'firecrawl', extra: { source: ctx.source } });
    throw new ServiceError(
      'provider_error', 502,
      msg(ctx.language, 'No pudimos leer esa web.', 'Failed to enrich URL'),
    ).markReported();
  }
}

// ─── Logos de la web a la biblioteca ─────────────────────────────────────────

/** Nombre de un logo importado: «Logo (acme.cl)», «Ícono (acme.cl)». */
export function webLogoLabel(logo: WebLogo, websiteUrl: string, lang: 'es' | 'en'): string {
  let host = '';
  try { host = new URL(websiteUrl).hostname.replace(/^www\./, ''); } catch { /* sin host */ }
  const base = logo.kind === 'logo' ? 'Logo' : msg(lang, 'Ícono', 'Icon');
  return host ? `${base} (${host})` : base;
}

/**
 * Guarda los logos de la web en la biblioteca de la marca y devuelve
 * `extracted` con logo_url apuntando a la copia de Kefy (si se pudo traer).
 * Sin descargas no hay créditos; un logo que falla se salta (ya lo reporta
 * media-ingest) y nunca tumba la lectura de la web.
 */
export async function storeWebLogos(
  ctx: ServiceContext,
  result: EnrichBrandResult,
): Promise<{ extracted: Partial<BrandKit>; imported: number }> {
  if (result.logos.length === 0) return { extracted: result.extracted, imported: 0 };
  try {
    const { imported } = await importBrandLogos(ctx, {
      logos: result.logos.map((l) => ({ url: l.url, label: webLogoLabel(l, result.url, ctx.language) })),
    });
    const extracted = { ...result.extracted };
    const main = imported.find((i) => i.url === result.extracted.logo_url) ?? imported.find((i) => i.asset.type === 'logo');
    if (main) extracted.logo_url = main.asset.public_url;
    return { extracted, imported: imported.filter((i) => !i.existing).length };
  } catch (err) {
    if (!(err instanceof ServiceError && err.reported)) {
      reportError(err, { route: ENRICH_ROUTE, auth: ctx.auth, extra: { fase: 'logos' } });
    }
    return { extracted: result.extracted, imported: 0 };
  }
}

// ─── Rellenar solo lo vacío ───────────────────────────────────────────────────

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

/**
 * Parche con los valores nuevos para los campos que el kit tiene vacíos: lo
 * que la persona ya escribió nunca se pisa. Cada campo pasa por el mismo
 * validador que PATCH /api/brand-kit, así que lo que la web devuelva con mala
 * forma (un color «rgb(…)», una URL rota) se descarta en vez de tumbar el
 * guardado entero.
 */
export function fillEmptyFields(kit: Partial<BrandKit>, candidate: Partial<BrandKit>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (isEmpty(value)) continue;
    if (!isEmpty((kit as Record<string, unknown>)[key])) continue;
    if (validateBrandKitUpdate({ [key]: value }) !== null) continue;
    patch[key] = value;
  }
  return patch;
}

export interface ImportBrandResult {
  url: string;
  /** Campos que estaban vacíos y se rellenaron. */
  filled: string[];
  /** Campos que la web traía pero ya tenían valor (no se tocaron). */
  kept: string[];
  /** Logos e íconos nuevos en la biblioteca de la marca. */
  logos_imported: number;
  kit: BrandKit;
}

/**
 * Lee la web, guarda sus logos en la biblioteca y en el Brand Kit los campos
 * que estaban vacíos. Lo usa la herramienta import_brand_from_website. El
 * control de rol (owner/admin) va en la herramienta, como en updateBrandKit.
 */
export async function importBrandFromWebsite(
  ctx: ServiceContext,
  input: { url: unknown },
): Promise<ImportBrandResult> {
  const enriched = await enrichBrandFromUrl(ctx, input);
  const { url } = enriched;
  const { extracted, imported } = await storeWebLogos(ctx, enriched);
  const { kit } = await getOrCreateBrandKit(ctx);
  const patch = fillEmptyFields(kit, { ...extracted, website_url: url });
  const filled = Object.keys(patch);
  const kept = Object.keys(extracted).filter((k) => !(k in patch));
  if (filled.length === 0) return { url, filled, kept, logos_imported: imported, kit };
  const { kit: updated } = await updateBrandKit(ctx, patch);
  return { url, filled, kept, logos_imported: imported, kit: updated };
}
