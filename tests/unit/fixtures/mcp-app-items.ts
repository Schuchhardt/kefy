// ─── Fixtures reales (anonimizados) para los tests de las vistas MCP Apps ────
//
// Filas de kefy_content_items de la marca Kefy, tal como las devolvía
// get_content el 2026-11-04: el reel 286f513e-… (5 escenas, video listo) y la
// story 9f2986df-… (solo imagen: sin título, cuerpo ni guion de video).
//
// Anonimizados: ids → los de tests/unit/helpers/assistant.ts, el proyecto de
// Supabase y el bucket de Remotion → nombres de prueba, la carpeta de la org en
// Storage → un uuid de prueba. El texto se conserva (es copy de marketing).

import { IDS } from '../helpers/assistant';

export const REEL_ID = IDS.uuid(286);
export const STORY_ID = IDS.uuid(9298);

export const STORAGE = 'https://kefy-test.supabase.co/storage/v1/object/public';
const FOLDER = '00000000-0000-4000-8000-0000000000aa';
export const S3 = 'https://s3.us-east-2.amazonaws.com/remotionlambda-useast2-test/renders';

const scene = (n: number, title: string, body: string, ts: string, duration = 3) => ({
  slide_order: n,
  title,
  body,
  image_url: `${STORAGE}/kefy-content-images/${FOLDER}/${ts}-reel-scene-${n}-${ts}.jpeg`,
  duration_seconds: duration,
});

export function reelRow(over: Record<string, unknown> = {}) {
  return {
    id: REEL_ID,
    org_id: IDS.ORG,
    brand_id: IDS.BRAND,
    content_type: 'reel',
    channel: 'generic',
    status: 'draft',
    title: '¿Sigues creando contenido manualmente? 🤯 Descubre cómo Kefy hace TODO por ti con un solo clic. ¡Tu competencia ya lo usa!',
    body: '¿Sigues creando contenido manualmente? 🤯 Descubre cómo Kefy hace TODO por ti con un solo clic. ¡Tu competencia ya lo usa!',
    hashtags: ['#AutomatizaciónDigital', '#IAparaNegocios', '#MarketingConIA', '#RedesSocialesFácil', '#Kefy', '#ContentCreator', '#EmprendedoresDigitales', '#TechTips'],
    image_url: `${STORAGE}/kefy-content-images/${FOLDER}/1790447709441-reel-scene-1-1790447709441.jpeg`,
    image_status: null,
    video_url: `${S3}/8lmwf17rql/out.mp4`,
    render_status: 'ready',
    slides: [
      scene(1, 'Un clic. Eso es TODO.', 'Mientras otros pasan horas creando contenido, tú solo presionas un botón', '1790447709441'),
      scene(2, 'Posts que enamoran 💜', 'La IA de Kefy escribe textos que conectan con tu audiencia ideal', '1790447712702'),
      scene(3, 'Carruseles profesionales', 'Diseños impactantes generados automáticamente para tu marca', '1790447713449'),
      scene(4, 'Reels que EXPLOTAN 🚀', 'Videos verticales optimizados para el algoritmo sin editar nada', '1790447712574'),
      scene(5, 'Publicación automática TOTAL', 'Instagram, TikTok, LinkedIn, Facebook... Kefy lo hace por ti', '1790447713980', 4),
    ],
    metadata: { created_via: 'ui' },
    created_by: IDS.USER,
    created_at: '2026-09-26T18:35:14.682824+00:00',
    updated_at: '2026-09-26T18:39:52.606396+00:00',
    kefy_users: { name: 'Seba' },
    ...over,
  };
}

export function storyRow(over: Record<string, unknown> = {}) {
  return {
    id: STORY_ID,
    org_id: IDS.ORG,
    brand_id: IDS.BRAND,
    content_type: 'story',
    channel: 'generic',
    status: 'draft',
    title: null,
    body: null,
    hashtags: [],
    image_url: `${STORAGE}/kefy-content-media/${FOLDER}/images/1792724016425-story-solo-imagen.jpg`,
    image_status: null,
    video_url: null,
    render_status: 'not_rendered',
    slides: null,
    metadata: { created_via: 'ui' },
    created_by: IDS.USER,
    created_at: '2026-10-23T02:53:46.81365+00:00',
    updated_at: '2026-10-23T02:53:46.81365+00:00',
    kefy_users: { name: 'Seba' },
    ...over,
  };
}
