// animate_image y lip_sync — los dos modelos de video.
// Asíncronos: run() encola y devuelve el handle; poll() mira si terminó.
//
// animate_image corre en Higgsfield si está configurado (HIGGSFIELD_API_KEY),
// si no en fal.ai. Con Higgsfield el modelo (Seedance 2.0) genera el audio del
// clip: en un plano donde habla un personaje, el clip ya trae su línea dicha
// con los labios sincronizados, sin TTS ni lipsync aparte. Después se
// transcribe el clip con whisper para los subtítulos palabra a palabra.
//
// lip_sync solo existe en fal: el plan no lo usa cuando el clip trae la voz.
// Los modelos se cambian por env sin tocar código (HIGGSFIELD_ANIMATE_MODEL,
// FAL_ANIMATE_MODEL, FAL_LIPSYNC_MODEL).

import { falConfigured, falPoll, falSubmit, falVideoUrl, type FalHandle } from '@/lib/video/fal';
import {
  higgsfieldConfigured, higgsfieldPoll, higgsfieldSubmit, higgsfieldVideoUrl, type HiggsfieldHandle,
} from '@/lib/video/higgsfield';
import { reportError } from '@/lib/observability';
import { alignWords } from './audio';
import { transcribeWordTimings } from './voice';
import { TOOL_CREDIT_OPERATION, type ToolResult, type ToolRunContext, type VideoTool } from './types';

export const ANIMATE_MODEL = process.env.FAL_ANIMATE_MODEL ?? 'fal-ai/kling-video/v2.1/standard/image-to-video';
export const LIPSYNC_MODEL = process.env.FAL_LIPSYNC_MODEL ?? 'fal-ai/sync-lipsync/v2';
export const HIGGSFIELD_ANIMATE_MODEL = process.env.HIGGSFIELD_ANIMATE_MODEL ?? 'bytedance/seedance-2.0/image-to-video';

/** Seedance acepta clips de 4 a 15 s. */
const HF_MIN_SECONDS = 4;
const HF_MAX_SECONDS = 15;
/** whisper-1 acepta hasta 25 MB; un clip de 15 s en 720p queda muy por debajo. */
const MAX_TRANSCRIBE_BYTES = 24 * 1024 * 1024;

const NEGATIVE_PROMPT = 'blur, distortion, warped face, extra limbs, text, watermark, low quality';

function asFalHandle(handle: Record<string, unknown>): FalHandle | null {
  const { request_id, status_url, response_url, model } = handle;
  return typeof request_id === 'string' && typeof status_url === 'string'
    && typeof response_url === 'string' && typeof model === 'string'
    ? { request_id, status_url, response_url, model }
    : null;
}

function asHiggsfieldHandle(handle: Record<string, unknown>): HiggsfieldHandle | null {
  const { request_id, status_url, model } = handle;
  return handle.provider === 'higgsfield' && typeof request_id === 'string'
    && typeof status_url === 'string' && typeof model === 'string'
    ? { provider: 'higgsfield', request_id, status_url, model }
    : null;
}

