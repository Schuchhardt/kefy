// ─── Servicio: producción de video ────────────────────────────────────────────
//
// Las tres capacidades del pipeline de video, compartidas por la UI, el chat
// del asistente, la API REST y el MCP (regla de AGENTS.md):
//
//   getVideoPlan       — lista las herramientas que va a correr el guion y su
//                        costo, sin gastar nada. Es lo que se le muestra al
//                        usuario antes de producir (openfilm pide confirmación
//                        antes de cada clip de video; aquí se confirma el plan
//                        entero de una vez).
//   produceVideo       — cobra el montaje, crea el trabajo y sus pasos.
//   getVideoProduction — da una vuelta al motor y devuelve el estado.
//
// El guion vive en `metadata.video_script` de la pieza (o de su rendición).
// Las piezas anteriores al pipeline no lo tienen: se arma uno desde sus
// escenas (`scriptFromSlides`) cuando se pide producirlas.

import { randomUUID } from 'node:crypto';
import { createSupabaseServer } from '@/lib/supabase';
import { getUsage } from '@/lib/usage';
import { reportError } from '@/lib/observability';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, chargeOrThrow, msg } from '@/lib/services/errors';
import { loadOwnedItem } from '@/lib/services/ownership';
import { getBrandKitForBrand } from '@/lib/services/brand-kit';
import { pickMusicTrack } from '@/remotion/audio-tracks';
import type { RenderTable } from '@/lib/reel-render';
import {
  mergeSlideEdits, readVideoScript, scriptFromSlides, type VideoScript,
} from '@/lib/video/script';
import {
  compileVideoPlan, MOTION_LEVELS, type MotionLevel, type PlanNote, type VideoPlan,
} from '@/lib/video/plan';
import { VIDEO_TOOLS, speechInClipAvailable } from '@/lib/video/tools';
import { resolveFilmTheme, voiceAccent, type VideoBrandKit } from '@/lib/video/brand';
import { isKefyStorageUrl } from '@/lib/assistant/url-allowlist';
import type { VideoToolName } from '@/lib/video/tools/types';
import {
  advanceVideoJob, cancelVideoJob, createVideoJob, latestJobFor, snapshotOf, VideoJobConflictError,
  type JobRow, type RenderContext, type StepRow, type VideoJobSnapshot,
} from '@/lib/video/engine';

const ROUTE = 'lib/services/video';
/** Presupuesto de una vuelta pedida por el reproductor o el asistente. */
const POLL_BUDGET_MS = 20 * 1000;

export type VideoFormat = 'reel' | 'story';

export interface VideoTarget {
  table:        RenderTable;
  id:           string;
  itemId:       string;
  format:       VideoFormat;
  brandId:      string | null;
  slides:       unknown;
  metadata:     Record<string, unknown>;
  videoUrl:     string | null;
  renderStatus: string | null;
  title:        string | null;
  hook:         string | null;
  hashtags:     string[] | null;
}

type ItemRow = {
  id: string; content_type: string; brand_id: string | null; slides: unknown; metadata: Record<string, unknown> | null;
  video_url: string | null; render_status: string | null; title: string | null; body: string | null; hashtags: string[] | null;
};

/** El item o la rendición en `format` que recibe el video. */
export async function resolveVideoTarget(
  ctx: ServiceContext,
  itemId: string,
  format?: string | null,
): Promise<VideoTarget> {
  const item = await loadOwnedItem<ItemRow>(
    ctx, itemId,
    'id, content_type, brand_id, slides, metadata, video_url, render_status, title, body, hashtags',
  );
  const effective = format || item.content_type;
  if (effective !== 'reel' && effective !== 'story') {
    throw new ServiceError('invalid_input', 422, msg(ctx.language,
      'Solo los reels y las stories se producen como video.',
      'Only reels and stories are produced as video.'));
  }

  if (effective === item.content_type) {
    return {
      table: 'kefy_content_items', id: item.id, itemId: item.id, format: effective,
      brandId: item.brand_id, slides: item.slides, metadata: item.metadata ?? {},
      videoUrl: item.video_url, renderStatus: item.render_status,
      title: item.title, hook: item.body, hashtags: item.hashtags,
    };
  }

  const db = createSupabaseServer();
  const { data: rendition } = await db
    .from('kefy_content_renditions')
    .select('id, slides, metadata, video_url, render_status')
    .eq('content_item_id', item.id)
    .eq('format', effective)
    .maybeSingle();
  if (!rendition) throw new ServiceError('not_found', 404, 'Content item or rendition not found');
  return {
    table: 'kefy_content_renditions', id: rendition.id as string, itemId: item.id, format: effective,
    brandId: item.brand_id, slides: rendition.slides, metadata: (rendition.metadata ?? {}) as Record<string, unknown>,
    videoUrl: (rendition.video_url as string | null) ?? null, renderStatus: (rendition.render_status as string | null) ?? null,
    title: item.title, hook: item.body, hashtags: item.hashtags,
  };
}

