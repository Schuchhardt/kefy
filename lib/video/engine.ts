// ─── Motor de producción de video ─────────────────────────────────────────────
//
// Ejecuta el plan de un video (lib/video/plan.ts) paso a paso, fuera de
// cualquier request concreto. No hay un proceso de fondo: `advanceVideoJob`
// da una «vuelta» al trabajo y lo deja donde quedó. La llaman:
//
//   - el polling del reproductor (GET /api/content/reel/render),
//   - el cron de reconciliación (cada 5 min, por si nadie mira),
//   - el webhook de fal.ai cuando termina una animación o un lipsync.
//
// En cada vuelta:
//   1. Consulta los pasos asíncronos en curso (fal.ai, Lambda).
//   2. Lanza los pasos cuyas dependencias ya terminaron. Cada paso se
//      reclama con un UPDATE condicional (pending → running), así dos vueltas
//      simultáneas no lo disparan dos veces.
//   3. Si el montaje terminó, escribe el video en la pieza.
//
// Créditos: cada paso se cobra al lanzarlo y se devuelve si falla del todo
// (un fallo nuestro no se le cobra al usuario). El montaje ya viene cobrado
// desde que se creó el trabajo (pasó por guardAiRequest).
//
// Ningún paso salvo el montaje es imprescindible: si una animación falla, el
// plano sale como foto con movimiento; si falla una imagen, con el fondo de
// marca. El video siempre sale (lib/video/timeline.ts).

import { createHmac, timingSafeEqual } from 'node:crypto';
import { consumeCredits, refundCredits } from '@/lib/usage';
import { reportError, reportWarning } from '@/lib/observability';
import { appUrl } from '@/lib/app-url';
import { getVideoTool, type ToolResult, type ToolRunContext } from '@/lib/video/tools';
import { TOOL_CREDIT_OPERATION, type VideoToolName } from '@/lib/video/tools/types';
import { COMPOSE_STEP_KEY, resolveRefs, type MotionLevel, type VideoPlan } from '@/lib/video/plan';
import { buildFilmProps, sceneImageUrls, type StepOutputs } from '@/lib/video/timeline';
import type { FilmTheme } from '@/remotion/film-types';
import { scriptToReelScenes, type VideoScript } from '@/lib/video/script';
import { resolveFilmTheme } from '@/lib/video/brand';
import type { RenderTable } from '@/lib/reel-render';

/** Intentos por paso antes de darlo por fallido. */
export const MAX_STEP_ATTEMPTS = 2;
/** Un paso síncrono «running» más viejo que esto murió con su función. */
export const SYNC_STEP_STALE_MS = 4 * 60 * 1000;
/** Un trabajo en la nube que no termina en este tiempo no va a terminar. */
export const ASYNC_STEP_TIMEOUT_MS = 30 * 60 * 1000;
/** Pasos síncronos lanzados a la vez en una vuelta (límite de OpenAI y de tiempo). */
const MAX_PARALLEL = 6;
/** Tras esto, la vuelta deja de lanzar pasos nuevos (la función tiene tope). */
const DEFAULT_BUDGET_MS = 150 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type JobStatus  = 'running' | 'done' | 'failed' | 'canceled';

export interface StepRow {
  id:          string;
  job_id:      string;
  org_id:      string;
  key:         string;
  tool:        VideoToolName;
  scene_id:    string | null;
  input:       Record<string, unknown>;
  depends_on:  string[];
  optional:    boolean;
  status:      StepStatus;
  output:      Record<string, unknown> | null;
  handle:      Record<string, unknown> | null;
  attempts:    number;
  charged:     boolean;
  error:       string | null;
  started_at:  string | null;
}

export interface RenderContext {
  plan:        string;
  /** Diseño de marca resuelto al crear el trabajo (lib/video/brand.ts). */
  theme:       FilmTheme;
  musicTrack?: string;
}

export interface JobRow {
  id:               string;
  org_id:           string;
  target_table:     RenderTable;
  target_id:        string;
  status:           JobStatus;
  motion:           MotionLevel;
  script:           VideoScript;
  render_context:   RenderContext;
  credits_estimate: number;
  video_url:        string | null;
  error:            string | null;
}

export interface StepView {
  key:      string;
  tool:     VideoToolName;
  scene_id: string | null;
  status:   StepStatus;
  error:    string | null;
}

