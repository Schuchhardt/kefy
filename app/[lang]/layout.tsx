import type { Metadata } from 'next';
import { Syne, DM_Sans, JetBrains_Mono } from 'next/font/google';
import '../globals.css';
import { locales } from '@/lib/i18n';

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  weight: ['600', '700', '800'],
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['300', '400', '500', '600'],
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  weight: ['400', '500'],
});

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

const BASE_URL = 'https://kefy.app';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;

  const isEs = lang === 'es';
  const title = isEs
    ? 'Kefy — Tu equipo de marketing en piloto automático'
    : 'Kefy — Your Marketing Team on Autopilot';
  const description = isEs
    ? 'Kefy unifica generación de texto, imagen, video, programación, analytics y ads en una sola plataforma para startups, pymes y tiendas online.'
    : 'Kefy unifies text, image, video generation, scheduling, analytics and ads in one platform for startups, SMBs and online stores.';
  const ogImage = `${BASE_URL}/og-image.png`;

  return {
    title,
    description,
    keywords: isEs
      ? ['marketing automation', 'creación de contenido', 'IA marketing', 'LATAM', 'startups', 'pymes', 'redes sociales', 'programación de contenido']
      : ['marketing automation', 'content creation', 'AI marketing', 'startups', 'SMB', 'social media scheduling'],
    authors: [{ name: 'Kefy', url: BASE_URL }],
    creator: 'Kefy',
    publisher: 'Kefy',
    metadataBase: new URL(BASE_URL),
    openGraph: {
      type: 'website',
      locale: isEs ? 'es_ES' : 'en_US',
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
    alternates: {
      canonical: `${BASE_URL}/${lang}`,
      languages: {
        es: `${BASE_URL}/es`,
        en: `${BASE_URL}/en`,
        'x-default': `${BASE_URL}/es`,
      },
    },
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
    <html
      lang={lang}
      className={`${syne.variable} ${dmSans.variable} ${jetbrains.variable}`}
    >
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="alternate" hrefLang="es" href={`${BASE_URL}/es`} />
        <link rel="alternate" hrefLang="en" href={`${BASE_URL}/en`} />
        <link rel="alternate" hrefLang="x-default" href={`${BASE_URL}/es`} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