/**
 * Guion vigente de la pieza, con las ediciones de sus escenas aplicadas. Solo
 * se reutilizan fotos del Storage de Kefy: una URL cualquiera pegada en una
 * escena no se manda a fal.ai ni a Lambda (SSRF).
 */
export function scriptForTarget(target: VideoTarget, language: 'es' | 'en'): VideoScript | null {
  const opts = { isReusableImage: isKefyStorageUrl };
  const stored = readVideoScript(target.metadata);
  if (stored) return mergeSlideEdits(stored, target.slides, opts);
  return scriptFromSlides(target.slides, language, { title: target.title, hook: target.hook, hashtags: target.hashtags }, opts);
}

/** Lo que cambia el video: si difiere, una producción en curso ya no sirve. */
function scriptFingerprint(script: VideoScript): string {
  return JSON.stringify(script.scenes.map((s) => [s.id, s.line, s.on_screen_text, s.speaker, s.visual.kind, s.visual.image_prompt]));
}

function capabilities() {
  return {
    animation: VIDEO_TOOLS.animate_image.available(),
    lipsync:   VIDEO_TOOLS.lip_sync.available(),
    images:    VIDEO_TOOLS.generate_image.available(),
    voice:     VIDEO_TOOLS.text_to_speech.available(),
    speech_in_clip: speechInClipAvailable(),
  };
}

type KitRow = VideoBrandKit;

async function brandKitFor(ctx: ServiceContext, target: VideoTarget): Promise<KitRow | null> {
  const brandId = target.brandId ?? ctx.brandId;
  if (!brandId) return null;
  const { data } = await getBrandKitForBrand(createSupabaseServer(), brandId);
  return (data as KitRow | null) ?? null;
}

/** Opciones de imagen que se pidieron al crear el reel (metadata.video_options). */
function videoOptions(target: VideoTarget): {
  image_quality?: 'low' | 'medium' | 'high'; reference_image_urls?: string[]; generate_images?: boolean;
} {
  const o = target.metadata.video_options as Record<string, unknown> | undefined;
  if (!o || typeof o !== 'object') return {};
  const q = o.image_quality;
  return {
    generate_images: o.generate_images === false ? false : undefined,
    image_quality: q === 'low' || q === 'medium' || q === 'high' ? q : undefined,
    reference_image_urls: Array.isArray(o.reference_image_urls)
      ? o.reference_image_urls.filter((u): u is string => typeof u === 'string' && u.startsWith('https://'))
      : undefined,
  };
}

function compile(script: VideoScript, motion: MotionLevel, kit: KitRow | null, target: VideoTarget): VideoPlan {
  return compileVideoPlan(script, {
    ...videoOptions(target),
    motion,
    capabilities: capabilities(),
    voice_accent: voiceAccent(kit, script.language),
    brand: {
      name:           kit?.name ?? undefined,
      primaryColor:   kit?.primary_color ?? undefined,
      secondaryColor: kit?.secondary_color ?? undefined,
      accentColor:    kit?.accent_color ?? undefined,
    },
  });
}

function parseMotion(v: unknown): MotionLevel {
  return (MOTION_LEVELS as readonly string[]).includes(v as string) ? (v as MotionLevel) : 'key';
}

// ─── Plan ────────────────────────────────────────────────────────────────────

export interface PlanStepView {
  key:         string;
  tool:        VideoToolName;
  label:       string;
  provider:    string;
  scene_order: number | null;
  /** Qué hace este paso concreto: la línea que se dice, lo que se anima… */
  detail:      string;
  credits:     number;
  depends_on:  string[];
  optional:    boolean;
}

