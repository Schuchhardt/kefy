// animate_image y lip_sync — los dos modelos de video, en la cola de fal.ai.
// Asíncronos: run() encola y devuelve el handle; poll() mira si terminó.
// Los modelos se cambian por env sin tocar código (FAL_ANIMATE_MODEL,
// FAL_LIPSYNC_MODEL): si fal publica uno mejor, es una variable.

import { falConfigured, falPoll, falSubmit, falVideoUrl, type FalHandle } from '@/lib/video/fal';
import { TOOL_CREDIT_OPERATION, type ToolResult, type VideoTool } from './types';

export const ANIMATE_MODEL = process.env.FAL_ANIMATE_MODEL ?? 'fal-ai/kling-video/v2.1/standard/image-to-video';
export const LIPSYNC_MODEL = process.env.FAL_LIPSYNC_MODEL ?? 'fal-ai/sync-lipsync/v2';

function asHandle(handle: Record<string, unknown>): FalHandle | null {
  const { request_id, status_url, response_url, model } = handle;
  return typeof request_id === 'string' && typeof status_url === 'string'
    && typeof response_url === 'string' && typeof model === 'string'
    ? { request_id, status_url, response_url, model }
    : null;
}

async function pollVideo(handle: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<ToolResult> {
  const h = asHandle(handle);
  if (!h) return { status: 'failed', error: 'handle de fal inválido' };
  const res = await falPoll(h);
  if (res.status !== 'done') return res.status === 'pending' ? { status: 'pending', handle } : res;
  const url = falVideoUrl(res.output);
  if (!url) return { status: 'failed', error: 'fal terminó sin video en la salida' };
  return { status: 'done', output: { video_url: url, ...extra } };
}

export const animateImageTool: VideoTool = {
  name:     'animate_image',
  label:    { es: 'Animar imagen', en: 'Animate image' },
  summary:  {
    es: 'Convierte la foto del plano en un clip de video de 5–10 s con el movimiento del guion.',
    en: 'Turns the shot picture into a 5–10 s video clip with the scripted motion.',
  },
  provider: 'fal',
  credit:   TOOL_CREDIT_OPERATION.animate_image,
  mode:     'async',
  available: falConfigured,

  async run(ctx, input) {
    const imageUrl = typeof input.image_url === 'string' ? input.image_url : '';
    if (!imageUrl) return { status: 'failed', error: 'animate_image: falta image_url' };
    const duration = input.duration === 10 ? 10 : 5;
    const handle = await falSubmit(ANIMATE_MODEL, {
      prompt:          typeof input.prompt === 'string' && input.prompt ? input.prompt : 'subtle cinematic motion',
      image_url:       imageUrl,
      duration:        String(duration),
      negative_prompt: 'blur, distortion, warped face, extra limbs, text, watermark, low quality',
    }, ctx.webhookUrl);
    return { status: 'pending', handle: { ...handle, clip_seconds: duration } };
  },

  poll: (_ctx, handle) => pollVideo(handle, { clip_seconds: handle.clip_seconds === 10 ? 10 : 5 }),
};

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
