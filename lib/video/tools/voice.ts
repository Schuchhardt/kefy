// text_to_speech — la voz de un plano (narrador o personaje).
// Síncrona: gpt-4o-mini-tts en WAV (la duración sale del propio archivo) y
// whisper-1 sobre ese audio para los tiempos por palabra de los subtítulos —
// lo mismo que hace openfilm al dejar un .vtt junto a cada voz.

import { toFile } from 'openai';
import { getOpenAI } from '@/lib/ai';
import { uploadVideoAsset } from '@/lib/storage';
import { reportError } from '@/lib/observability';
import { alignWords, wavDurationSeconds } from './audio';
import { TOOL_CREDIT_OPERATION, type VideoTool } from './types';

const TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';

/**
 * Tiempos de cada palabra oída en un audio (o en un clip con audio), con
 * whisper-1. Nunca lanza: sin tiempos, los subtítulos se reparten por largo de
 * palabra (`alignWords`).
 */
export async function transcribeWordTimings(
  buf: Buffer,
  filename: string,
  mime: string,
  language: 'es' | 'en',
  stepKey: string,
): Promise<Array<{ start: number; end: number }>> {
  try {
    const transcript = await getOpenAI().audio.transcriptions.create({
      file:     await toFile(buf, filename, { type: mime }),
      model:    'whisper-1',
      language,
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    });
    const words = (transcript as unknown as { words?: Array<{ start: number; end: number }> }).words;
    return Array.isArray(words) ? words.filter((w) => typeof w.start === 'number' && typeof w.end === 'number') : [];
  } catch (err) {
    reportError(err, { route: 'lib/video/tools/voice', service: 'ai', extra: { step: stepKey, fase: 'whisper' } });
    return [];
  }
}

export const textToSpeechTool: VideoTool = {
  name:     'text_to_speech',
  label:    { es: 'Voz', en: 'Voice' },
  summary:  {
    es: 'Locución de la línea con la voz del narrador o del personaje, con tiempos por palabra para los subtítulos.',
    en: 'Spoken line in the narrator or character voice, with word timings for subtitles.',
  },
  provider: 'openai',
  credit:   TOOL_CREDIT_OPERATION.text_to_speech,
  mode:     'sync',
  available: () => !!process.env.OPENAI_API_KEY,

  async run(ctx, input) {
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text) return { status: 'failed', error: 'text_to_speech: falta text' };
    const voice = typeof input.voice === 'string' ? input.voice : 'nova';
    const instructions = typeof input.instructions === 'string' && input.instructions ? input.instructions : undefined;
    const language = input.language === 'en' ? 'en' : 'es';

    const client = getOpenAI();
    const speech = await client.audio.speech.create({
      model:           TTS_MODEL,
      voice,
      input:           text,
      response_format: 'wav',
      ...(instructions ? { instructions } : {}),
    } as Parameters<typeof client.audio.speech.create>[0]);
    const buf = Buffer.from(await speech.arrayBuffer());

    // Sin duración no se puede montar el plano a la medida de la voz: se estima
    // por palabras (≈2,5 por segundo) en vez de fallar.
    const duration = wavDurationSeconds(buf) ?? Math.max(1, text.split(/\s+/).length / 2.5);

    const heard = await transcribeWordTimings(buf, 'voice.wav', 'audio/wav', language, ctx.stepKey);

    const audioUrl = await uploadVideoAsset(buf, ctx.orgId, `voice-${ctx.stepKey}.wav`, 'audio/wav');
    return {
      status: 'done',
      output: {
        audio_url:        audioUrl,
        duration_seconds: Math.round(duration * 100) / 100,
        words:            alignWords(text, duration, heard),
      },
    };
  },
};
