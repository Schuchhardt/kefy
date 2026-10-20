// generate_image — una foto por plano (y una de referencia por personaje).
// Síncrona: gpt-image vía generateContentImage, con la paleta de la marca y
// las imágenes de referencia (el retrato del personaje, para que sea la misma
// persona en todos los planos).

import { generateContentImage } from '@/lib/ai';
import { uploadBase64Image } from '@/lib/storage';
import { TOOL_CREDIT_OPERATION, type VideoTool } from './types';

type Quality = 'low' | 'medium' | 'high';

export const generateImageTool: VideoTool = {
  name:     'generate_image',
  label:    { es: 'Generar imagen', en: 'Generate image' },
  summary:  {
    es: 'Foto vertical del plano (o retrato del personaje) con la paleta de la marca.',
    en: 'Vertical picture for the shot (or character portrait) using the brand palette.',
  },
  provider: 'openai',
  credit:   TOOL_CREDIT_OPERATION.generate_image,
  mode:     'sync',
  available: () => !!process.env.OPENAI_API_KEY,

  async run(ctx, input) {
    const prompt = typeof input.prompt === 'string' ? input.prompt : '';
    if (!prompt) return { status: 'failed', error: 'generate_image: falta prompt' };
    const refs = Array.isArray(input.reference_image_urls)
      ? input.reference_image_urls.filter((u): u is string => typeof u === 'string' && u.startsWith('http')).slice(0, 3)
      : [];
    const brand = (input.brand && typeof input.brand === 'object' ? input.brand : {}) as Record<string, unknown>;
    const quality = (['low', 'medium', 'high'] as const).includes(input.quality as Quality)
      ? (input.quality as Quality) : 'medium';

    const img = await generateContentImage({
      prompt,
      size:    '1024x1792',
      quality,
      brand: {
        name:           typeof brand.name === 'string' ? brand.name : undefined,
        primaryColor:   typeof brand.primaryColor === 'string' ? brand.primaryColor : undefined,
        secondaryColor: typeof brand.secondaryColor === 'string' ? brand.secondaryColor : undefined,
        accentColor:    typeof brand.accentColor === 'string' ? brand.accentColor : undefined,
      },
      referenceImages: refs.length ? refs : undefined,
    });
    const imageUrl = await uploadBase64Image(img.b64, ctx.orgId, `video-${ctx.stepKey}.jpeg`);
    return { status: 'done', output: { image_url: imageUrl } };
  },
};