export interface VideoPlanView {
  item_id:        string;
  format:         VideoFormat;
  motion:         MotionLevel;
  credits:        number;
  /** Lo que costaría con cada nivel de animación, para elegir antes de producir. */
  credits_by_motion: Record<MotionLevel, number>;
  credits_remaining: number;
  tools: Array<{ tool: VideoToolName; label: string; summary: string; count: number; credits: number }>;
  steps:          PlanStepView[];
  notes:          string[];
  script: {
    title:    string;
    duration_seconds: number;
    scenes:   Array<{ order: number; kind: string; speaker: string | null; line: string | null; on_screen_text: string | null }>;
    characters: Array<{ id: string; name: string }>;
  };
  /** Producción en curso o terminada de esta pieza, si hay. */
  production:     VideoJobSnapshot | null;
}

function stepDetail(script: VideoScript, step: VideoPlan['steps'][number], lang: 'es' | 'en'): string {
  const scene = script.scenes.find((s) => s.id === step.scene_id);
  switch (step.tool) {
    case 'generate_image':
      if (!scene) {
        const c = script.characters.find((ch) => `char_${ch.id}` === step.key);
        return c ? msg(lang, `Retrato de referencia de ${c.name}`, `Reference portrait of ${c.name}`) : '';
      }
      return scene.visual.image_prompt.slice(0, 140);
    case 'text_to_speech': {
      const speaker = scene?.speaker === 'narrator' || !scene?.speaker
        ? msg(lang, 'Narrador', 'Narrator')
        : script.characters.find((c) => c.id === scene.speaker)?.name ?? scene.speaker;
      return `${speaker}: «${scene?.line ?? ''}»`;
    }
    case 'animate_image':
      return String(step.input.prompt ?? '').slice(0, 140);
    case 'lip_sync':
      return msg(lang, 'Labios sincronizados con la línea del plano', 'Lips synced to the shot line');
    case 'compose_video':
      return msg(lang,
        `${script.scenes.length} planos, subtítulos, música y logo`,
        `${script.scenes.length} shots, subtitles, music and logo`);
  }
}

function noteText(notes: PlanNote[], lang: 'es' | 'en'): string[] {
  return notes.map((n) => n[lang]);
}

export async function getVideoPlan(
  ctx: ServiceContext,
  input: { itemId: string; format?: string | null; motion?: string | null },
): Promise<VideoPlanView> {
  const target = await resolveVideoTarget(ctx, input.itemId, input.format);
  const script = scriptForTarget(target, ctx.language);
  if (!script) {
    throw new ServiceError('invalid_input', 422, msg(ctx.language,
      'Esta pieza no tiene guion ni escenas para producir un video.',
      'This item has no script or scenes to produce a video from.'));
  }
  const kit    = await brandKitFor(ctx, target);
  const motion = parseMotion(input.motion);
  const plan   = compile(script, motion, kit, target);
  const lang   = ctx.language;
  const order  = new Map(script.scenes.map((s) => [s.id, s.order]));

  const db = createSupabaseServer();
  const [usage, job] = await Promise.all([
    getUsage(ctx.auth.orgId, ctx.auth.plan),
    latestJobFor(db, target.table, target.id),
  ]);

  return {
    item_id: target.itemId,
    format:  target.format,
    motion,
    credits: plan.credits,
    credits_by_motion: Object.fromEntries(
      MOTION_LEVELS.map((m) => [m, m === motion ? plan.credits : compile(script, m, kit, target).credits]),
    ) as Record<MotionLevel, number>,
    credits_remaining: usage.remaining,
    tools: Object.entries(plan.by_tool).map(([tool, v]) => ({
      tool:    tool as VideoToolName,
      label:   VIDEO_TOOLS[tool as VideoToolName].label[lang],
      summary: VIDEO_TOOLS[tool as VideoToolName].summary[lang],
      count:   v!.count,
      credits: v!.credits,
    })),
    steps: plan.steps.map((s) => ({
      key:         s.key,
      tool:        s.tool,
      label:       VIDEO_TOOLS[s.tool].label[lang],
      provider:    VIDEO_TOOLS[s.tool].provider,
      scene_order: s.scene_id ? order.get(s.scene_id) ?? null : null,
      detail:      stepDetail(script, s, lang),
      credits:     plan.by_tool[s.tool]!.credits / plan.by_tool[s.tool]!.count,
      depends_on:  s.depends_on,
      optional:    s.optional,
    })),
    notes: noteText(plan.notes, lang),
    script: {
      title: script.title,
      duration_seconds: Math.round(script.scenes.reduce((acc, s) => acc + s.duration_seconds, 0)),
      scenes: script.scenes.map((s) => ({
        order: s.order, kind: s.visual.kind, speaker: s.speaker, line: s.line, on_screen_text: s.on_screen_text,
      })),
      characters: script.characters.map((c) => ({ id: c.id, name: c.name })),
    },
    production: job ? await jobSnapshot(job) : null,
  };
}

