import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { KEFY_COPY } from '@/lib/content';
import esCommon from '@/locales/es/common';
import enCommon from '@/locales/en/common';

// ─── Imagen para compartir (Open Graph) ──────────────────────────────────────
//
// Antes los metadatos apuntaban a /og-image.png, que nunca existió: el proxy
// devolvía HTML y Facebook, WhatsApp, Instagram y LinkedIn mostraban el link
// sin imagen. Ahora la imagen se genera aquí, una por idioma, con la
// convención de archivos de Next: el <meta og:image> (con ancho, alto, tipo y
// alt) lo pone Next solo y la sirve con caché inmutable.
//
// Reglas de Meta que sigue el diseño:
// - 1200×630 (1,91:1), el tamaño que Facebook muestra grande sin recortar.
// - PNG plano de pocos colores: pesa decenas de KB, muy por debajo de los
//   ~300 KB a partir de los cuales WhatsApp deja de mostrar la miniatura.
// - Todo lo importante va centrado y con margen: WhatsApp y Messenger recortan
//   la miniatura a un cuadrado y el centro es lo único que sobrevive.
// - Los textos salen de los locales: si cambia el hero, cambia la imagen.

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BG = '#08080A';
const ACCENT = '#C6FF4B';
const MUTED = 'rgba(255,255,255,0.68)';

const metaCopy = { es: esCommon, en: enCommon };

export async function generateImageMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const c = (metaCopy[lang as 'es' | 'en'] ?? metaCopy.es).metadata;
  return [{ id: 'default', alt: c.title, size, contentType }];
}

export default async function OpengraphImage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const copy = KEFY_COPY[lang] ?? KEFY_COPY.es;

  // Rutas literales: con una ruta armada en variable, el bundler no sabe qué
  // archivo se lee y traza el proyecto entero.
  const [syneBold, dmSans, icon] = await Promise.all([
    readFile(join(process.cwd(), 'assets', 'fonts', 'Syne-700.ttf')),
    readFile(join(process.cwd(), 'assets', 'fonts', 'DM-Sans-400.ttf')),
    readFile(join(process.cwd(), 'public', 'android-chrome-512x512.png')),
  ]);
  const iconSrc = `data:image/png;base64,${icon.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: BG,
          backgroundImage: `radial-gradient(ellipse 70% 60% at 50% 0%, rgba(198,255,75,0.16) 0%, rgba(198,255,75,0) 100%)`,
          color: '#fff',
          fontFamily: 'DM Sans',
          padding: '0 96px',
          textAlign: 'center',
        }}
      >
        {/* El PNG del ícono trae aire alrededor: el margen negativo lo pega al
            logotipo como en el nav. */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 36 }}>
          <img src={iconSrc} width={104} height={104} alt="" style={{ marginRight: -8 }} />
          <div style={{ display: 'flex', fontFamily: 'Syne', fontSize: 56, letterSpacing: '-0.04em' }}>
            <span>Kef</span>
            <span style={{ color: ACCENT }}>y</span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            fontFamily: 'Syne',
            fontSize: 68,
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            maxWidth: 1000,
            justifyContent: 'center',
            // Reparte las líneas: sin esto «días.» quedaba sola en la segunda.
            textWrap: 'balance',
          }}
        >
          {copy.hero.h1.join(' ')}
        </div>

        <div style={{ display: 'flex', fontSize: 32, lineHeight: 1.35, color: MUTED, marginTop: 26, maxWidth: 900 }}>
          {copy.hero.h1em}
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 44,
            padding: '14px 28px',
            borderRadius: 999,
            background: ACCENT,
            color: BG,
            fontFamily: 'Syne',
            fontSize: 24,
          }}
        >
          {copy.cta.note}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Syne', data: syneBold, weight: 700, style: 'normal' },
        { name: 'DM Sans', data: dmSans, weight: 400, style: 'normal' },
      ],
    },
  );
}
