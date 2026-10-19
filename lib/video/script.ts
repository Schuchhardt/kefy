// ─── Guion de video ───────────────────────────────────────────────────────────
//
// Un reel ya no es una lista de slides con texto: es un guion corto, plano a
// plano, que dice qué se ve, cuánto dura, qué se dice y quién lo dice. Cada
// plano declara con qué herramientas se produce (imagen, animación, voz,
// lipsync) y `lib/video/plan.ts` lo compila en la lista de pasos que corren en
// la nube (`lib/video/engine.ts`).
//
// Inspirado en el modo automático de openfilm («plan the film shot by shot:
// what each shot shows, for how long, what is said and heard»), pero con el
// plan guardado como dato estructurado y no solo en el razonamiento del
// modelo: así se puede listar, cotizar y ejecutar fuera del request.
//
// Claude devuelve JSON libre; `normalizeVideoScript` lo vuelve un guion válido
// (recorta, rellena y descarta lo que no entiende) en vez de rechazarlo por un
// campo de más.

import type { ReelScene } from '@/types/content';

export const VIDEO_SCRIPT_VERSION = 1;

export const SCENE_SECONDS_MIN = 1.5;
export const SCENE_SECONDS_MAX = 10;
const CHARACTERS_MAX = 3;
const SCENES_MAX = 10;
const LINE_MAX = 220;

/** Voces de `gpt-4o-mini-tts`. */
export const VOICES = [
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse',
] as const;
export type VoiceId = (typeof VOICES)[number];

/**
 * Cómo se produce la imagen de un plano:
 * - `still`    — foto generada con movimiento de cámara (Ken Burns) en el montaje.
 * - `animated` — foto generada y animada con un modelo imagen→video.
 * - `talking`  — un personaje habla a cámara: foto → animación → lipsync con su línea.
 */
export const VISUAL_KINDS = ['still', 'animated', 'talking'] as const;
export type VisualKind = (typeof VISUAL_KINDS)[number];

export const CAMERA_MOVES = ['push_in', 'pull_out', 'pan_left', 'pan_right', 'static'] as const;
export type CameraMove = (typeof CAMERA_MOVES)[number];

export const TRANSITIONS = ['crossfade', 'cut', 'zoom', 'slide'] as const;
export type Transition = (typeof TRANSITIONS)[number];

export interface VideoCharacter {
  id:          string;
  name:        string;
  /** Descripción visual en inglés: se reutiliza en cada imagen del personaje. */
  look:        string;
  voice:       VoiceId;
  /** Indicaciones de actuación para el TTS («warm, confident, Chilean Spanish»). */
  voice_style: string;
}

export interface VideoScene {
  id:               string;
  order:            number;
  /** Estimación del guion. El montaje la ajusta a la duración real de la voz. */
  duration_seconds: number;
  /** `narrator` (voz en off), el id de un personaje, o null si el plano no tiene voz. */
  speaker:          string | null;
  /** Lo que se dice en el plano, en el idioma del video. */
  line:             string | null;
  /** Texto corto sobreimpreso (titular), aparte de los subtítulos de la voz. */
  on_screen_text:   string | null;
  visual: {
    kind:          VisualKind;
    /** Prompt de imagen en inglés, sin texto ni logos. */
    image_prompt:  string;
    /** Movimiento para la animación (`animated` / `talking`). */
    motion_prompt: string | null;
    character_ids: string[];
    camera:        CameraMove;
    /** Foto ya existente para el plano (pieza anterior o subida): no se genera otra. */
    image_url?:    string | null;
  };
  transition:       Transition;
}

export interface VideoScript {
  version:        number;
  title:          string;
  /** Caption del post (no se ve en el video). */
  hook:           string;
  hashtags:       string[];
  language:       'es' | 'en';
  /** Estilo visual común a todas las imágenes, en inglés. */
  visual_style:   string;
  narrator: {
    voice: VoiceId;
    style: string;
  };
  music_mood:     string;
  characters:     VideoCharacter[];
  scenes:         VideoScene[];
}

