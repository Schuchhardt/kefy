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

  return {
    title: isEs
      ? 'Kefy — Tu equipo de marketing en piloto automático'
      : 'Kefy — Your Marketing Team on Autopilot',
    description: isEs
      ? 'Kefy unifica generación de texto, imagen, video, programación, analytics y ads en una sola plataforma para startups, pymes y tiendas online.'
      : 'Kefy unifies text, image, video generation, scheduling, analytics and ads in one platform for startups, SMBs and online stores.',
    keywords: isEs
      ? 'marketing automation, content creation, AI marketing, LATAM'
      : 'marketing automation, content creation, AI marketing',
    openGraph: {
      type: 'website',
      locale: isEs ? 'es_ES' : 'en_US',
      siteName: 'Kefy',
      title: isEs
        ? 'Kefy — Tu equipo de marketing en piloto automático'
        : 'Kefy — Your Marketing Team on Autopilot',
      description: isEs
        ? 'Kefy unifica generación de texto, imagen, video, programación, analytics y ads en una sola plataforma para startups, pymes y tiendas online.'
        : 'Kefy unifies text, image, video generation, scheduling, analytics and ads in one platform for startups, SMBs and online stores.',
      url: `${BASE_URL}/${lang}`,
    },
    alternates: {
      canonical: `${BASE_URL}/${lang}`,
      languages: {
        es: `${BASE_URL}/es`,
        en: `${BASE_URL}/en`,
        'x-default': `${BASE_URL}/es`,
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
