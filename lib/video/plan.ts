// ─── Plan de producción ───────────────────────────────────────────────────────
//
// Compila un guion (lib/video/script.ts) en la lista de llamadas a
// herramientas que lo producen, con sus dependencias y su costo. Es una
// función pura: no llama a nadie, así que sirve igual para cotizar antes de
// producir («este video usa 5 imágenes, 3 animaciones, 6 voces: 71 créditos»)
// que para crear los pasos del trabajo en la nube.
//
// Grafo típico de un plano con personaje que habla:
//
//   char_ana ──► img_s2 ──► anim_s2 ──► lips_s2 ──┐
//                voice_s2 ─────────────► lips_s2  ├──► compose
//   img_s1 ──► anim_s1 ───────────────────────────┤
//   voice_s1 ─────────────────────────────────────┘
//
// Los valores que solo existen al ejecutar (la URL de una imagen) van como
// referencias `{ $ref: 'img_s1.image_url' }` que el motor resuelve.
//
// Degradación en vez de error: sin fal.ai configurado, o con `motion: 'none'`,
// los planos animados quedan como foto con movimiento de cámara y los que
// hablan como foto + voz en off. Cada degradación deja una nota en el plan.

import { OPERATION_CREDIT_COSTS } from '@/lib/plans';
import { TOOL_CREDIT_OPERATION, type VideoToolName } from '@/lib/video/tools/types';
import type { VideoScene, VideoScript } from '@/lib/video/script';

export const MOTION_LEVELS = ['none', 'key', 'full'] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];

/** Planos con movimiento en el nivel `key`: el hook y los más importantes. */
export const KEY_MOTION_SCENES = 3;

export interface PlanRef { $ref: string }

export interface PlanStep {
  key:        string;
  tool:       VideoToolName;
  scene_id:   string | null;
  input:      Record<string, unknown>;
  depends_on: string[];
  /** Si falla, el video sale igual con un respaldo (foto en vez de clip, etc.). */
  optional:   boolean;
}

export interface PlanNote { es: string; en: string }

export interface VideoPlan {
  motion:  MotionLevel;
  steps:   PlanStep[];
  credits: number;
  by_tool: Partial<Record<VideoToolName, { count: number; credits: number }>>;
  notes:   PlanNote[];
}

export interface PlanBrand {
  name?:           string;
  primaryColor?:   string;
  secondaryColor?: string;
  accentColor?:    string;
}

export interface PlanOptions {
  motion?:               MotionLevel;
  /** Qué herramientas asíncronas están configuradas (FAL_KEY, etc.). */
  capabilities:          { animation: boolean; lipsync: boolean; images?: boolean; voice?: boolean };
  /** false: no se generan fotos (el reel lo pidió así); los planos usan el fondo de marca o su foto. */
  generate_images?:      boolean;
  image_quality?:        'low' | 'medium' | 'high';
  brand?:                PlanBrand;
  reference_image_urls?: string[];
  /** Indicación de acento para el TTS (lib/video/brand.ts::voiceAccent). */
  voice_accent?:         string;
}

export const COMPOSE_STEP_KEY = 'compose';

/** Sin indicaciones del guion ni de la marca, una locución de reel que funcione. */
const DEFAULT_VOICE_STYLE = 'Warm, confident and energetic social media voice-over, natural pacing, smile in the voice.';
/** Estilo de imagen de respaldo cuando el guion no fijó uno. */
const DEFAULT_VISUAL_STYLE = 'Cinematic, natural light, shallow depth of field, rich but realistic colors';

const NO_TEXT = 'NO text, NO words, NO letters, NO captions, NO logos, NO watermarks, NO signs with writing.';

export function ref(path: string): PlanRef {
  return { $ref: path };
}

export function isRef(v: unknown): v is PlanRef {
  return !!v && typeof v === 'object' && typeof (v as PlanRef).$ref === 'string';
}

function creditsOf(tool: VideoToolName): number {
  return OPERATION_CREDIT_COSTS[TOOL_CREDIT_OPERATION[tool]];
}

function animationSeconds(scene: VideoScene): 5 | 10 {
  return scene.duration_seconds > 5 ? 10 : 5;
}

/**
 * Qué planos se animan con el nivel pedido. `full` anima todos; `key` respeta
 * lo que eligió el guion, con el hook y los que hablan primero, hasta
 * KEY_MOTION_SCENES; `none` ninguno.
 */