async function pollVideo(handle: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<ToolResult> {
  const h = asFalHandle(handle);
  if (!h) return { status: 'failed', error: 'handle de fal inválido' };
  const res = await falPoll(h);
  if (res.status !== 'done') return res.status === 'pending' ? { status: 'pending', handle } : res;
  const url = falVideoUrl(res.output);
  if (!url) return { status: 'failed', error: 'fal terminó sin video en la salida' };
  return { status: 'done', output: { video_url: url, ...extra } };
}

/** Segundos del clip: lo que pide el plan, dentro de lo que acepta el modelo. */
function clipSecondsFor(input: Record<string, unknown>): number {
  const requested = typeof input.duration === 'number' && Number.isFinite(input.duration) ? Math.round(input.duration) : 5;
  return Math.min(HF_MAX_SECONDS, Math.max(HF_MIN_SECONDS, requested));
}

/**
 * Tiempos por palabra de la línea dicha en el clip. Si el clip no se puede
 * bajar o transcribir, las palabras se reparten sobre su duración: los
 * subtítulos salen igual, menos ajustados.
 */
async function speechWords(
  ctx: ToolRunContext,
  videoUrl: string,
  line: string,
  clipSeconds: number,
  language: 'es' | 'en',
): Promise<ReturnType<typeof alignWords>> {
  let heard: Array<{ start: number; end: number }> = [];
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`clip ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length <= MAX_TRANSCRIBE_BYTES) {
      heard = await transcribeWordTimings(buf, 'clip.mp4', 'video/mp4', language, ctx.stepKey);
    }
  } catch (err) {
    reportError(err, { route: 'lib/video/tools/motion', service: 'higgsfield', extra: { step: ctx.stepKey, fase: 'clip' } });
  }
  return alignWords(line, clipSeconds, heard);
}

async function runHiggsfield(ctx: ToolRunContext, input: Record<string, unknown>, imageUrl: string): Promise<ToolResult> {
  const speech = typeof input.speech === 'string' ? input.speech.trim() : '';
  const clipSeconds = clipSecondsFor(input);
  const basePrompt = typeof input.prompt === 'string' && input.prompt ? input.prompt : 'subtle cinematic motion';
  // El audio del clip solo se usa cuando el personaje habla. En los demás
  // planos suenan la música y el narrador del montaje: un audio inventado por
  // el modelo debajo chocaría con los dos.
  const handle = await higgsfieldSubmit(HIGGSFIELD_ANIMATE_MODEL, {
    image_url:      imageUrl,
    prompt:         basePrompt,
    duration:       clipSeconds,
    resolution:     '720p',
    generate_audio: !!speech,
  }, {
    webhookUrl:     ctx.webhookUrl,
    idempotencyKey: `kefy-${ctx.jobId}-${ctx.stepKey}-${ctx.attempt ?? 1}`,
  });
  return {
    status: 'pending',
    handle: {
      ...handle,
      clip_seconds: clipSeconds,
      ...(speech ? { speech, language: input.language === 'en' ? 'en' : 'es' } : {}),
    },
  };
}

async function pollHiggsfield(ctx: ToolRunContext, handle: Record<string, unknown>): Promise<ToolResult> {
  const h = asHiggsfieldHandle(handle);
  if (!h) return { status: 'failed', error: 'handle de Higgsfield inválido' };
  const res = await higgsfieldPoll(h);
  if (res.status !== 'done') return res.status === 'pending' ? { status: 'pending', handle } : res;
  const url = higgsfieldVideoUrl(res.output);
  if (!url) return { status: 'failed', error: 'Higgsfield terminó sin video en la salida' };

  const clipSeconds = typeof handle.clip_seconds === 'number' ? handle.clip_seconds : 5;
  const speech = typeof handle.speech === 'string' ? handle.speech : '';
  if (!speech) return { status: 'done', output: { video_url: url, clip_seconds: clipSeconds } };

  const language = handle.language === 'en' ? 'en' : 'es';
  return {
    status: 'done',
    output: {
      video_url:    url,
      clip_seconds: clipSeconds,
      // El clip ya trae la voz: el montaje no le pone otra y toma de aquí los subtítulos.
      has_audio:    true,
      words:        await speechWords(ctx, url, speech, clipSeconds, language),
    },
  };
}

export const animateImageTool: VideoTool = {
  name:     'animate_image',
  label:    { es: 'Animar imagen', en: 'Animate image' },
  summary:  {
    es: 'Convierte la foto del plano en un clip de video con el movimiento del guion; si el personaje habla, el clip trae su voz.',
    en: 'Turns the shot picture into a video clip with the scripted motion; when the character speaks, the clip carries their voice.',
  },
  // Se lee al listar el plan: muestra el proveedor que de verdad se va a usar.
  get provider() { return higgsfieldConfigured() ? 'higgsfield' as const : 'fal' as const; },
  credit:   TOOL_CREDIT_OPERATION.animate_image,
  mode:     'async',
  available: () => higgsfieldConfigured() || falConfigured(),

  async run(ctx, input) {
    const imageUrl = typeof input.image_url === 'string' ? input.image_url : '';
    if (!imageUrl) return { status: 'failed', error: 'animate_image: falta image_url' };
    if (higgsfieldConfigured()) return runHiggsfield(ctx, input, imageUrl);

    const duration = input.duration === 10 ? 10 : 5;
    const handle = await falSubmit(ANIMATE_MODEL, {
      prompt:          typeof input.prompt === 'string' && input.prompt ? input.prompt : 'subtle cinematic motion',
      image_url:       imageUrl,
      duration:        String(duration),
      negative_prompt: NEGATIVE_PROMPT,
    }, ctx.webhookUrl);
    return { status: 'pending', handle: { ...handle, clip_seconds: duration } };
  },

  // El handle dice a qué proveedor se encargó: si cambia la configuración a
  // mitad de producción, cada clip se sigue consultando donde se pidió.
  poll: (ctx, handle) => handle.provider === 'higgsfield'
    ? pollHiggsfield(ctx, handle)
    : pollVideo(handle, { clip_seconds: handle.clip_seconds === 10 ? 10 : 5 }),
};

/** true si el clip animado trae la voz del personaje (no hace falta TTS ni lipsync). */
export function speechInClipAvailable(): boolean {
  return higgsfieldConfigured();
}

export const lipSyncTool: VideoTool = {
  name:     'lip_sync',
  label:    { es: 'Lipsync', en: 'Lip-sync' },
  summary:  {
    es: 'Sincroniza los labios del personaje del clip con su línea de voz.',
    en: 'Syncs the character lips in the clip to their voice line.',
  },
  provider: 'fal',
  credit:   TOOL_CREDIT_OPERATION.lip_sync,
  mode:     'async',
  available: falConfigured,

  async run(ctx, input) {
    const videoUrl = typeof input.video_url === 'string' ? input.video_url : '';
    const audioUrl = typeof input.audio_url === 'string' ? input.audio_url : '';
    if (!videoUrl || !audioUrl) return { status: 'failed', error: 'lip_sync: falta video_url o audio_url' };
    // `loop`: si la línea dura más que el clip, el clip se repite en vez de
    // cortar la voz.
    const handle = await falSubmit(LIPSYNC_MODEL, { video_url: videoUrl, audio_url: audioUrl, sync_mode: 'loop' }, ctx.webhookUrl);
    return { status: 'pending', handle: { ...handle } };
  },

  // El clip con lipsync ya trae la voz: el montaje no la vuelve a poner.
  poll: (_ctx, handle) => pollVideo(handle, { has_audio: true }),
};
