import { describe, it, expect } from 'vitest';
import { normalizeVideoScript } from '@/lib/video/script';
import { compileVideoPlan, COMPOSE_STEP_KEY, KEY_MOTION_SCENES, resolveRefs, speakingClipSeconds } from '@/lib/video/plan';
import { OPERATION_CREDIT_COSTS as C } from '@/lib/plans';

const FAL = { animation: true, lipsync: true };
const NO_FAL = { animation: false, lipsync: false };
/** Higgsfield: el clip trae el audio, sin lipsync. */
const HF = { animation: true, lipsync: false, speech_in_clip: true };

function script(kinds: Array<'still' | 'animated' | 'talking'>) {
  return normalizeVideoScript({
    characters: [{ id: 'ana', name: 'Ana', look: 'barista', voice: 'coral' }],
    scenes: kinds.map((kind, i) => ({
      duration_seconds: 3,
      speaker: kind === 'talking' ? 'ana' : 'narrator',
      line: `Línea ${i + 1}`,
      visual: { kind, image_prompt: `shot ${i + 1}`, character_ids: kind === 'talking' ? ['ana'] : [] },
    })),
  }, 'es');
}

describe('compileVideoPlan', () => {
  it('un plano con personaje que habla: retrato → imagen → animación → lipsync, con su voz', () => {
    const plan = compileVideoPlan(script(['talking']), { capabilities: FAL });
    const byKey = Object.fromEntries(plan.steps.map((s) => [s.key, s]));

    expect(Object.keys(byKey)).toEqual(['char_ana', 'img_s1', 'voice_s1', 'anim_s1', 'lips_s1', COMPOSE_STEP_KEY]);
    expect(byKey.img_s1!.depends_on).toEqual(['char_ana']);
    expect(byKey.img_s1!.input.reference_image_urls).toEqual([{ $ref: 'char_ana.image_url' }]);
    expect(byKey.anim_s1!.input.image_url).toEqual({ $ref: 'img_s1.image_url' });
    expect(byKey.lips_s1!.depends_on).toEqual(['anim_s1', 'voice_s1']);
    expect(byKey.voice_s1!.input.voice).toBe('coral');
    expect(byKey[COMPOSE_STEP_KEY]!.depends_on).toHaveLength(5);
    expect(byKey[COMPOSE_STEP_KEY]!.optional).toBe(false);
  });

  it('cotiza sumando cada herramienta', () => {
    const plan = compileVideoPlan(script(['talking']), { capabilities: FAL });
    expect(plan.credits).toBe(2 * C.image + C.voice + C.animation + C.lipsync + C.video);
    expect(plan.by_tool.generate_image).toEqual({ count: 2, credits: 2 * C.image });
  });

  it('sin fal.ai configurado no hay animación ni lipsync, y lo avisa', () => {
    const plan = compileVideoPlan(script(['animated', 'talking']), { capabilities: NO_FAL });
    expect(plan.steps.some((s) => s.tool === 'animate_image' || s.tool === 'lip_sync')).toBe(false);
    expect(plan.steps.filter((s) => s.tool === 'text_to_speech')).toHaveLength(2);
    expect(plan.notes.length).toBeGreaterThan(0);
  });

  it(`«key» anima como mucho ${KEY_MOTION_SCENES} planos, empezando por el hook`, () => {
    const plan = compileVideoPlan(script(['animated', 'still', 'animated', 'animated', 'animated']), { capabilities: FAL });
    const animated = plan.steps.filter((s) => s.tool === 'animate_image').map((s) => s.scene_id);
    expect(animated).toHaveLength(KEY_MOTION_SCENES);
    expect(animated).toContain('s1');
    expect(animated).not.toContain('s2');
  });

  it('«none» no anima nada y «full» anima todos los planos', () => {
    const s = script(['animated', 'still', 'still']);
    expect(compileVideoPlan(s, { capabilities: FAL, motion: 'none' }).steps.filter((x) => x.tool === 'animate_image')).toHaveLength(0);
    expect(compileVideoPlan(s, { capabilities: FAL, motion: 'full' }).steps.filter((x) => x.tool === 'animate_image')).toHaveLength(3);
  });

  it('una foto ya existente no se vuelve a generar', () => {
    const s = script(['animated']);
    s.scenes[0]!.visual.image_url = 'https://cdn.example.com/given.jpg';
    const plan = compileVideoPlan(s, { capabilities: FAL });
    expect(plan.steps.some((x) => x.key === 'img_s1')).toBe(false);
    const anim = plan.steps.find((x) => x.key === 'anim_s1')!;
    expect(anim.input.image_url).toBe('https://cdn.example.com/given.jpg');
    expect(anim.depends_on).toEqual([]);
  });

  it('sin generar imágenes (generate_images:false o sin OpenAI) no hay fotos ni nada que animar', () => {
    const s = script(['animated', 'talking']);
    for (const plan of [
      compileVideoPlan(s, { capabilities: FAL, generate_images: false }),
      compileVideoPlan(s, { capabilities: { ...FAL, images: false } }),
    ]) {
      expect(plan.steps.map((x) => x.tool)).toEqual(['text_to_speech', 'text_to_speech', 'compose_video']);
    }
  });

  it('sin voz no hay locución ni lipsync, y lo avisa', () => {
    const plan = compileVideoPlan(script(['talking']), { capabilities: { ...FAL, voice: false } });
    expect(plan.steps.some((x) => x.tool === 'text_to_speech' || x.tool === 'lip_sync')).toBe(false);
    expect(plan.notes.some((n) => /voz/.test(n.es))).toBe(true);
  });

  it('la voz lleva el acento de la marca y un estilo de respaldo', () => {
    const s = normalizeVideoScript({ scenes: [{ speaker: 'narrator', line: 'Hola', visual: { image_prompt: 'x' } }] }, 'es');
    const voice = compileVideoPlan(s, { capabilities: FAL, voice_accent: 'Speak in natural Castilian Spanish from Spain.' })
      .steps.find((x) => x.tool === 'text_to_speech')!;
    expect(voice.input.instructions).toMatch(/voice-over/);
    expect(voice.input.instructions).toMatch(/Castilian/);
  });

  it('un plano mudo no lleva voz', () => {
    const s = normalizeVideoScript({ scenes: [{ speaker: null, line: null, on_screen_text: 'Solo texto', visual: { image_prompt: 'x' } }] }, 'es');
    expect(compileVideoPlan(s, { capabilities: FAL }).steps.some((x) => x.tool === 'text_to_speech')).toBe(false);
  });
});

