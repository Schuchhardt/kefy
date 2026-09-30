import type { Metadata } from 'next';
import { Syne, DM_Sans } from 'next/font/google';
import '../globals.css';
import { locales } from '@/lib/i18n';
import SetLang from './SetLang';
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

const BASE_URL = 'https://www.kefy.app';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;

  const c = commonCopy[(lang as 'es' | 'en')] ?? commonCopy.es;
  const { title, description, keywords, ogLocale } = c.metadata;
  const ogImage = `${BASE_URL}/og-image.png`;

  return {
    title,
    description,
    keywords,
    authors: [{ name: 'Kefy', url: BASE_URL }],
    creator: 'Kefy',
    publisher: 'Kefy',
    metadataBase: new URL(BASE_URL),
    openGraph: {
      type: 'website',
      locale: ogLocale,
      siteName: 'Kefy',
      title,
      description,
      url: `${BASE_URL}/${lang}`,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
      creator: '@kefyapp',
      site: '@kefyapp',
    },
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

  return (
    <div className={`${syne.variable} ${dmSans.variable}`}>
      <SetLang lang={lang} />
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </div>
  );
}
