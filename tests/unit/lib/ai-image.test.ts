import { beforeEach, describe, expect, it, vi } from 'vitest';

const generate = vi.hoisted(() => vi.fn());
const edit = vi.hoisted(() => vi.fn());
const extend = vi.hoisted(() => vi.fn(async () => Buffer.from('extendida')));

vi.mock('@/lib/image-processor', () => ({ extendToStoryCanvas: extend }));

vi.mock('openai', () => ({
  default: class { images = { generate, edit }; },
  toFile: vi.fn(async (buf: Buffer, name: string) => ({ buf, name })),
}));

import { generateContentImage, IMAGE_MODELS } from '@/lib/ai';

const LOGO = Buffer.from('logo').toString('base64');

beforeEach(() => {
  vi.resetAllMocks();
  process.env.OPENAI_API_KEY = 'test';
  generate.mockResolvedValue({ data: [{ b64_json: 'AAAA' }] });
  edit.mockResolvedValue({ data: [{ b64_json: 'AAAA' }] });
});

describe('generateContentImage', () => {
  it('las fotos usan Flare, prohíben el texto y conservan su flujo', async () => {
    await generateContentImage({ prompt: 'una cafetería', size: '1024x1536' });

    const params = generate.mock.calls[0][0];
    expect(params.model).toBe(IMAGE_MODELS.photo);
    expect(params.model).toBe('gpt-image-2.6-flare');
    expect(params.size).toBe('1024x1536');
    expect(params.prompt).toContain('ABSOLUTELY NO text');
  });

  it('las infografías usan Sunburst y una plantilla que exige imprimir el texto', async () => {
    await generateContentImage({
      prompt: 'Headline: "3 pasos"', size: '1024x1280', style: 'infographic',
      brand: { primaryColor: '#123456', fontHeading: 'Poppins', fontBody: 'Lora' },
    });

    const params = generate.mock.calls[0][0];
    expect(params.model).toBe('gpt-image-2.6-sunburst');
    expect(params.size).toBe('1024x1280');
    expect(params.prompt).toContain('Headline: "3 pasos"');
    expect(params.prompt).toContain('#123456');
    expect(params.prompt).toContain('headline in Poppins bold, everything else in Lora');
    expect(params.prompt).not.toContain('ABSOLUTELY NO text');
    expect(params.prompt).not.toContain('{{');
  });

  it('una story con texto generado sale extendida a 9:16; una foto no se toca', async () => {
    const story = await generateContentImage({ prompt: 'x', style: 'infographic', format: 'story', size: '1024x1280' });
    expect(generate.mock.calls[0][0].prompt).toContain('plain, flat background');
    expect(Buffer.from(story.b64, 'base64').toString()).toBe('extendida');

    extend.mockClear();
    const photo = await generateContentImage({ prompt: 'x', format: 'story', size: '1024x1536' });
    expect(extend).not.toHaveBeenCalled();
    expect(photo.b64).toBe('AAAA');
  });

  it('la fuente sale del Brand Kit; sin elegir o fuera del catálogo, Inter', async () => {
    await generateContentImage({ prompt: 'x', style: 'infographic', brand: { fontHeading: 'Fuente Inventada' } });
    expect(generate.mock.calls[0][0].prompt).toContain('headline in Inter bold, everything else in Inter');
  });

  it('el logo pasa por images.edit con el mismo modelo', async () => {
    await generateContentImage({
      prompt: 'x', style: 'infographic', brand: { logoB64: LOGO, logoMimeType: 'image/png' },
    });

    expect(generate).not.toHaveBeenCalled();
    const params = edit.mock.calls[0][0];
    expect(params.model).toBe(IMAGE_MODELS.infographic);
    expect(params.prompt).toContain('without redrawing it');
  });

  // La API exige lados múltiplos de 16 y responde 400 a 1080x1080.
  it('convierte los tamaños que la API rechaza', async () => {
    for (const size of ['1080x1080', 'auto', undefined] as const) {
      generate.mockClear();
      await generateContentImage({ prompt: 'x', size });
      expect(generate.mock.calls[0][0].size).toBe('1024x1024');
    }
  });
});