function motionScenes(script: VideoScript, motion: MotionLevel): Set<string> {
  if (motion === 'none') return new Set();
  if (motion === 'full') return new Set(script.scenes.map((s) => s.id));
  const wanted = script.scenes.filter((s) => s.visual.kind !== 'still');
  const ranked = [
    ...wanted.filter((s) => s.order === 1),
    ...wanted.filter((s) => s.order !== 1 && s.visual.kind === 'talking'),
    ...wanted.filter((s) => s.order !== 1 && s.visual.kind === 'animated'),
  ];
  return new Set(ranked.slice(0, KEY_MOTION_SCENES).map((s) => s.id));
}

export function compileVideoPlan(script: VideoScript, opts: PlanOptions): VideoPlan {
  const motion  = opts.motion ?? 'key';
  const steps: PlanStep[] = [];
  const notes: PlanNote[] = [];
  const brand   = opts.brand ?? {};
  const quality = opts.image_quality ?? 'medium';
  const brandRefs = (opts.reference_image_urls ?? []).slice(0, 2);
  const style   = `${script.visual_style || DEFAULT_VISUAL_STYLE}. `;

  const canImage   = opts.capabilities.images !== false && opts.generate_images !== false;
  const canVoice   = opts.capabilities.voice !== false;
  const canAnimate = opts.capabilities.animation;
  const canLipsync = opts.capabilities.lipsync && canAnimate && canVoice;

  if (opts.capabilities.images === false) {
    notes.push({
      es: 'La generación de imágenes no está configurada: los planos usan el fondo animado de la marca.',
      en: 'Image generation is not configured: shots use the animated brand background.',
    });
  }
  if (!canVoice && script.scenes.some((s) => s.line)) {
    notes.push({
      es: 'La voz no está configurada: el video sale sin locución, con los textos en pantalla.',
      en: 'Voice is not configured: the video has no voice-over, only on-screen text.',
    });
  }
  const animated   = canAnimate ? motionScenes(script, motion) : new Set<string>();

  if (!canAnimate && motion !== 'none' && script.scenes.some((s) => s.visual.kind !== 'still')) {
    notes.push({
      es: 'La animación con IA no está configurada: los planos animados salen como foto con movimiento de cámara.',
      en: 'AI animation is not configured: animated shots render as photos with a camera move.',
    });
  }
  const capped = script.scenes.filter((s) => s.visual.kind !== 'still' && !animated.has(s.id));
  if (canAnimate && motion === 'key' && capped.length > 0) {
    notes.push({
      es: `Se animan los ${KEY_MOTION_SCENES} planos clave; el resto queda como foto con movimiento de cámara.`,
      en: `The ${KEY_MOTION_SCENES} key shots are animated; the rest are photos with a camera move.`,
    });
  }

  // ── Retratos de referencia de los personajes ──────────────────────────────
  const characters = new Map(script.characters.map((c) => [c.id, c]));
  for (const c of canImage ? script.characters : []) {
    steps.push({
      key:        `char_${c.id}`,
      tool:       'generate_image',
      scene_id:   null,
      input: {
        prompt: `Character reference portrait of ${c.name}: ${c.look}. ${style}Front-facing, natural neutral expression, mouth closed, upper body, soft even light, simple background. ${NO_TEXT}`,
        quality,
        brand,
      },
      depends_on: [],
      optional:   true,
    });
  }

  // ── Planos ────────────────────────────────────────────────────────────────
  for (const scene of script.scenes) {
    const sceneChars = scene.visual.character_ids.map((id) => characters.get(id)).filter((c) => !!c);
    const givenImage = scene.visual.image_url ?? null;
    // Sin foto (ni dada ni generada) no hay nada que animar.
    const hasImage   = !!givenImage || canImage;
    const isAnimated = animated.has(scene.id) && hasImage;
    const isTalking  = scene.visual.kind === 'talking' && isAnimated && canLipsync && !!scene.line;

    if (scene.visual.kind === 'talking' && !isTalking && motion !== 'none' && canAnimate && animated.has(scene.id) && !canLipsync) {
      notes.push({
        es: `El plano ${scene.order} iba con lipsync, pero no está configurado: el personaje se anima y la línea va en voz en off.`,
        en: `Shot ${scene.order} was lip-synced, but lip-sync is not configured: the character is animated and the line plays as voice-over.`,
      });
    }

    const imgKey = `img_${scene.id}`;
    const imageRef: PlanRef | string = givenImage ?? ref(`${imgKey}.image_url`);
    const castLine = sceneChars.length
      ? ` People in the shot: ${sceneChars.map((c) => `${c.name} (${c.look})`).join('; ')}.`
      : '';
    const framing = isTalking
      ? ' Medium close-up, the person faces the camera, mouth closed, eye level.'
      : '';
    if (!givenImage && canImage) steps.push({
      key:        imgKey,
      tool:       'generate_image',
      scene_id:   scene.id,
      input: {
        prompt: `${style}${scene.visual.image_prompt}.${castLine}${framing} Vertical 9:16 cinematic photo. ${NO_TEXT}`,
        quality,
        brand,
        reference_image_urls: [
          ...sceneChars.map((c) => ref(`char_${c.id}.image_url`)),
          ...brandRefs,
        ].slice(0, 3),
      },
      depends_on: canImage ? sceneChars.map((c) => `char_${c.id}`) : [],
      // Sin imagen el plano cae al fondo animado de marca: el video sale igual.
      optional:   true,
    });

    let voiceKey: string | null = null;
    if (scene.line && scene.speaker && canVoice) {
      voiceKey = `voice_${scene.id}`;
      const speaker = scene.speaker === 'narrator' ? null : characters.get(scene.speaker);
      const voiceStyle = speaker ? speaker.voice_style : script.narrator.style;
      steps.push({
        key:        voiceKey,
        tool:       'text_to_speech',
        scene_id:   scene.id,
        input: {
          text:         scene.line,
          voice:        speaker ? speaker.voice : script.narrator.voice,
          instructions: [
            voiceStyle || DEFAULT_VOICE_STYLE,
            opts.voice_accent ?? (script.language === 'es' ? 'Speak in natural, neutral Latin American Spanish.' : ''),
          ].filter(Boolean).join(' '),
          language:     script.language,
        },
        depends_on: [],
        optional:   true,
      });
    }

    if (isAnimated) {
      const animKey = `anim_${scene.id}`;
      const lead = sceneChars[0];
      const motionPrompt = isTalking
        ? `${lead ? `${lead.look}. ` : ''}The person talks naturally to the camera with subtle head movement and small gestures. ${scene.visual.motion_prompt ?? ''}`
        : scene.visual.motion_prompt ?? 'subtle cinematic motion, gentle camera drift';
      steps.push({
        key:        animKey,
        tool:       'animate_image',
        scene_id:   scene.id,
        input: {
          image_url: imageRef,
          prompt:    motionPrompt.trim(),
          duration:  animationSeconds(scene),
        },
        depends_on: givenImage ? [] : [imgKey],
        optional:   true,
      });

      if (isTalking && voiceKey) {
        steps.push({
          key:        `lips_${scene.id}`,
          tool:       'lip_sync',
          scene_id:   scene.id,
          input: {
            video_url: ref(`${animKey}.video_url`),
            audio_url: ref(`${voiceKey}.audio_url`),
          },
          depends_on: [animKey, voiceKey],
          optional:   true,
        });
      }
    }
  }

  steps.push({
    key:        COMPOSE_STEP_KEY,
    tool:       'compose_video',
    scene_id:   null,
    // La línea de tiempo se arma al ejecutar, con las salidas de todo lo anterior.
    input:      { $timeline: true },
    depends_on: steps.map((s) => s.key),
    optional:   false,
  });

  const by_tool: VideoPlan['by_tool'] = {};
  let credits = 0;
  for (const step of steps) {
    const c = creditsOf(step.tool);
    credits += c;
    const entry = by_tool[step.tool] ?? { count: 0, credits: 0 };
    entry.count += 1;
    entry.credits += c;
    by_tool[step.tool] = entry;
  }

  return { motion, steps, credits, by_tool, notes };
}

/** Sustituye las `$ref` de un input por las salidas de los pasos ya hechos. */
export function resolveRefs(
  value: unknown,
  outputs: Record<string, Record<string, unknown> | undefined>,
): unknown {
  if (isRef(value)) {
    const [stepKey, field] = value.$ref.split('.', 2) as [string, string];
    const v = outputs[stepKey]?.[field];
    return v === undefined ? null : v;
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveRefs(v, outputs)).filter((v) => v !== null);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveRefs(v, outputs)]));
  }
  return value;
}
