import { describe, it, expect } from 'vitest';
import {
  mergeSlideEdits, normalizeVideoScript, readVideoScript, scriptFromSlides, scriptToReelScenes,
} from '@/lib/video/script';

const raw = {
  title: 'Café de especialidad',
  hook: 'Así se hace un buen café ☕',
  hashtags: ['cafe', '#barista'],
  visual_style: 'warm 35mm film',
  narrator: { voice: 'nova', style: 'warm' },
  characters: [
    { id: 'Ana', name: 'Ana', look: 'woman in her 30s, curly hair, green apron', voice: 'coral', voice_style: 'friendly' },
    { id: 'beto', name: 'Beto', look: 'unused character', voice: 'not-a-voice' },
  ],
  scenes: [
    { duration_seconds: 40, speaker: 'narrator', line: '¿Sabías esto?', on_screen_text: '3 secretos', visual: { kind: 'animated', image_prompt: 'coffee pour', camera: 'push_in' } },
    { duration_seconds: 3, speaker: 'ana', line: 'Molemos cada mañana.', visual: { kind: 'talking', image_prompt: 'barista at counter', character_ids: [] } },
    { duration_seconds: 3, speaker: 'narrator', line: 'Ven a probarlo.', visual: { kind: 'talking', image_prompt: 'shop front' } },
    { visual: {} },
  ],
};

describe('normalizeVideoScript', () => {
  const script = normalizeVideoScript(raw, 'es');

  it('descarta planos vacíos y numera los que quedan', () => {
    expect(script.scenes.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(script.scenes[0]!.transition).toBe('cut');
  });

  it('acota la duración de cada plano', () => {
    expect(script.scenes[0]!.duration_seconds).toBe(10);
  });

  it('un plano «talking» exige que hable un personaje y lo pone en cuadro', () => {
    expect(script.scenes[1]!.visual.kind).toBe('talking');
    expect(script.scenes[1]!.visual.character_ids).toEqual(['ana']);
    // El narrador no tiene labios: el plano pasa a ser animado con voz en off.
    expect(script.scenes[2]!.visual.kind).toBe('animated');
  });

  it('no guarda personajes que ningún plano usa ni voces inventadas', () => {
    expect(script.characters.map((c) => c.id)).toEqual(['ana']);
    expect(script.hashtags).toEqual(['#cafe', '#barista']);
  });

  it('readVideoScript solo acepta guiones de la versión actual', () => {
    expect(readVideoScript({ video_script: script })).toEqual(script);
    expect(readVideoScript({ video_script: { ...script, version: 99 } })).toBeNull();
    expect(readVideoScript(null)).toBeNull();
  });

  it('lanza si no hay ningún plano utilizable', () => {
    expect(() => normalizeVideoScript({ scenes: [{}] }, 'es')).toThrow();
  });
});

describe('mergeSlideEdits', () => {
  const script = normalizeVideoScript(raw, 'es');

  it('empareja por scene_id: borrar o reordenar escenas no cambia el personaje ni el lipsync de cada plano', () => {
    const slides = scriptToReelScenes(script);
    // Se borra el primer plano y se invierten los dos restantes.
    const edited = [slides[2]!, slides[1]!];
    const merged = mergeSlideEdits(script, edited);
    expect(merged.scenes.map((s) => s.id)).toEqual(['s3', 's2']);
    expect(merged.scenes[1]).toMatchObject({ speaker: 'ana', visual: { kind: 'talking', character_ids: ['ana'] } });
    expect(merged.scenes[0]).toMatchObject({ order: 1, transition: 'cut' });
  });

  it('una escena nueva sin scene_id recibe un id que no choca con los existentes', () => {
    const slides = [...scriptToReelScenes(script), { scene_order: 9, title: 'Nueva', body: 'Algo' }];
    const merged = mergeSlideEdits(script, slides);
    expect(merged.scenes.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('si cambia quién habla, el plano deja de ser lipsync', () => {
    const slides = scriptToReelScenes(script);
    slides[1]!.body = '';
    expect(mergeSlideEdits(script, slides).scenes[1]!.visual.kind).toBe('animated');
  });

  it('lleva al guion el texto editado en las escenas y reutiliza las fotos ya producidas', () => {
    const slides = scriptToReelScenes(script, { s1: 'https://cdn.example.com/s1.jpg' });
    slides[0]!.body = 'Línea nueva';
    slides[1]!.title = 'Titular nuevo';
    const merged = mergeSlideEdits(script, slides);
    expect(merged.scenes[0]!.line).toBe('Línea nueva');
    expect(merged.scenes[0]!.visual.image_url).toBe('https://cdn.example.com/s1.jpg');
    expect(merged.scenes[1]!.on_screen_text).toBe('Titular nuevo');
    expect(merged.scenes[1]!.speaker).toBe('ana');
  });

  it('una escena sin texto hablado queda sin voz; una escena agregada entra como foto con narrador', () => {
    const slides = [
      ...scriptToReelScenes(script).map((s, i) => (i === 0 ? { ...s, body: '' } : s)),
      { scene_order: 4, title: 'Nueva', body: 'Algo más', duration_seconds: 3 },
    ];
    const merged = mergeSlideEdits(script, slides);
    expect(merged.scenes[0]!.speaker).toBeNull();
    expect(merged.scenes).toHaveLength(4);
    expect(merged.scenes[3]).toMatchObject({ id: 's4', speaker: 'narrator', line: 'Algo más', visual: { kind: 'still' } });
  });
});

describe('scriptFromSlides', () => {
  it('convierte escenas de texto en planos con voz en off y anima el primero', () => {
    const script = scriptFromSlides([
      { scene_order: 1, title: 'Hook', body: 'Mira esto', duration_seconds: 3, image_url: 'https://cdn.example.com/a.jpg', text_baked: false },
      { scene_order: 2, title: 'CTA', body: 'Síguenos', duration_seconds: 3 },
    ], 'es', { hook: 'caption' });
    expect(script!.scenes[0]!.visual).toMatchObject({ kind: 'animated', image_url: 'https://cdn.example.com/a.jpg' });
    expect(script!.scenes[1]!.visual.kind).toBe('still');
    expect(script!.scenes.every((s) => s.speaker === 'narrator')).toBe(true);
  });

  it('una foto con el texto quemado (o sin el dato, como las anteriores) no se reutiliza', () => {
    const script = scriptFromSlides([
      { scene_order: 1, title: 'A', body: 'a', image_url: 'https://cdn.example.com/a.jpg' },
      { scene_order: 2, title: 'B', body: 'b', image_url: 'https://cdn.example.com/b.jpg', text_baked: true },
    ], 'es');
    expect(script!.scenes.map((s) => s.visual.image_url)).toEqual([null, null]);
  });

  it('solo reutiliza fotos que pasan el filtro (Storage de Kefy)', () => {
    const script = scriptFromSlides([
      { scene_order: 1, title: 'A', body: 'a', image_url: 'https://evil.example.com/a.jpg', text_baked: false },
      { scene_order: 2, title: 'B', body: 'b', image_url: 'https://kefy.storage/b.jpg', text_baked: false },
    ], 'es', {}, { isReusableImage: (u) => u.startsWith('https://kefy.storage/') });
    expect(script!.scenes.map((s) => s.visual.image_url)).toEqual([null, 'https://kefy.storage/b.jpg']);
  });

  it('sin escenas no hay guion', () => {
    expect(scriptFromSlides([], 'es')).toBeNull();
  });
});