// ─── Normalización ───────────────────────────────────────────────────────────

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function optStr(v: unknown, max: number): string | null {
  const s = str(v, max);
  return s ? s : null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function slug(v: unknown, fallback: string): string {
  const s = str(v, 40).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return s || fallback;
}

/**
 * Convierte la salida del modelo en un guion válido. Lanza solo si no hay
 * ninguna escena utilizable: todo lo demás tiene un valor por defecto.
 */
export function normalizeVideoScript(raw: unknown, language: 'es' | 'en'): VideoScript {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const characters: VideoCharacter[] = [];
  const seenChars = new Set<string>();
  for (const [i, c] of (Array.isArray(obj.characters) ? obj.characters : []).entries()) {
    if (!c || typeof c !== 'object' || characters.length >= CHARACTERS_MAX) continue;
    const ch = c as Record<string, unknown>;
    const look = str(ch.look, 300);
    if (!look) continue;
    const id = slug(ch.id, `char_${i + 1}`);
    if (seenChars.has(id) || id === 'narrator') continue;
    seenChars.add(id);
    characters.push({
      id,
      name:        str(ch.name, 60) || id,
      look,
      voice:       oneOf(ch.voice, VOICES, i % 2 === 0 ? 'coral' : 'ash'),
      voice_style: str(ch.voice_style, 200),
    });
  }

  const narratorObj = (obj.narrator && typeof obj.narrator === 'object' ? obj.narrator : {}) as Record<string, unknown>;

  const scenes: VideoScene[] = [];
  for (const s of Array.isArray(obj.scenes) ? obj.scenes : []) {
    if (!s || typeof s !== 'object' || scenes.length >= SCENES_MAX) continue;
    const sc = s as Record<string, unknown>;
    const visual = (sc.visual && typeof sc.visual === 'object' ? sc.visual : {}) as Record<string, unknown>;
    const imagePrompt = str(visual.image_prompt ?? sc.image_prompt, 400);
    // ~220 caracteres ≈ 13 s de voz: más que eso no cabe en un plano.
    const line = optStr(sc.line, LINE_MAX);
    const onScreen = optStr(sc.on_screen_text ?? sc.title, 80);
    if (!imagePrompt && !line && !onScreen) continue;

    const characterIds = (Array.isArray(visual.character_ids) ? visual.character_ids : [])
      .map((id) => slug(id, ''))
      .filter((id) => seenChars.has(id));

    let speaker: string | null = null;
    if (line) {
      const sp = slug(sc.speaker, 'narrator');
      speaker = seenChars.has(sp) ? sp : 'narrator';
    }

    let kind = oneOf(visual.kind, VISUAL_KINDS, 'still');
    // Lipsync solo tiene sentido si quien habla es un personaje que está en cuadro.
    if (kind === 'talking') {
      const speakerOnScreen = speaker && speaker !== 'narrator';
      if (!speakerOnScreen) kind = 'animated';
      else if (!characterIds.includes(speaker!)) characterIds.unshift(speaker!);
    }

    const order = scenes.length + 1;
    const duration = typeof sc.duration_seconds === 'number' && Number.isFinite(sc.duration_seconds)
      ? sc.duration_seconds : 3;

    scenes.push({
      id:               `s${order}`,
      order,
      duration_seconds: clamp(duration, SCENE_SECONDS_MIN, SCENE_SECONDS_MAX),
      speaker,
      line,
      on_screen_text:   onScreen,
      visual: {
        kind,
        image_prompt:  imagePrompt || 'cinematic abstract background, soft light, shallow depth of field',
        motion_prompt: optStr(visual.motion_prompt, 300),
        character_ids: [...new Set(characterIds)],
        camera:        oneOf(visual.camera, CAMERA_MOVES, 'push_in'),
      },
      transition: order === 1 ? 'cut' : oneOf(sc.transition, TRANSITIONS, 'crossfade'),
    });
  }

  if (scenes.length === 0) throw new Error('El guion no trae ninguna escena utilizable');

  // Personajes que ningún plano usa: no se generan (cuestan una imagen).
  const used = new Set(scenes.flatMap((s) => [...s.visual.character_ids, s.speaker ?? '']));

  return {
    version:      VIDEO_SCRIPT_VERSION,
    title:        str(obj.title, 120) || scenes[0]!.on_screen_text || '',
    hook:         str(obj.hook, 300),
    hashtags:     (Array.isArray(obj.hashtags) ? obj.hashtags : [])
      .filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
      .map((h) => (h.trim().startsWith('#') ? h.trim() : `#${h.trim()}`))
      .slice(0, 12),
    language,
    visual_style: str(obj.visual_style, 300),
    narrator: {
      voice: oneOf(narratorObj.voice, VOICES, 'nova'),
      style: str(narratorObj.style, 200),
    },
    music_mood:   str(obj.music_mood, 80),
    characters:   characters.filter((c) => used.has(c.id)),
    scenes,
  };
}

/** Lee un guion guardado en `metadata.video_script`, o null si no hay (pieza legacy). */
export function readVideoScript(metadata: unknown): VideoScript | null {
  const m = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : null;
  const s = m?.video_script;
  if (!s || typeof s !== 'object') return null;
  const script = s as VideoScript;
  return script.version === VIDEO_SCRIPT_VERSION && Array.isArray(script.scenes) && script.scenes.length > 0
    ? script
    : null;
}

/**
 * Escenas en el formato de siempre (`slides`), para las previews, el editor y
 * la biblioteca, que siguen leyendo `ReelScene[]`. El guion manda: esto es una
 * vista derivada.
 */
export function scriptToReelScenes(
  script: VideoScript,
  imageUrls: Record<string, string | null | undefined> = {},
): ReelScene[] {
  return script.scenes.map((s) => ({
    scene_order:      s.order,
    scene_id:         s.id,
    title:            s.on_screen_text ?? '',
    body:             s.line ?? '',
    duration_seconds: s.duration_seconds,
    image_prompt:     s.visual.image_prompt,
    image_url:        imageUrls[s.id] ?? null,
    text_baked:       false,
  }));
}

export interface MergeOptions {
  /**
   * Qué fotos ya existentes se pueden reutilizar. El servicio pasa el filtro
   * del Storage de Kefy: una URL cualquiera pegada en una escena no se manda
   * a los proveedores ni a Lambda.
   */
  isReusableImage?: (url: string) => boolean;
}

/**
 * Aplica al guion lo que el usuario editó en las escenas (`slides`) desde el
 * editor de la pieza: el titular y la línea de cada plano, y planos borrados,
 * reordenados o agregados. Sin esto, editar el texto de un reel no cambiaría
 * el video.
 *
 * Cada escena se empareja con su plano por `scene_id`, no por posición: borrar
 * la escena 2 no le pone a la 3 el personaje y el lipsync de la 2.
 */
export function mergeSlideEdits(script: VideoScript, slides: unknown, opts: MergeOptions = {}): VideoScript {
  if (!Array.isArray(slides) || slides.length === 0) return script;
  const byId = new Map(script.scenes.map((s) => [s.id, s]));
  const items = slides.slice(0, SCENES_MAX).map((raw) => (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>);
  const keyed = items.some((s) => typeof s.scene_id === 'string' && byId.has(s.scene_id));
  const used = new Set<string>();
  let nextId = 1 + Math.max(0, ...script.scenes.map((s) => Number(s.id.slice(1)) || 0));

  const scenes: VideoScene[] = items.map((slide, i) => {
    const candidate = keyed
      ? (typeof slide.scene_id === 'string' ? byId.get(slide.scene_id) : undefined)
      : script.scenes[i];
    const base = candidate && !used.has(candidate.id) ? candidate : undefined;
    if (base) used.add(base.id);

    const title = optStr(slide.title, 80);
    const body  = optStr(slide.body, LINE_MAX);
    // Una foto con el texto ya quemado no sirve de fondo: el montaje le pondría
    // encima titular y subtítulos otra vez (las anteriores a text_baked lo están).
    const imageUrl = typeof slide.image_url === 'string' && /^https:\/\//.test(slide.image_url)
      && slide.text_baked === false && (opts.isReusableImage?.(slide.image_url) ?? true)
      ? slide.image_url : null;

    if (!base) {
      return {
        id: `s${nextId++}`, order: i + 1,
        duration_seconds: clamp(typeof slide.duration_seconds === 'number' ? slide.duration_seconds : 3, SCENE_SECONDS_MIN, SCENE_SECONDS_MAX),
        speaker: body ? 'narrator' : null,
        line: body,
        on_screen_text: title,
        visual: {
          kind: 'still', image_prompt: str(slide.image_prompt, 400) || (title ?? body ?? 'cinematic background'),
          motion_prompt: null, character_ids: [], camera: 'push_in', image_url: imageUrl,
        },
        transition: i === 0 ? 'cut' : 'crossfade',
      };
    }
    // Una línea nueva sin hablante la dice el narrador; sin línea, no habla nadie.
    const speaker = body ? base.speaker ?? 'narrator' : null;
    return {
      ...base,
      order: i + 1,
      line: body,
      speaker,
      // Sin la línea del personaje no hay nada que sincronizar.
      visual: {
        ...base.visual,
        kind: base.visual.kind === 'talking' && speaker !== base.speaker ? 'animated' : base.visual.kind,
        // La foto que ya produjo una pasada anterior se reutiliza: rehacer el
        // video tras corregir un texto no vuelve a pagar las imágenes.
        ...(imageUrl ? { image_url: imageUrl } : {}),
      },
      on_screen_text: title,
      transition: i === 0 ? 'cut' : base.transition === 'cut' && base.order === 1 ? 'crossfade' : base.transition,
    };
  });
  return { ...script, scenes };
}

/**
 * Guion mínimo a partir de escenas de texto (reels anteriores al pipeline,
 * stories y conversiones de formato): cada escena es un plano con su foto si
 * ya la tenía, el titular sobreimpreso y el cuerpo como voz en off.
 */
export function scriptFromSlides(
  slides: unknown,
  language: 'es' | 'en',
  meta: { title?: string | null; hook?: string | null; hashtags?: string[] | null } = {},
  opts: MergeOptions = {},
): VideoScript | null {
  const base: VideoScript = {
    version: VIDEO_SCRIPT_VERSION,
    title: str(meta.title, 120),
    hook: str(meta.hook, 300),
    hashtags: Array.isArray(meta.hashtags) ? meta.hashtags.slice(0, 12) : [],
    language,
    visual_style: '',
    narrator: { voice: 'nova', style: 'Warm, clear and energetic social media voice-over.' },
    music_mood: '',
    characters: [],
    scenes: [],
  };
  const merged = mergeSlideEdits(base, slides, opts);
  if (merged.scenes.length === 0) return null;
  merged.scenes = merged.scenes.map((s, i) => ({
    ...s,
    visual: { ...s.visual, kind: i === 0 ? 'animated' : 'still' },
  }));
  return merged;
}
