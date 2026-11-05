// ─── Contrato de las vistas MCP Apps ─────────────────────────────────────────
//
// Lo que el servidor MCP entrega a la vista de Kefy en
// `structuredContent.view` (ver docs/mcp-apps.md). Es el único acoplamiento
// entre el servidor y el bundle de mcp-app/: la vista importa estos tipos con
// `import type` (no arrastra código de servidor) y el servidor publica estos
// mismos esquemas como `outputSchema` de cada herramienta con vista.
//
// Cambiar la forma es un cambio que rompe la vista: subir VIEW_VERSION,
// actualizar mcp-app/ y los tests de contrato (tests/unit/lib/mcp-app/**).
//
// Todo el texto llega LIMPIO (sin el envoltorio <untrusted_content> que ve el
// modelo) y la vista lo pinta siempre como texto, nunca como HTML.
//
// Este módulo no importa nada de servidor: solo zod.

import { z } from 'zod';

export const VIEW_VERSION = 1 as const;

export const CONTENT_TYPES = ['post', 'carousel', 'reel', 'story'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const MOTION_LEVELS = ['none', 'key', 'full'] as const;
export type Motion = (typeof MOTION_LEVELS)[number];

const nullableString = z.string().nullable();

const BrandView = z.object({
  id: z.string(),
  name: nullableString,
  avatar_url: nullableString,
});

/** Qué puede hacer la conexión MCP con la que se abrió la vista (scopes). */
const Permissions = z.object({
  write: z.boolean(),
  publish: z.boolean(),
});

const ErrorInfo = z.object({ code: z.string(), message: z.string() });

// ─── Vista 1: revisor de contenido ───────────────────────────────────────────

export const SlideViewSchema = z.object({
  slide_order: z.number().nullable(),
  title: nullableString,
  body: nullableString,
  image_url: nullableString,
  duration_seconds: z.number().nullable(),
});

export const ScheduledPostViewSchema = z.object({
  id: z.string(),
  status: z.string(),
  scheduled_at: nullableString,
  published_at: nullableString,
  post_url: nullableString,
  platform: nullableString,
  username: nullableString,
});

/** Botones de la tarjeta. El servidor decide; la vista solo pinta lo que viene en true. */
export const ContentActionsSchema = z.object({
  approve: z.boolean(),
  unapprove: z.boolean(),
  archive: z.boolean(),
  edit: z.boolean(),
  regenerate_image: z.boolean(),
  convert: z.boolean(),
  /** Abre la Vista 2 (reel sin video, o story). */
  produce_video: z.boolean(),
  publish: z.boolean(),
});

/** Por qué no se ofrece publicar (para explicarlo en la tarjeta). */
export const PUBLISH_BLOCKS = ['not_approved', 'video_missing', 'no_publish_scope', 'status'] as const;

export const ContentItemViewSchema = z.object({
  id: z.string(),
  content_type: z.enum(CONTENT_TYPES),
  channel: nullableString,
  status: z.string(),
  title: nullableString,
  body: nullableString,
  hashtags: z.array(z.string()),
  image_url: nullableString,
  /** generating | ready | error | null */
  image_status: nullableString,
  image_error: ErrorInfo.nullable(),
  video_url: nullableString,
  /** rendering | ready | not_rendered | null */
  render_status: nullableString,
  slides: z.array(SlideViewSchema),
  scheduled_posts: z.array(ScheduledPostViewSchema),
  /** Versiones en otros formatos ya generadas (convert_content_format). */
  renditions: z.array(z.object({ format: z.enum(CONTENT_TYPES), status: nullableString })),
  /** Story: si ya tiene guion de video (prepare_story_video). Reel: si tiene escenas. */
  has_video_script: z.boolean(),
  created_at: nullableString,
  updated_at: nullableString,
  actions: ContentActionsSchema,
  publish_blocked: z.enum(PUBLISH_BLOCKS).nullable(),
  /** Tamaño que se propone al regenerar la imagen (9:16 en story y reel). */
  default_image_size: z.string(),
  /** Abrir en Kefy (URL absoluta del dashboard). */
  link: z.string(),
});

export const ContentViewSchema = z.object({
  kind: z.literal('content'),
  version: z.literal(VIEW_VERSION),
  language: z.enum(['es', 'en']),
  brand: BrandView,
  /** Una pieza, o las variantes de create_reel con variant_count > 1. */
  items: z.array(ContentItemViewSchema).min(1),
  variant_group_id: nullableString,
  permissions: Permissions,
  /** Costos en créditos que la vista muestra ANTES de cada acción que gasta. */
  credits: z.object({
    remaining: z.number().nullable(),
    image: z.number(),
    story_script: z.number(),
    convert: z.object({ post: z.number(), carousel: z.number(), reel: z.number(), story: z.number() }),
  }),
  image_sizes: z.array(z.string()),
});

// ─── Vista 2: plan y producción de video ─────────────────────────────────────

export const VideoStepViewSchema = z.object({
  key: z.string(),
  tool: z.string(),
  label: z.string(),
  scene_order: z.number().nullable(),
  /** pending | running | done | failed | skipped */
  status: z.string(),
  error: nullableString,
});

export const VideoProductionViewSchema = z.object({
  job_id: z.string(),
  /** running | done | failed | canceled */
  status: z.string(),
  progress: z.number(),
  video_url: nullableString,
  error: nullableString,
  motion: z.string(),
  credits_estimate: z.number(),
  steps: z.array(VideoStepViewSchema),
});

export const VideoShotViewSchema = z.object({
  order: z.number(),
  kind: z.string(),
  speaker: nullableString,
  line: nullableString,
  on_screen_text: nullableString,
  image_url: nullableString,
  duration_seconds: z.number().nullable(),
  /** Herramientas que producen el plano (generate_image, text_to_speech…). */
  tools: z.array(z.string()),
});

export const VideoPlanViewSchema = z.object({
  motion: z.enum(MOTION_LEVELS),
  credits: z.number(),
  credits_by_motion: z.object({ none: z.number(), key: z.number(), full: z.number() }),
  duration_seconds: z.number(),
  shots: z.array(VideoShotViewSchema),
  tools: z.array(z.object({ tool: z.string(), label: z.string(), count: z.number(), credits: z.number() })),
  notes: z.array(z.string()),
});

export const VideoViewSchema = z.object({
  kind: z.literal('video'),
  version: z.literal(VIEW_VERSION),
  language: z.enum(['es', 'en']),
  brand: BrandView,
  item: z.object({
    id: z.string(),
    content_type: z.enum(CONTENT_TYPES),
    status: z.string(),
    title: nullableString,
    body: nullableString,
    hashtags: z.array(z.string()),
    image_url: nullableString,
    video_url: nullableString,
    render_status: nullableString,
    link: z.string(),
  }),
  /** Formato que recibe el video; null si la pieza no es reel ni story. */
  format: z.enum(['reel', 'story']).nullable(),
  /** Story sin guion: hay que llamar antes a prepare_story_video (1 crédito). */
  needs_script: z.boolean(),
  /** null si no se pidió (polling de estado) o si no se pudo armar (plan_error). */
  plan: VideoPlanViewSchema.nullable(),
  plan_error: ErrorInfo.nullable(),
  production: VideoProductionViewSchema.nullable(),
  permissions: Permissions,
  credits: z.object({ remaining: z.number().nullable(), story_script: z.number() }),
  actions: z.object({ approve: z.boolean(), publish: z.boolean() }),
});

export type BrandViewT = z.infer<typeof BrandView>;
export type SlideView = z.infer<typeof SlideViewSchema>;
export type ScheduledPostView = z.infer<typeof ScheduledPostViewSchema>;
export type ContentActions = z.infer<typeof ContentActionsSchema>;
export type PublishBlock = (typeof PUBLISH_BLOCKS)[number];
export type ContentItemView = z.infer<typeof ContentItemViewSchema>;
export type ContentView = z.infer<typeof ContentViewSchema>;
export type VideoStepView = z.infer<typeof VideoStepViewSchema>;
export type VideoProductionView = z.infer<typeof VideoProductionViewSchema>;
export type VideoShotView = z.infer<typeof VideoShotViewSchema>;
export type VideoPlanView = z.infer<typeof VideoPlanViewSchema>;
export type VideoView = z.infer<typeof VideoViewSchema>;
export type AppView = ContentView | VideoView;

/** structuredContent de una herramienta con vista: el de siempre + `view`. */
export function structuredContentSchema(view: z.ZodType) {
  return z.object({
    data: z.unknown(),
    links: z.array(z.object({ label: z.string(), href: z.string() })).optional(),
    view: view.optional(),
  });
}
