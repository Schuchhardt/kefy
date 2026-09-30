// ─── Servicio: primeros posts de una cuenta nueva ────────────────────────────
//
// «Pega tu web o describe tu negocio → 3 posts». Antes, tras el registro, la
// cuenta caía en un modal de bienvenida y un wizard de 20 pasos: hacían falta
// más de 25 interacciones para ver el primer post, mientras la landing
// prometía verlos «en menos de un minuto» (docs/auditoria-ux.md §4.1).
//
// Pasos:
//   1. Si hay web, se lee con enrichBrandFromUrl (1 crédito, se devuelve si
//      falla). Si falla y hay descripción, se sigue con la descripción.
//   2. Se rellenan SOLO los campos vacíos del Brand Kit: nunca se pisa lo que
//      la persona ya escribió.
//   3. Se generan 3 posts en paralelo con generateTextPost (1 crédito cada
//      uno), cada uno con un enfoque distinto, como borradores.
//
// Las imágenes no se generan aquí: la página de onboarding las pide después,
// post a post, a POST /api/content/image. Así el texto aparece en segundos y
// ninguna petición se acerca al límite de duración de la función.

import { getOrCreateBrandKit, updateBrandKit } from '@/lib/services/brand-kit';
import { enrichBrandFromUrl, fillEmptyFields, validateWebsiteUrl } from '@/lib/services/brand-enrich';
import { generateTextPost } from '@/lib/services/content';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';
import { reportError } from '@/lib/observability';
import type { BrandKit } from '@/types/brand-kit';
import type { ContentChannel } from '@/types/ai';

export const ONBOARDING_ROUTE = 'POST /api/onboarding/starter';

/** Enfoques de los 3 posts, en el orden en que se muestran. */
export const STARTER_ANGLES = ['intro', 'tip', 'benefit'] as const;
export type StarterAngle = (typeof STARTER_ANGLES)[number];

export const DESCRIPTION_MAX = 500;

export interface StarterInput {
  /** Web del negocio. Opcional si hay descripción. */
  url?: string | null;
  /** El negocio en una frase. Opcional si hay web. */
  description?: string | null;
  /** Red para la que se escriben los posts. Por defecto, Instagram. */
  channel?: ContentChannel;
}

export interface StarterPost {
  id: string;
  angle: StarterAngle;
  body: string;
  hashtags: string[];
}

export interface StarterResult {
  brandName: string;
  /** Campos del Brand Kit que se rellenaron (estaban vacíos). */
  filled: string[];
  posts: StarterPost[];
  /** Posts que no se pudieron generar (los demás sí). */
  failed: number;
  /** La web no se pudo leer y se siguió con la descripción. */
  websiteError?: string;
}

// ─── Temas de los posts ───────────────────────────────────────────────────────

/** Lo que se sabe del negocio, en una línea para el prompt. */
function businessSummary(kit: Partial<BrandKit>, description: string | null, lang: 'es' | 'en'): string {
  const parts: string[] = [];
  const add = (es: string, en: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) parts.push(`${msg(lang, es, en)}: ${value.trim()}`);
  };
  add('Negocio', 'Business', kit.name);
  if (description) parts.push(`${msg(lang, 'Qué hace', 'What it does')}: ${description}`);
  else add('Qué hace', 'What it does', kit.mission);
  add('Sector', 'Industry', kit.industry);
  add('Nicho', 'Niche', kit.niche);
  add('Público', 'Audience', kit.target_audience);
  if (kit.differentiators?.length) {
    parts.push(`${msg(lang, 'Lo distingue', 'Differentiators')}: ${kit.differentiators.slice(0, 3).join(', ')}`);
  }
  if (kit.customer_locations?.length) {
    parts.push(`${msg(lang, 'Dónde', 'Where')}: ${kit.customer_locations.slice(0, 3).join(', ')}`);
  }
  return parts.join('. ');
}

/**
 * Tema de cada post. generateTextPost recorta el tema a 500 caracteres, así
 * que el resumen del negocio va después de la instrucción del enfoque.
 */
