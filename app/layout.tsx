import type { Metadata, Viewport } from 'next';
import PwaUpdater from '@/components/PwaUpdater';

export const metadata: Metadata = {
  applicationName: 'Kefy',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Kefy',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // La app arranca siempre en tema oscuro (ver ThemeProvider).
  themeColor: '#08080A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // <html> y <body> los provee app/[lang]/layout.tsx con el lang correcto.
  // suppressHydrationWarning evita el error de Next.js por atributos que
  // cambian en el cliente (lang, clases de fuentes).
  return (
    <html suppressHydrationWarning>
      <body suppressHydrationWarning>
        <PwaUpdater />
        {children}
      </body>
    </html>
  );
}
