import type { Metadata, Viewport } from 'next';
import PwaUpdater from '@/components/PwaUpdater';
import { THEME_BOOT_SCRIPT } from '@/lib/theme-boot';

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
  // Sin `cover` todos los env(safe-area-inset-*) valen 0 en iOS: con la barra
  // de estado translúcida de la PWA, lo que se ancla arriba (selector de
  // marca, avatar) quedaba bajo el notch.
  viewportFit: 'cover',
  // Las páginas públicas son siempre oscuras. En el dashboard con tema claro,
  // THEME_BOOT_SCRIPT y ThemeProvider cambian este color al del fondo claro.
  themeColor: '#08080A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // <html> y <body> los provee app/[lang]/layout.tsx con el lang correcto.
  // suppressHydrationWarning evita el error de Next.js por atributos que
  // cambian en el cliente (lang, clases de fuentes, data-theme).
  return (
    <html suppressHydrationWarning>
      <head>
        {/* Fija data-theme antes de pintar: sin esto, quien usa el tema claro
            veía un destello oscuro en cada carga del dashboard. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <PwaUpdater />
        {children}
      </body>
    </html>
  );
}