export function starterTopic(angle: StarterAngle, summary: string, lang: 'es' | 'en'): string {
  const lead: Record<StarterAngle, string> = {
    intro: msg(lang,
      'Post de presentación: cuenta qué hace este negocio y para quién, en tono cercano, con una invitación a seguir la cuenta.',
      'Introduction post: say what this business does and who it is for, in a warm tone, inviting people to follow the account.'),
    tip: msg(lang,
      'Post de valor: un consejo práctico y concreto que le sirva a su público, relacionado con lo que hace el negocio. Sin vender directamente.',
      'Value post: one practical, specific tip that helps its audience, related to what the business does. No hard selling.'),
    benefit: msg(lang,
      'Post de beneficio: por qué elegir este negocio (su diferencia principal) y una llamada a la acción clara.',
      'Benefit post: why choose this business (its main difference) and a clear call to action.'),
  };
  return `${lead[angle]} ${summary}`.slice(0, 500);
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

/** Errores que no tiene sentido esquivar: sin cuota o sin permiso nada más va a funcionar. */
const BLOCKING_CODES = new Set(['invalid_input', 'subscription_required', 'credits_exhausted', 'rate_limited']);

export async function createStarterPosts(ctx: ServiceContext, input: StarterInput): Promise<StarterResult> {
  const lang = ctx.language;
  const description = typeof input.description === 'string'
    ? input.description.trim().slice(0, DESCRIPTION_MAX) || null
    : null;
  const rawUrl = typeof input.url === 'string' && input.url.trim() ? input.url.trim() : null;

  if (!rawUrl && !description) {
    throw new ServiceError('invalid_input', 400, msg(lang,
      'Pega la web de tu negocio o descríbelo en una frase.',
      'Paste your business website or describe it in one sentence.'));
  }
  // Una URL mal escrita se rechaza antes de gastar nada.
  const url = rawUrl ? validateWebsiteUrl(rawUrl, lang) : null;

  const { kit } = await getOrCreateBrandKit(ctx);

  // 1. Web
  let extracted: Partial<BrandKit> = {};
  let websiteError: string | undefined;
  if (url) {
    try {
      extracted = (await enrichBrandFromUrl(ctx, { url })).extracted;
    } catch (err) {
      // URL inválida, sin suscripción o sin créditos: nada más va a funcionar.
      if (!(err instanceof ServiceError) || BLOCKING_CODES.has(err.code)) throw err;
      // La web no se pudo leer (ya está en Sentry). Con descripción se sigue;
      // sin ella se pide, en vez de un error sin salida.
      if (!description) {
        const unreadable = msg(lang,
          'No pudimos leer tu web. Describe tu negocio en una frase y lo intentamos con eso.',
          "We couldn't read your website. Describe your business in one sentence and we'll use that.");
        throw new ServiceError('provider_error', 502, unreadable, { error: unreadable, websiteUnreadable: true })
          .markReported();
      }
      websiteError = err.message;
    }
  }

  // 2. Brand Kit: solo lo vacío
  const candidate: Partial<BrandKit> = { ...extracted };
  if (url) candidate.website_url = url;
  if (description) candidate.mission = description;
  const patch = fillEmptyFields(kit, candidate);

  let current: Partial<BrandKit> = kit;
  if (Object.keys(patch).length > 0) {
    try {
      current = (await updateBrandKit(ctx, patch)).kit;
    } catch (err) {
      // Sin el guardado los posts salen igual (el resumen lleva lo extraído):
      // no se pierde la generación por esto.
      if (!(err instanceof ServiceError && err.reported)) {
        reportError(err, { route: ONBOARDING_ROUTE, auth: ctx.auth, extra: { fase: 'brand kit' } });
      }
      current = { ...kit, ...patch };
    }
  }

  // 3. Tres posts en paralelo
  const summary = businessSummary({ ...extracted, ...current }, description, lang);
  const channel: ContentChannel = input.channel ?? 'instagram';
  const settled = await Promise.allSettled(
    STARTER_ANGLES.map((angle) =>
      generateTextPost(ctx, { topic: starterTopic(angle, summary, lang), channel, model: 'claude', save: true })
        .then((out) => ({ angle, out })),
    ),
  );

  const posts: StarterPost[] = [];
  let firstError: unknown = null;
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value.out.itemId) {
      posts.push({
        id: r.value.out.itemId,
        angle: r.value.angle,
        body: r.value.out.result.body ?? '',
        hashtags: r.value.out.result.hashtags ?? [],
      });
    } else if (r.status === 'rejected' && firstError === null) {
      firstError = r.reason;
    }
  }

  // Si no salió ninguno, el error del primero explica por qué (créditos,
  // suscripción, proveedor…) con el mismo cuerpo que la ruta de generar.
  if (posts.length === 0) {
    throw firstError ?? new ServiceError('provider_error', 502, 'AI generation failed');
  }

  return {
    brandName: current.name ?? extracted.name ?? '',
    filled: Object.keys(patch),
    posts,
    failed: STARTER_ANGLES.length - posts.length,
    websiteError,
  };
}