// ─── Producir ────────────────────────────────────────────────────────────────

export async function produceVideo(
  ctx: ServiceContext,
  input: { itemId: string; format?: string | null; motion?: string | null; force?: boolean },
): Promise<VideoJobSnapshot> {
  const target = await resolveVideoTarget(ctx, input.itemId, input.format);
  const db = createSupabaseServer();

  const script = scriptForTarget(target, ctx.language);
  if (!script) {
    throw new ServiceError('invalid_input', 422, msg(ctx.language,
      'Esta pieza no tiene guion ni escenas para producir un video.',
      'This item has no script or scenes to produce a video from.'));
  }

  const motion = parseMotion(input.motion);

  // Un trabajo en curso con el mismo guion y la misma animación no se
  // duplica: se devuelve su estado. Si cambió algo (el usuario editó una
  // escena o eligió otro nivel de animación), ese trabajo ya no sirve y se
  // reemplaza — pero recién después de validar y cobrar el nuevo: un 409 o
  // un 429 no puede dejar la pieza sin ninguna producción.
  const current = await latestJobFor(db, target.table, target.id);
  let superseded: JobRow | null = null;
  if (current?.status === 'running') {
    if (scriptFingerprint(current.script) === scriptFingerprint(script) && current.motion === motion) {
      const snap = await advanceVideoJob(db, current.id, { budgetMs: 0 });
      if (snap) return snap;
    } else {
      superseded = current;
    }
  }
  if (target.videoUrl && !input.force) {
    throw new ServiceError('conflict', 409, msg(ctx.language,
      'Esta pieza ya tiene video. Pide producirlo de nuevo para reemplazarlo.',
      'This item already has a video. Ask to produce it again to replace it.'),
      { error: 'already_rendered', video_url: target.videoUrl });
  }

  // Sin montaje no hay video: no se cobra ningún paso si Lambda no está.
  if (!VIDEO_TOOLS.compose_video.available()) {
    throw new ServiceError('unavailable', 503, msg(ctx.language,
      'La producción de video no está disponible en este momento.',
      'Video production is not available right now.'));
  }

  const kit  = await brandKitFor(ctx, target);
  const plan = compile(script, motion, kit, target);

  // Antes de cobrar nada: que el plan entero quepa en lo que queda del mes.
  // Un video a medio producir porque se acabaron los créditos al tercer paso
  // es peor que avisar antes y proponer menos animación.
  const usage = await getUsage(ctx.auth.orgId, ctx.auth.plan);
  if (usage.remaining < plan.credits) {
    throw new ServiceError('credits_exhausted', 429, msg(ctx.language,
      `Este video necesita ${plan.credits} créditos y te quedan ${usage.remaining}. Prueba con menos animación o mejora tu plan.`,
      `This video needs ${plan.credits} credits and you have ${usage.remaining} left. Try less animation or upgrade your plan.`),
      { error: 'credits_exhausted', creditsExhausted: true, required: plan.credits, remaining: usage.remaining });
  }

  // El montaje (render en Lambda) pasa por la guardia de siempre:
  // suscripción → rate limit → créditos. El resto se cobra paso a paso.
  const refund = await chargeOrThrow(ctx, 'video', ROUTE);

  // Diseño y música de marca, resueltos ahora: editar el Brand Kit a mitad
  // de la producción no cambia un video que ya se está haciendo.
  const renderContext: RenderContext = {
    plan:       ctx.auth.plan,
    theme:      resolveFilmTheme(kit),
    musicTrack: pickMusicTrack(target.id, [script.music_mood, ...(kit?.tone ?? [])].filter(Boolean).join(' ')),
  };

  // El trabajo viejo se cancela (y devuelve lo que no llegó a hacer) antes de
  // crear el nuevo: el índice único solo deja uno en curso por pieza.
  if (superseded) await cancelVideoJob(db, { id: superseded.id, org_id: ctx.auth.orgId }, 'superseded');

  // La pieza apunta al trabajo nuevo antes de que exista: así ninguna vuelta
  // del motor (cron, polling) lo ve sin dueño y lo cancela como reemplazado.
  const jobId = randomUUID();
  const previousJobId = typeof target.metadata.video_job_id === 'string' ? target.metadata.video_job_id : null;
  await db.from(target.table).update({
    metadata: { ...target.metadata, video_script: script, video_job_id: jobId },
  }).eq('id', target.id);

  try {
    await createVideoJob(db, {
      id: jobId,
      orgId: ctx.auth.orgId, brandId: target.brandId, userId: ctx.auth.userId ?? null,
      target: { table: target.table, id: target.id }, script, plan, renderContext,
    });
  } catch (err) {
    await refund();
    // Dos «Producir» a la vez (doble clic, el asistente y la UI): el índice
    // único deja pasar uno solo, y el otro devuelve ese mismo trabajo. La
    // pieza apunta al que ganó; si no hubo carrera, a lo que tenía antes.
    const running = err instanceof VideoJobConflictError ? await latestJobFor(db, target.table, target.id) : null;
    const owner = running?.status === 'running' ? running.id : previousJobId;
    await db.from(target.table).update({
      metadata: { ...target.metadata, video_script: script, video_job_id: owner },
    }).eq('id', target.id);
    if (running) {
      const snap = await advanceVideoJob(db, running.id, { budgetMs: 0 });
      if (snap) return snap;
    }
    reportError(err, { route: ROUTE, auth: ctx.auth, service: 'supabase', extra: { itemId: target.itemId } });
    throw new ServiceError('unavailable', 500, msg(ctx.language,
      'No se pudo iniciar la producción del video.', 'Could not start the video production.')).markReported();
  }

  // El video anterior (si se pidió reemplazarlo) se queda hasta que el nuevo
  // exista: si la producción falla, la pieza sigue teniendo uno publicable.
  await db.from(target.table).update({
    render_status: 'rendering',
    metadata:      { ...target.metadata, video_script: script, video_job_id: jobId },
  }).eq('id', target.id);

  // Vuelta sin presupuesto: solo arma el estado y responde enseguida. Los
  // pasos los lanzan el polling del reproductor, el cron y los webhooks.
  const snap = await advanceVideoJob(db, jobId, { budgetMs: 0 });
  if (!snap) throw new ServiceError('unavailable', 500, 'Video job vanished');
  return snap;
}

// ─── Estado ──────────────────────────────────────────────────────────────────

/** Da una vuelta al trabajo más reciente de la pieza. null si nunca se produjo. */
export async function getVideoProduction(
  ctx: ServiceContext,
  input: { itemId: string; format?: string | null; advance?: boolean; budgetMs?: number },
): Promise<VideoJobSnapshot | null> {
  const target = await resolveVideoTarget(ctx, input.itemId, input.format);
  const db = createSupabaseServer();
  const job = await latestJobFor(db, target.table, target.id);
  if (!job) return null;
  if (input.advance === false || job.status !== 'running') return jobSnapshot(job);
  // Vuelta corta: los pasos que lance terminan igual (una imagen tarda lo que
  // tarde), pero no se encadenan rondas mientras el cliente espera.
  return advanceVideoJob(db, job.id, { budgetMs: input.budgetMs ?? POLL_BUDGET_MS });
}

async function jobSnapshot(job: JobRow): Promise<VideoJobSnapshot> {
  const { data: steps } = await createSupabaseServer().from('kefy_video_steps').select('*').eq('job_id', job.id);
  return snapshotOf(job, (steps ?? []) as StepRow[]);
}
