// ─── Vista 2 de MCP Apps: plan y producción de video ─────────────────────────
//
// buildVideoView arma lo que pinta la vista de video dentro del chat: el
// storyboard plano a plano, el costo de cada nivel de animación, el progreso
// de la producción y el video terminado. La llaman get_video_plan (con plan),
// produce_video y get_video_status (sin plan: solo el estado del trabajo, que
// la vista pide cada 5 s mientras corre). Ver docs/video-pipeline.md y
// docs/mcp-apps.md.
//
// Solo lee: el plan se compila igual que en get_video_plan (no cobra nada) y
// el estado se toma del resultado de la herramienta, que es la que avanza el
// trabajo.

import { absoluteUrl } from '@/lib/app-url';
import { itemLink } from '@/lib/assistant/links';
import { CREDIT_COSTS } from '@/lib/usage';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError } from '@/lib/services/errors';
import { loadOwnedItem } from '@/lib/services/ownership';
import {
  getVideoPlan, resolveVideoTarget, scriptForTarget, type VideoTarget,
} from '@/lib/services/video';
import { loadViewBrand, mapSlides, viewCreditsRemaining, type ViewPermissions } from '@/lib/services/content-view';
import { VIDEO_TOOLS } from '@/lib/video/tools';
import type { VideoToolName } from '@/lib/video/tools/types';
import type { VideoJobSnapshot } from '@/lib/video/engine';
import type { VideoScript } from '@/lib/video/script';
import {
  CONTENT_TYPES, MOTION_LEVELS, VIEW_VERSION,
  type ContentType, type Motion, type VideoPlanView, type VideoProductionView, type VideoShotView, type VideoView,
} from '@/lib/mcp-app/contract';

type ItemRow = {
  id: string; content_type: string; status: string; title: string | null; body: string | null;
  hashtags: string[] | null; image_url: string | null; video_url: string | null; render_status: string | null;
  slides: unknown; metadata: Record<string, unknown> | null; brand_id: string | null;
};

const ITEM_SELECT =
  'id, content_type, status, title, body, hashtags, image_url, video_url, render_status, slides, metadata, brand_id';

function toolLabel(tool: string, lang: 'es' | 'en'): string {
  const def = VIDEO_TOOLS[tool as VideoToolName];
  return def ? def.label[lang] : tool;
}

function asMotion(v: unknown): Motion {
  return (MOTION_LEVELS as readonly string[]).includes(v as string) ? (v as Motion) : 'key';
}

/** El estado del trabajo, con etiquetas legibles y el plano de cada paso. */
export function mapProduction(
  snap: VideoJobSnapshot | null | undefined,
  script: VideoScript | null,
  lang: 'es' | 'en',
): VideoProductionView | null {
  if (!snap) return null;
  const order = new Map((script?.scenes ?? []).map((s) => [s.id, s.order]));
  return {
    job_id: snap.job_id,
    status: snap.status,
    progress: Math.max(0, Math.min(1, Number(snap.progress) || 0)),
    video_url: snap.video_url ?? null,
    error: snap.error ?? null,
    motion: snap.motion,
    credits_estimate: snap.credits_estimate,
    steps: (snap.steps ?? []).map((s) => ({
      key: s.key,
      tool: s.tool,
      label: toolLabel(s.tool, lang),
      scene_order: s.scene_id ? order.get(s.scene_id) ?? null : null,
      status: s.status,
      error: s.error ?? null,
    })),
  };
}

/** Storyboard: un plano por escena, con su foto (si ya existe) y las herramientas que lo producen. */
export function mapShots(
  script: VideoScript,
  slides: unknown,
  steps: Array<{ tool: string; scene_order: number | null }>,
  fallbackImage: string | null,
): VideoShotView[] {
  const slideImages = mapSlides(slides).map((s) => s.image_url);
  const characters = new Map(script.characters.map((c) => [c.id, c.name]));
  return script.scenes.map((s, i) => {
    const tools = [...new Set(steps.filter((st) => st.scene_order === s.order).map((st) => st.tool))];
    const speaker = !s.speaker ? null : s.speaker === 'narrator' ? 'narrator' : characters.get(s.speaker) ?? s.speaker;
    return {
      order: s.order,
      kind: s.visual.kind,
      speaker,
      line: s.line,
      on_screen_text: s.on_screen_text,
      image_url: s.visual.image_url ?? slideImages[i] ?? (i === 0 ? fallbackImage : null),
      duration_seconds: Number.isFinite(s.duration_seconds) ? s.duration_seconds : null,
      tools,
    };
  });
}