describe('resolveRefs', () => {
  it('sustituye referencias por salidas y descarta las que no existen en listas', () => {
    const input = { image_url: { $ref: 'img_s1.image_url' }, refs: [{ $ref: 'char_a.image_url' }, 'https://x/y.jpg'], n: 5 };
    expect(resolveRefs(input, { img_s1: { image_url: 'https://cdn/s1.jpg' } })).toEqual({
      image_url: 'https://cdn/s1.jpg', refs: ['https://x/y.jpg'], n: 5,
    });
  });

  describe('con un modelo que genera el audio del clip (Higgsfield)', () => {
    it('el personaje dice su línea en el clip: sin voz ni lipsync aparte', () => {
      const plan = compileVideoPlan(script(['talking']), { capabilities: HF });
      expect(plan.steps.map((s) => s.key)).toEqual(['char_ana', 'img_s1', 'anim_s1', COMPOSE_STEP_KEY]);
      const anim = plan.steps.find((s) => s.key === 'anim_s1')!;
      expect(anim.input).toMatchObject({ speech: 'Línea 1', language: 'es', duration: speakingClipSeconds('Línea 1') });
      expect(anim.input.prompt).toContain('"Línea 1"');
      expect(anim.input.prompt).toContain('Spanish');
      expect(plan.credits).toBe(2 * C.image + C.animation + C.video);
      expect(plan.notes.some((n) => /lipsync/i.test(n.es))).toBe(false);
    });

    it('el narrador sigue siendo voz en off y los planos animados no piden audio', () => {
      const plan = compileVideoPlan(script(['animated', 'talking']), { capabilities: HF });
      expect(plan.steps.filter((s) => s.tool === 'text_to_speech').map((s) => s.key)).toEqual(['voice_s1']);
      expect(plan.steps.find((s) => s.key === 'anim_s1')!.input.speech).toBeUndefined();
    });

    it('si el plano que habla no se anima (motion none), la línea vuelve a ser TTS', () => {
      const plan = compileVideoPlan(script(['talking']), { capabilities: HF, motion: 'none' });
      expect(plan.steps.some((s) => s.key === 'voice_s1')).toBe(true);
      expect(plan.steps.some((s) => s.tool === 'animate_image')).toBe(false);
    });

    it('el largo del clip alcanza para decir la línea, entre 4 y 15 s', () => {
      expect(speakingClipSeconds('Hola')).toBe(4);
      expect(speakingClipSeconds(Array(20).fill('palabra').join(' '))).toBe(10);
      expect(speakingClipSeconds(Array(80).fill('palabra').join(' '))).toBe(15);
    });
  });
});