export interface VideoJobSnapshot {
  job_id:           string;
  status:           JobStatus;
  /** 0–1, para la barra del reproductor. */
  progress:         number;
  video_url:        string | null;
  error:            string | null;
  credits_estimate: number;
  motion:           MotionLevel;
  steps:            StepView[];
}

const TERMINAL: ReadonlySet<StepStatus> = new Set(['done', 'failed', 'skipped']);

// ─── Webhooks ────────────────────────────────────────────────────────────────

function webhookSecret(): string | null {
  return process.env.VIDEO_WEBHOOK_SECRET ?? process.env.CRON_SECRET ?? null;
}

export function signStep(stepId: string): string | null {
  const secret = webhookSecret();
  return secret ? createHmac('sha256', secret).update(`video-step:${stepId}`).digest('hex') : null;
}

export function verifyStepSignature(stepId: string, sig: string): boolean {
  const expected = signStep(stepId);
  if (!expected || sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

function webhookUrlFor(stepId: string): string | undefined {
  const sig = signStep(stepId);
  return sig ? `${appUrl()}/api/webhooks/video?step=${stepId}&sig=${sig}` : undefined;
}

// ─── Creación ────────────────────────────────────────────────────────────────

/** Ya hay un trabajo en curso para esa pieza (índice único parcial). */
export class VideoJobConflictError extends Error {
  constructor() {
    super('A video job is already running for this target');
    this.name = 'VideoJobConflictError';
  }
}

export interface CreateJobInput {
  /** Id fijado por quien llama: la pieza ya apunta a él antes de que exista el trabajo. */
  id?:            string;
  orgId:          string;
  brandId:        string | null;
  userId:         string | null;
  target:         { table: RenderTable; id: string };
  script:         VideoScript;
  plan:           VideoPlan;
  renderContext:  RenderContext;
}

/**
 * Crea el trabajo y sus pasos. El paso de montaje nace con `charged: true`:
 * quien llama ya cobró el render con guardAiRequest.
 */
export async function createVideoJob(db: Db, input: CreateJobInput): Promise<string> {
  const { data: job, error } = await db
    .from('kefy_video_jobs')
    .insert({
      ...(input.id ? { id: input.id } : {}),
      org_id:           input.orgId,
      brand_id:         input.brandId,
      created_by:       input.userId,
      target_table:     input.target.table,
      target_id:        input.target.id,
      status:           'running',
      motion:           input.plan.motion,
      script:           input.script,
      render_context:   input.renderContext,
      credits_estimate: input.plan.credits,
      video_url:        null,
      error:            null,
    })
    .select('id')
    .single();
  if (error?.code === '23505') throw new VideoJobConflictError();
  if (error || !job) throw new Error(`No se pudo crear el trabajo de video: ${error?.message ?? 'sin fila'}`);

  const { error: stepsError } = await db.from('kefy_video_steps').insert(
    input.plan.steps.map((s) => ({
      job_id:     job.id,
      org_id:     input.orgId,
      key:        s.key,
      tool:       s.tool,
      scene_id:   s.scene_id,
      input:      s.input,
      depends_on: s.depends_on,
      optional:   s.optional,
      status:     'pending',
      output:     null,
      handle:     null,
      attempts:   0,
      error:      null,
      started_at: null,
      charged:    s.key === COMPOSE_STEP_KEY,
    })),
  );
  if (stepsError) {
    await db.from('kefy_video_jobs').update({ status: 'failed', error: stepsError.message }).eq('id', job.id);
    throw new Error(`No se pudieron crear los pasos del video: ${stepsError.message}`);
  }
  return job.id as string;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

async function loadJob(db: Db, jobId: string): Promise<{ job: JobRow; steps: StepRow[] } | null> {
  const { data: job } = await db.from('kefy_video_jobs').select('*').eq('id', jobId).maybeSingle();
  if (!job) return null;
  const { data: steps } = await db.from('kefy_video_steps').select('*').eq('job_id', jobId);
  return { job: job as JobRow, steps: (steps ?? []) as StepRow[] };
}

/** El trabajo más reciente de una pieza (o rendición), si tiene. */
export async function latestJobFor(db: Db, table: RenderTable, targetId: string): Promise<JobRow | null> {
  const { data } = await db
    .from('kefy_video_jobs')
    .select('*')
    .eq('target_table', table)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as JobRow | null) ?? null;
}

export function snapshotOf(job: JobRow, steps: StepRow[]): VideoJobSnapshot {
  const compose = steps.find((s) => s.key === COMPOSE_STEP_KEY);
  const others  = steps.filter((s) => s.key !== COMPOSE_STEP_KEY);
  const doneOthers = others.filter((s) => TERMINAL.has(s.status)).length;
  // Los pasos previos son el 80 % del camino; el montaje, el resto.
  const composeProgress = compose?.status === 'done'
    ? 1
    : compose?.status === 'running' && typeof compose.handle?.progress === 'number' ? compose.handle.progress : 0;
  const progress = job.status === 'done'
    ? 1
    : (others.length ? (doneOthers / others.length) * 0.8 : 0.8) + composeProgress * 0.2;

  return {
    job_id:           job.id,
    status:           job.status,
    progress:         Math.round(progress * 100) / 100,
    video_url:        job.video_url,
    error:            job.error,
    credits_estimate: job.credits_estimate,
    motion:           job.motion,
    steps: steps.map((s) => ({ key: s.key, tool: s.tool, scene_id: s.scene_id, status: s.status, error: s.error })),
  };
}

// ─── Vuelta del motor ────────────────────────────────────────────────────────

/** Herramientas que no tienen sentido si falló algo de lo que dependen. */
function needsAllDeps(tool: VideoToolName): boolean {
  return tool === 'animate_image' || tool === 'lip_sync';
}

/**
 * Actualiza un paso solo si sigue en el estado e intento que esta vuelta
 * conoce. Tres vueltas pueden mirar el mismo paso a la vez (polling, cron,
 * webhook): sin la guarda de `attempts`, una vuelta atrasada podía devolver a
 * pending un intento nuevo, o devolver dos veces los mismos créditos. Si la
 * guarda falla, se recarga el paso: lo cambió otra vuelta.
 */
async function updateStep(db: Db, step: StepRow, patch: Record<string, unknown>, from: StepStatus): Promise<boolean> {
  const { data } = await db
    .from('kefy_video_steps')
    .update(patch)
    .eq('id', step.id)
    .eq('status', from)
    .eq('attempts', step.attempts)
    .select('id');
  if (data && data.length > 0) {
    Object.assign(step, patch);
    return true;
  }
  const { data: fresh } = await db.from('kefy_video_steps').select('*').eq('id', step.id).maybeSingle();
  if (fresh) Object.assign(step, fresh);
  return false;
}

async function settleStep(db: Db, job: JobRow, step: StepRow, result: ToolResult, now: number): Promise<void> {
  if (result.status === 'pending') {
    await updateStep(db, step, { handle: result.handle }, 'running');
    return;
  }
  if (result.status === 'done') {
    await updateStep(db, step, {
      status: 'done', output: result.output, finished_at: new Date(now).toISOString(), error: null,
    }, 'running');
    return;
  }
  await failStep(db, job, step, result.error, now);
}

/**
 * Reintenta si quedan intentos; si no, lo da por fallido y devuelve los
 * créditos — solo la vuelta que de verdad lo marcó fallido, una vez.
 */
async function failStep(
  db: Db, job: JobRow, step: StepRow, error: string, now: number, opts: { final?: boolean } = {},
): Promise<void> {
  if (!opts.final && step.attempts < MAX_STEP_ATTEMPTS) {
    // Se reintenta: no es un fallo todavía, pero sin este aviso un primer
    // intento fallido no deja rastro (el error se borra si el reintento sale).
    if (await updateStep(db, step, { status: 'pending', handle: null, error }, 'running')) {
      reportWarning(`Paso de video reintentado: ${error}`, {
        route: 'lib/video/engine', service: step.tool,
        extra: { jobId: job.id, step: step.key, attempts: step.attempts },
      });
    }
    return;
  }
  const wasCharged = step.charged;
  const won = await updateStep(db, step, {
    status: 'failed', handle: null, error, charged: false, finished_at: new Date(now).toISOString(),
  }, 'running');
  if (!won) return;
  if (wasCharged) await refundCredits(job.org_id, TOOL_CREDIT_OPERATION[step.tool]);
  reportError(new Error(error), {
    route: 'lib/video/engine', service: step.tool,
    extra: { jobId: job.id, step: step.key, attempts: step.attempts },
  });
}

async function skipStep(
  db: Db, step: StepRow, reason: string, now: number, from: StepStatus = 'pending',
): Promise<void> {
  await updateStep(db, step, { status: 'skipped', error: reason, finished_at: new Date(now).toISOString() }, from);
}

function outputsOf(steps: StepRow[]): StepOutputs {
  return Object.fromEntries(steps.filter((s) => s.status === 'done' && s.output).map((s) => [s.key, s.output!]));
}

function runContext(job: JobRow, step: StepRow): ToolRunContext {
  return { orgId: job.org_id, jobId: job.id, stepKey: step.key, attempt: step.attempts, webhookUrl: webhookUrlFor(step.id) };
}

interface TargetRow {
  id:        string;
  slides:    unknown;
  metadata:  Record<string, unknown> | null;
  video_url: string | null;
  image_url?: string | null;
}

/** La pieza que recibe el video, o null si ya no existe. */
async function loadTarget(db: Db, job: JobRow): Promise<TargetRow | null> {
  const cols = job.target_table === 'kefy_content_items'
    ? 'id, slides, metadata, video_url, image_url'
    : 'id, slides, metadata, video_url';
  const { data } = await db.from(job.target_table).select(cols).eq('id', job.target_id).maybeSingle();
  return (data as TargetRow | null) ?? null;
}

/** ¿Este trabajo sigue siendo el de la pieza? Otro más nuevo lo reemplaza. */
function ownsTarget(job: JobRow, target: TargetRow | null): target is TargetRow {
  return !!target && target.metadata?.video_job_id === job.id;
}

/**
 * Copia las fotos generadas a las escenas de la pieza (previews, editor y
 * portada las usan). Solo la URL de la imagen: el texto que el usuario haya
 * editado mientras tanto no se toca.
 */
async function writeSceneImages(db: Db, job: JobRow, outputs: StepOutputs): Promise<void> {
  const target = await loadTarget(db, job);
  if (!ownsTarget(job, target)) return;
  const images = sceneImageUrls(job.script, outputs);
  const current = Array.isArray(target.slides) ? (target.slides as Array<Record<string, unknown>>) : [];
  const slides = current.length
    ? current.map((slide, i) => {
      const id = typeof slide.scene_id === 'string' ? slide.scene_id : job.script.scenes[i]?.id;
      const url = id ? images[id] : null;
      return url ? { ...slide, image_url: url, text_baked: false } : slide;
    })
    : scriptToReelScenes(job.script, images);
  const patch: Record<string, unknown> = { slides };
  const cover = Object.values(images).find((u) => !!u) ?? null;
  if (job.target_table === 'kefy_content_items' && cover && !target.image_url) patch.image_url = cover;
  await db.from(job.target_table).update(patch).eq('id', job.target_id);
}

async function startStep(db: Db, job: JobRow, step: StepRow, steps: StepRow[], now: number): Promise<void> {
  // Reclamo atómico: si otra vuelta ya lo tomó, no hay fila que actualizar.
  const { data: claimed } = await db
    .from('kefy_video_steps')
    .update({ status: 'running', attempts: step.attempts + 1, started_at: new Date(now).toISOString(), handle: null })
    .eq('id', step.id)
    .eq('status', 'pending')
    .select('id');
  if (!claimed || claimed.length === 0) return;
  step.status = 'running';
  step.attempts += 1;
  step.started_at = new Date(now).toISOString();

  const tool = getVideoTool(step.tool);
  if (!tool || !tool.available()) {
    await failStep(db, job, step, `Herramienta no disponible: ${step.tool}`, now, { final: true });
    return;
  }

  if (!step.charged) {
    const credits = await consumeCredits(job.org_id, job.render_context.plan, TOOL_CREDIT_OPERATION[step.tool])
      .catch(() => null);
    if (!credits?.allowed) {
      // Sin créditos para este paso: el plano usa su respaldo.
      await skipStep(db, step, 'credits_exhausted', now, 'running');
      return;
    }
    if (!await updateStep(db, step, { charged: true }, 'running')) {
      // Otra vuelta tomó el paso mientras se cobraba: no se usa este cobro.
      await refundCredits(job.org_id, TOOL_CREDIT_OPERATION[step.tool]);
      return;
    }
  }

  const outputs = outputsOf(steps);
  let input: Record<string, unknown>;
  if (step.key === COMPOSE_STEP_KEY) {
    await writeSceneImages(db, job, outputs);
    // Trabajos creados antes de que el tema existiera: el respaldo.
    const theme = job.render_context.theme ?? resolveFilmTheme(null);
    input = buildFilmProps(job.script, outputs, theme, job.render_context.musicTrack) as unknown as Record<string, unknown>;
  } else {
    input = resolveRefs(step.input, outputs) as Record<string, unknown>;
  }

  let result: ToolResult;
  try {
    result = await tool.run(runContext(job, step), input);
  } catch (err) {
    result = { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
  await settleStep(db, job, step, result, Date.now());
}

async function pollStep(db: Db, job: JobRow, step: StepRow, now: number): Promise<void> {
  const startedAt = step.started_at ? Date.parse(step.started_at) : now;
  const tool = getVideoTool(step.tool);

  if (!step.handle) {
    // Síncrono en curso en otra función. Si lleva demasiado, esa función murió.
    if (now - startedAt > SYNC_STEP_STALE_MS) await failStep(db, job, step, 'interrupted', now);
    return;
  }
  if (now - startedAt > ASYNC_STEP_TIMEOUT_MS) {
    await failStep(db, job, step, 'timeout', now, { final: true });
    return;
  }
  if (!tool?.poll) return;

  let result: ToolResult;
  try {
    result = await tool.poll(runContext(job, step), step.handle);
  } catch (err) {
    // El proveedor no responde: se vuelve a mirar en la próxima vuelta.
    console.error(`[video-engine] poll ${step.key} falló:`, err);
    return;
  }
  await settleStep(db, job, step, result, now);
}

async function finishJob(db: Db, job: JobRow, steps: StepRow[], now: number): Promise<void> {
  const compose = steps.find((s) => s.key === COMPOSE_STEP_KEY);
  if (!compose || !TERMINAL.has(compose.status)) return;
  const at = new Date(now).toISOString();

  if (compose.status === 'done' && typeof compose.output?.video_url === 'string') {
    const videoUrl = compose.output.video_url;
    const { data: updated } = await db.from('kefy_video_jobs')
      .update({ status: 'done', video_url: videoUrl, finished_at: at, error: null })
      .eq('id', job.id).eq('status', 'running').select('id');
    // Solo si la pieza sigue apuntando a este trabajo: si el usuario la editó
    // y pidió otro, el video viejo no pisa al nuevo.
    if (updated?.length && ownsTarget(job, await loadTarget(db, job))) {
      await db.from(job.target_table)
        .update({ video_url: videoUrl, render_status: 'ready' })
        .eq('id', job.target_id);
    }
    job.status = 'done';
    job.video_url = videoUrl;
    return;
  }

  const error = compose.error ?? 'El montaje falló';
  const { data: updated } = await db.from('kefy_video_jobs')
    .update({ status: 'failed', error, finished_at: at })
    .eq('id', job.id).eq('status', 'running').select('id');
  // Sin video no se cobra nada: se devuelven también las imágenes, voces y
  // clips que sí salieron (el montaje ya devolvió lo suyo al fallar).
  if (updated?.length) await refundChargedSteps(db, job, ['pending', 'running', 'done']);
  const target = updated?.length ? await loadTarget(db, job) : null;
  if (ownsTarget(job, target)) {
    // Si la pieza ya tenía un video (se pidió reemplazarlo), sigue con ese.
    await db.from(job.target_table)
      .update({ render_status: target.video_url ? 'ready' : 'not_rendered' })
      .eq('id', job.target_id);
  }
  job.status = 'failed';
  job.error = error;
}

/**
 * Devuelve los créditos de los pasos cobrados en esos estados. El UPDATE
 * condicional (`charged = true` → false) es el reclamo: dos vueltas a la vez
 * reciben filas distintas y cada crédito se devuelve una sola vez.
 */
async function refundChargedSteps(db: Db, job: Pick<JobRow, 'id' | 'org_id'>, statuses: StepStatus[]): Promise<number> {
  const { data } = await db.from('kefy_video_steps')
    .update({ charged: false })
    .eq('job_id', job.id)
    .eq('charged', true)
    .in('status', statuses)
    .select('tool');
  const rows = (data ?? []) as Array<{ tool: VideoToolName }>;
  for (const row of rows) {
    await refundCredits(job.org_id, TOOL_CREDIT_OPERATION[row.tool]).catch((err) => {
      reportError(err, { route: 'lib/video/engine', service: 'supabase', extra: { jobId: job.id, fase: 'refund' } });
    });
  }
  return rows.length;
}

/**
 * Cancela un trabajo en curso y devuelve los créditos de lo que no llegó a
 * terminar (pasos pendientes o en curso, incluido el montaje prepagado). Lo
 * que ya se produjo queda cobrado: el usuario canceló (editó la pieza o la
 * borró), no fue un fallo nuestro. Devuelve false si el trabajo ya no corría.
 */
export async function cancelVideoJob(
  db: Db, job: Pick<JobRow, 'id' | 'org_id'>, reason: string, now = Date.now(),
): Promise<boolean> {
  const { data } = await db.from('kefy_video_jobs')
    .update({ status: 'canceled', error: reason, finished_at: new Date(now).toISOString() })
    .eq('id', job.id).eq('status', 'running').select('id');
  if (!data?.length) return false;
  await refundChargedSteps(db, job, ['pending', 'running']);
  return true;
}

/** Cancela un trabajo cuya pieza ya no existe o que otro trabajo reemplazó. */
async function cancelJob(db: Db, job: JobRow, reason: string, now: number): Promise<void> {
  await cancelVideoJob(db, job, reason, now);
  job.status = 'canceled';
  job.error = reason;
}

/**
 * Una vuelta del motor sobre un trabajo. Idempotente y segura en paralelo.
 * Devuelve el estado para la UI.
 */
export async function advanceVideoJob(
  db: Db,
  jobId: string,
  opts: {
    budgetMs?: number;
    /**
     * false: solo consulta y lanza pasos asíncronos (encolar en fal o Lambda
     * tarda segundos). Para funciones cortas como el webhook, donde una imagen
     * de 60 s podría quedar a medias y pagarse dos veces.
     */
    syncSteps?: boolean;
  } = {},
): Promise<VideoJobSnapshot | null> {
  const loaded = await loadJob(db, jobId);
  if (!loaded) return null;
  const { job, steps } = loaded;
  if (job.status !== 'running') return snapshotOf(job, steps);

  // Pieza borrada o reemplazada por otra producción: no se sigue gastando.
  const target = await loadTarget(db, job);
  if (!target) {
    await cancelJob(db, job, 'target_deleted', Date.now());
    return snapshotOf(job, steps);
  }
  if (typeof target.metadata?.video_job_id === 'string' && target.metadata.video_job_id !== job.id) {
    await cancelJob(db, job, 'superseded', Date.now());
    return snapshotOf(job, steps);
  }

  const deadline = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  const syncSteps = opts.syncSteps !== false;
  const byKey = new Map(steps.map((s) => [s.key, s]));

  // 1. Lo que ya corre en la nube.
  await Promise.all(steps.filter((s) => s.status === 'running').map((s) => pollStep(db, job, s, Date.now())));

  // 2. Lo que ya se puede lanzar. Se repite: al terminar una imagen, su
  //    animación queda lista en la misma vuelta.
  for (let round = 0; round < 6 && Date.now() < deadline; round++) {
    const ready: StepRow[] = [];
    for (const step of steps) {
      if (step.status !== 'pending') continue;
      const deps = step.depends_on.map((k) => byKey.get(k));
      if (deps.some((d) => d && !TERMINAL.has(d.status))) continue;
      if (needsAllDeps(step.tool) && deps.some((d) => !d || d.status !== 'done')) {
        await skipStep(db, step, 'dependency_failed', Date.now());
        continue;
      }
      if (!syncSteps && getVideoTool(step.tool)?.mode === 'sync') continue;
      ready.push(step);
    }
    if (ready.length === 0) break;

    for (let i = 0; i < ready.length && Date.now() < deadline; i += MAX_PARALLEL) {
      await Promise.all(ready.slice(i, i + MAX_PARALLEL).map((s) => startStep(db, job, s, steps, Date.now())));
    }
  }

  // 3. Cierre, y marca de la vuelta para que el cron reparta las suyas.
  await finishJob(db, job, steps, Date.now());
  if (job.status === 'running') {
    await db.from('kefy_video_jobs').update({ advanced_at: new Date().toISOString() }).eq('id', job.id);
  }
  return snapshotOf(job, steps);
}
