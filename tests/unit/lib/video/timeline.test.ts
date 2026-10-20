import { describe, it, expect } from 'vitest';
import { normalizeVideoScript } from '@/lib/video/script';
import { buildFilmProps, OUTRO_SECONDS, SPEECH_LEAD_SECONDS, SPEECH_TAIL_SECONDS } from '@/lib/video/timeline';
import { resolveFilmTheme } from '@/lib/video/brand';

const script = normalizeVideoScript({
  characters: [{ id: 'ana', name: 'Ana', look: 'barista', voice: 'coral' }],
  scenes: [
    { duration_seconds: 3, speaker: 'ana', line: 'Hola a todos', visual: { kind: 'talking', image_prompt: 'a', character_ids: ['ana'] } },
    { duration_seconds: 3, speaker: 'narrator', line: 'Mira esto', visual: { kind: 'animated', image_prompt: 'b' } },
    { duration_seconds: 4, speaker: 'narrator', line: 'Y esto', visual: { kind: 'still', image_prompt: 'c' } },
    { duration_seconds: 2.5, speaker: null, line: null, on_screen_text: 'Fin', visual: { kind: 'still', image_prompt: 'd' } },
  ],
}, 'es');

const voice = (d: number) => ({
  audio_url: 'https://cdn/v.wav', duration_seconds: d, words: [{ text: 'Hola', start: 0, end: 0.4 }],
});

describe('buildFilmProps', () => {
  const props = buildFilmProps(script, {
    img_s1: { image_url: 'https://cdn/1.jpg' },
    anim_s1: { video_url: 'https://cdn/1.mp4', clip_seconds: 5 },
    lips_s1: { video_url: 'https://cdn/1-lips.mp4', has_audio: true },
    voice_s1: voice(2),
    img_s2: { image_url: 'https://cdn/2.jpg' },
    anim_s2: { video_url: 'https://cdn/2.mp4', clip_seconds: 5 },
    voice_s2: voice(3),
    voice_s3: voice(1.2),
    // s3 sin imagen (falló), s4 sin nada.
  }, resolveFilmTheme({ name: 'Marca', accent_color: '#ff0000' }), 'track.mp3');

  it('elige el mejor visual disponible de cada plano: lipsync → clip → foto → fondo', () => {
    expect(props.scenes[0]!.visual).toMatchObject({ type: 'video', src: 'https://cdn/1-lips.mp4', has_audio: true });
    expect(props.scenes[1]!.visual).toMatchObject({ type: 'video', src: 'https://cdn/2.mp4', has_audio: false });
    expect(props.scenes[2]!.visual).toEqual({ type: 'none' });
    expect(props.scenes[3]!.visual).toEqual({ type: 'none' });
  });

  it('los clips llevan la foto del plano debajo, por si terminan antes que el plano', () => {
    expect(props.scenes[0]!.visual).toMatchObject({ poster: 'https://cdn/1.jpg', clip_seconds: 2 });
    expect(props.scenes[1]!.visual).toMatchObject({ poster: 'https://cdn/2.jpg', clip_seconds: 5 });
  });

  it('una voz larga nunca se corta', () => {
    const long = buildFilmProps(script, { voice_s3: voice(18) }, resolveFilmTheme(null));
    expect(long.scenes[2]!.duration_seconds).toBeGreaterThan(18);
  });

  it('la voz va dentro del clip con lipsync y aparte en el resto', () => {
    expect(props.scenes[0]!.voice).toBeNull();
    expect(props.scenes[0]!.speech_offset).toBe(0);
    expect(props.scenes[1]!.voice).toEqual({ src: 'https://cdn/v.wav' });
    expect(props.scenes[1]!.speech_offset).toBe(SPEECH_LEAD_SECONDS);
  });

  it('la duración del plano la manda la voz, no la estimación del guion', () => {
    expect(props.scenes[0]!.duration_seconds).toBeCloseTo(2 + SPEECH_TAIL_SECONDS, 2);
    expect(props.scenes[1]!.duration_seconds).toBeCloseTo(SPEECH_LEAD_SECONDS + 3 + SPEECH_TAIL_SECONDS, 2);
    // Voz muy corta: nunca por debajo del mínimo.
    expect(props.scenes[2]!.duration_seconds).toBeGreaterThanOrEqual(1.5);
    // Sin voz, la del guion.
    expect(props.scenes[3]!.duration_seconds).toBe(2.5);
    expect(props.scenes[3]!.words).toEqual([]);
  });

  it('lleva el tema de marca, música, subtítulos y cierre con la marca', () => {
    expect(props).toMatchObject({ musicTrack: 'track.mp3', captions: true, theme: { brandName: 'Marca', accent: '#ff0000' } });
    expect(props.outro).toEqual({ duration_seconds: OUTRO_SECONDS, headline: null });
  });

  it('sin nombre ni logo de marca no hay tarjeta de cierre', () => {
    expect(buildFilmProps(script, {}, resolveFilmTheme(null)).outro).toBeNull();
  });
});

describe('buildFilmProps con un clip que dice la línea', () => {
  const words = [{ text: 'Hola', start: 0.3, end: 0.6 }, { text: 'a', start: 0.6, end: 0.7 }, { text: 'todos', start: 0.7, end: 1.1 }];

  it('el clip trae la voz: dura lo que el clip, sin voz aparte, con sus subtítulos', () => {
    const props = buildFilmProps(script, {
      img_s1: { image_url: 'https://cdn/1.jpg' },
      anim_s1: { video_url: 'https://cdn/1.mp4', clip_seconds: 6, has_audio: true, words },
    }, resolveFilmTheme({ name: 'Marca' }));
    const s1 = props.scenes[0]!;
    expect(s1.visual).toMatchObject({ type: 'video', src: 'https://cdn/1.mp4', has_audio: true, clip_seconds: 6 });
    expect(s1.voice).toBeNull();
    expect(s1.duration_seconds).toBe(6);
    expect(s1.speech_offset).toBe(0);
    expect(s1.words).toEqual(words);
  });

  it('si el clip que hablaba falló, la línea al menos se lee en subtítulos', () => {
    const props = buildFilmProps(script, { img_s1: { image_url: 'https://cdn/1.jpg' } }, resolveFilmTheme({ name: 'Marca' }));
    const s1 = props.scenes[0]!;
    expect(s1.visual).toEqual({ type: 'image', src: 'https://cdn/1.jpg' });
    expect(s1.words.map((w) => w.text)).toEqual(['Hola', 'a', 'todos']);
  });
});
