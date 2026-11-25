// ─── Layout raíz de todas las páginas ────────────────────────────────────────
//
// Es el layout raíz (no hay app/layout.tsx): así <html lang> sale del servidor
// con el idioma de la ruta. Antes el <html> lo pintaba app/layout.tsx sin
// `lang` y un componente lo ponía con JavaScript ya en el navegador: los
// crawlers que no ejecutan JS (Bing, los de motores de respuesta con IA) no
// veían el idioma. Es el patrón de Next para i18n (layout raíz en [lang]).
// La raíz `/` tiene su propio layout mínimo en app/(root). Ver docs/seo-aeo.md.

import type { Metadata, Viewport } from 'next';
import { Syne, DM_Sans } from 'next/font/google';
import '../globals.css';
import PwaUpdater from '@/components/PwaUpdater';
import { locales, toLocale } from '@/lib/i18n';
import { shareMetadata } from '@/lib/share-metadata';
import { THEME_BOOT_SCRIPT } from '@/lib/theme-boot';
import { ThemeProvider } from '@/lib/theme-context';
import esCommon from '@/locales/es/common';
import enCommon from '@/locales/en/common';

const commonCopy = { es: esCommon, en: enCommon };

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  weight: ['600', '700', '800'],
});

// Solo los pesos que se usan (el 300 no aparecía en ningún estilo). La
// monoespaciada ya no se descarga: JetBrains Mono solo servía para notas de
// 12px y --font-jetbrains cae en la del sistema (ver globals.css).
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['400', '500', '600'],
});

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Sin `cover` todos los env(safe-area-inset-*) valen 0 en iOS: con la barra
  // de estado translúcida de la PWA, lo que se ancla arriba (selector de
  // marca, avatar) quedaba bajo el notch.
  viewportFit: 'cover',
  // Las páginas públicas son siempre oscuras. En el dashboard con tema claro,
  // THEME_BOOT_SCRIPT y ThemeProvider cambian este color al del fondo claro.
  themeColor: '#08080A',
};

const BASE_URL = 'https://www.kefy.app';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;

  const c = commonCopy[(lang as 'es' | 'en')] ?? commonCopy.es;
  const { title, description, keywords } = c.metadata;

  return {
    title,
    description,
    keywords,
    applicationName: 'Kefy',
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      title: 'Kefy',
      statusBarStyle: 'black-translucent',
    },
    authors: [{ name: 'Kefy', url: BASE_URL }],
    creator: 'Kefy',
    publisher: 'Kefy',
    metadataBase: new URL(BASE_URL),
    // Sin og:url aquí: lo heredaban todas las páginas y Facebook atribuía
    // cualquier link compartido a la home. La imagen la genera
    // app/[lang]/opengraph-image.tsx (antes apuntaba a /og-image.png, que no
    // existía, y Meta mostraba los links sin imagen).
    ...shareMetadata(lang, { title, description }),
    // Sin `alternates` aquí: el layout lo heredaban todas las páginas, así que
    // precios, blog y legales declaraban la home como canónica. Cada página
    // que se indexa define la suya (la home en app/[lang]/page.tsx).
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    icons: {
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
      icon: [
        { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      ],
    },
  };
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  // suppressHydrationWarning: el script de tema cambia data-theme y clases
  // antes de hidratar.
  return (
    <html lang={toLocale(lang)} suppressHydrationWarning>
      <head>
        {/* Fija data-theme antes de pintar: sin esto, quien usa el tema claro
            veía un destello oscuro en cada carga del dashboard. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <PwaUpdater />
        <div className={`${syne.variable} ${dmSans.variable}`}>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}
