import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Las vistas previas de marcas demo son privadas (link con token).
        disallow: ['/api/', '/es/demo/', '/en/demo/'],
      },
    ],
    sitemap: 'https://www.kefy.app/sitemap.xml',
  };
}
