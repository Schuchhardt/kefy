import { describe, it, expect } from 'vitest';
import { normalizeVideoScript } from '@/lib/video/script';
import { compileVideoPlan, COMPOSE_STEP_KEY, KEY_MOTION_SCENES, resolveRefs } from '@/lib/video/plan';
import { OPERATION_CREDIT_COSTS as C } from '@/lib/plans';

const FAL = { animation: true, lipsync: true };
const NO_FAL = { animation: false, lipsync: false };

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
});