export interface VideoViewInput {
  itemId: string;
  format?: 'reel' | 'story' | null;
  motion?: string | null;
  /** true en get_video_plan: compila el plan con sus costos. */
  withPlan: boolean;
  /** Estado que devolvió la herramienta (produce_video / get_video_status). */
  production?: VideoJobSnapshot | null;
  permissions: ViewPermissions;
}

export async function buildVideoView(ctx: ServiceContext, input: VideoViewInput): Promise<VideoView> {
  const lang = ctx.language;
  const item = await loadOwnedItem<ItemRow>(ctx, input.itemId, ITEM_SELECT);
  const contentType: ContentType = (CONTENT_TYPES as readonly string[]).includes(item.content_type)
    ? (item.content_type as ContentType)
    : 'post';
  const own = contentType === 'reel' || contentType === 'story' ? contentType : null;
  const format = input.format ?? own;

  // El destino del video: la propia pieza o su rendición en `format`.
  let target: VideoTarget | null = null;
  let script: VideoScript | null = null;
  let planError: VideoView['plan_error'] = null;
  if (format) {
    try {
      target = format === contentType
        ? {
            table: 'kefy_content_items', id: item.id, itemId: item.id, format,
            brandId: item.brand_id, slides: item.slides, metadata: item.metadata ?? {},
            videoUrl: item.video_url, renderStatus: item.render_status,
            title: item.title, hook: item.body, hashtags: item.hashtags,
          }
        : await resolveVideoTarget(ctx, item.id, format);
      script = scriptForTarget(target, lang);
    } catch (err) {
      if (!(err instanceof ServiceError)) throw err;
      planError = { code: err.code, message: err.message };
    }
  }
  const needsScript = format === 'story' && !!target && !script;

  let plan: VideoPlanView | null = null;
  let production = input.production;
  let remaining: number | null = null;
  if (input.withPlan && target && script) {
    try {
      const p = await getVideoPlan(ctx, { itemId: item.id, format, motion: input.motion });
      plan = {
        motion: asMotion(p.motion),
        credits: p.credits,
        credits_by_motion: { none: p.credits_by_motion.none, key: p.credits_by_motion.key, full: p.credits_by_motion.full },
        duration_seconds: p.script.duration_seconds,
        shots: mapShots(script, target.slides, p.steps, item.image_url),
        tools: p.tools.map((t) => ({ tool: t.tool, label: t.label, count: t.count, credits: t.credits })),
        notes: p.notes,
      };
      remaining = p.credits_remaining;
      if (production === undefined) production = p.production;
    } catch (err) {
      if (!(err instanceof ServiceError)) throw err;
      planError = { code: err.code, message: err.message };
    }
  }
  if (remaining === null) remaining = await viewCreditsRemaining(ctx);

  const prod = mapProduction(production ?? null, script, lang);
  const videoUrl = (prod?.status === 'done' ? prod.video_url : null) ?? target?.videoUrl ?? null;
  const hasVideo = !!videoUrl;

  return {
    kind: 'video',
    version: VIEW_VERSION,
    language: lang,
    brand: await loadViewBrand(ctx),
    item: {
      id: item.id,
      content_type: contentType,
      status: item.status,
      title: item.title,
      body: item.body,
      hashtags: Array.isArray(item.hashtags) ? item.hashtags.filter((h) => typeof h === 'string') : [],
      image_url: item.image_url,
      video_url: videoUrl,
      render_status: target?.renderStatus ?? item.render_status,
      link: absoluteUrl(itemLink(lang, item.id).href),
    },
    format,
    needs_script: needsScript,
    plan,
    plan_error: planError,
    production: prod,
    permissions: input.permissions,
    credits: { remaining, story_script: CREDIT_COSTS.text },
    actions: {
      approve: input.permissions.write && item.status === 'draft' && hasVideo,
      publish: input.permissions.publish && item.status === 'approved' && hasVideo,
    },
  };
}
