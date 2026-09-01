import type { MetadataRoute } from 'next';

// Se sirve en /manifest.webmanifest y lo referencia app/layout.tsx.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Kefy — Tu equipo de marketing en piloto automático',
    short_name: 'Kefy',
    description:
      'Kefy unifica generación de texto, imagen, video, programación y analytics en una sola plataforma.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#08080A',
    theme_color: '#08080A',
    categories: ['business', 'productivity', 'marketing'],
    icons: [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
