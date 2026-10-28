// text_to_speech — la voz del narrador de un plano.
// Síncrona. Con ElevenLabs (ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID) la voz
// sale de `/with-timestamps`, que ya trae los tiempos de cada carácter: no
// hace falta transcribir. Sin ElevenLabs, o si falla, gpt-4o-mini-tts en WAV
// (la duración sale del propio archivo) y whisper-1 sobre ese audio para los
// tiempos por palabra de los subtítulos — lo mismo que hace openfilm al dejar
// un .vtt junto a cada voz.

import { toFile } from 'openai';
import { getOpenAI } from '@/lib/ai';
import { uploadVideoAsset } from '@/lib/storage';
import { reportError } from '@/lib/observability';
import { withProviderAlerts } from '@/lib/provider-alerts';
import { alignWords, alignmentWordSpans, lineLanguage, spokenText, wavDurationSeconds } from './audio';
import { TOOL_CREDIT_OPERATION, type VideoTool } from './types';

const TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';
/** Flash v2.5: la mitad de precio que Multilingual v2 y respeta `language_code`. */
const ELEVENLABS_DEFAULT_MODEL = 'eleven_flash_v2_5';
const ELEVENLABS_CONFLICT_RETRIES  = 4;
const ELEVENLABS_CONFLICT_DELAY_MS = 1500;

// `fetch` se resuelve en cada llamada (no al cargar el módulo): así los tests
// pueden sustituirlo.
const elevenFetch = withProviderAlerts('elevenlabs', (input, init) => fetch(input, init));

function elevenLabsConfig(): { apiKey: string; voiceId: string; model: string } | null {
  const apiKey  = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (!apiKey || !voiceId) return null;
  return { apiKey, voiceId, model: process.env.ELEVENLABS_MODEL?.trim() || ELEVENLABS_DEFAULT_MODEL };
}

export function elevenLabsConfigured(): boolean {
  return elevenLabsConfig() !== null;
}

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

interface Speech {
  buf:      Buffer;
  filename: string;
  mime:     string;
  duration: number;
  heard:    Array<{ start: number; end: number }>;
}

async function elevenLabsSpeech(
  cfg: NonNullable<ReturnType<typeof elevenLabsConfig>>,
  text: string,
  language: 'es' | 'en',
): Promise<Speech> {
  const url = `${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(cfg.voiceId)}/with-timestamps?output_format=mp3_44100_128`;
  const request = () => elevenFetch(url, {
    method:  'POST',
    headers: { 'xi-api-key': cfg.apiKey, 'Content-Type': 'application/json' },
    // multilingual_v2 no acepta `language_code`: solo se manda a los demás.
    body: JSON.stringify({
      text,
      model_id: cfg.model,
      ...(cfg.model.includes('multilingual_v2') ? {} : { language_code: language }),
    }),
  });
  // Las voces de un video se piden a la vez. Con una voz de la biblioteca,
  // ElevenLabs responde 409 `already_running` a las que llegan mientras la
  // agrega a la cuenta. Se reintenta: caer a OpenAI mezclaría dos voces en
  // el mismo video.
  let res = await request();
  for (let attempt = 1; res.status === 409 && attempt <= ELEVENLABS_CONFLICT_RETRIES; attempt++) {
    await new Promise((r) => setTimeout(r, ELEVENLABS_CONFLICT_DELAY_MS * attempt));
    res = await request();
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`elevenlabs ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json() as {
    audio_base64?: string;
    alignment?: Parameters<typeof alignmentWordSpans>[0];
  };
  if (!data.audio_base64) throw new Error('elevenlabs: la respuesta no trae audio');

  const heard = alignmentWordSpans(data.alignment);
  // El MP3 no dice su duración sin decodificarlo: el final de la última
  // palabra es lo que dura el habla (el montaje ya agrega aire al final).
  const duration = heard.length
    ? heard[heard.length - 1]!.end
    : Math.max(1, text.split(/\s+/).length / 2.5);
  return { buf: Buffer.from(data.audio_base64, 'base64'), filename: 'voice.mp3', mime: 'audio/mpeg', duration, heard };
}

async function openAiSpeech(
  text: string,
  voice: string,
  instructions: string | undefined,
  language: 'es' | 'en',
  stepKey: string,
): Promise<Speech> {
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
  const heard = await transcribeWordTimings(buf, 'voice.wav', 'audio/wav', language, stepKey);
  return { buf, filename: 'voice.wav', mime: 'audio/wav', duration, heard };
}

export const textToSpeechTool: VideoTool = {
  name:     'text_to_speech',
  label:    { es: 'Voz', en: 'Voice' },
  summary:  {
    es: 'Locución de la línea con la voz del narrador, con tiempos por palabra para los subtítulos.',
    en: 'Spoken line in the narrator voice, with word timings for subtitles.',
  },
  // Se lee al listar el plan: muestra el proveedor que de verdad se va a usar.
  get provider() { return elevenLabsConfigured() ? 'elevenlabs' as const : 'openai' as const; },
  credit:   TOOL_CREDIT_OPERATION.text_to_speech,
  mode:     'sync',
  available: () => elevenLabsConfigured() || !!process.env.OPENAI_API_KEY,

  async run(ctx, input) {
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text) return { status: 'failed', error: 'text_to_speech: falta text' };
    const voice = typeof input.voice === 'string' ? input.voice : 'nova';
    const instructions = typeof input.instructions === 'string' && input.instructions ? input.instructions : undefined;
    // Manda el idioma en que está escrita la línea, no el del guion: un guion
    // marcado `en` con líneas en español decía «aitickets dot C L».
    const language = lineLanguage(text, input.language === 'en' ? 'en' : 'es');

    // La voz dice «depando punto ce ele»; el subtítulo (`text`) sigue diciendo «depando.cl».
    const spoken = spokenText(text, language);
    let speech: Speech | null = null;
    const eleven = elevenLabsConfig();
    if (eleven) {
      try {
        speech = await elevenLabsSpeech(eleven, spoken, language);
      } catch (err) {
        // Sin OpenAI no hay respaldo: el paso falla y el motor lo reintenta.
        if (!process.env.OPENAI_API_KEY) throw err;
        reportError(err, { route: 'lib/video/tools/voice', service: 'elevenlabs', extra: { step: ctx.stepKey } });
      }
    }
    speech ??= await openAiSpeech(spoken, voice, instructions, language, ctx.stepKey);

    const audioUrl = await uploadVideoAsset(speech.buf, ctx.orgId, `voice-${ctx.stepKey}.${speech.filename.split('.').pop()}`, speech.mime);
    return {
      status: 'done',
      output: {
        audio_url:        audioUrl,
        duration_seconds: Math.round(speech.duration * 100) / 100,
        words:            alignWords(text, speech.duration, speech.heard),
      },
    };
  },
};
