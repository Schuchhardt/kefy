import { serializeJsonLd } from '@/lib/seo';

/** Datos estructurados de la página (schema.org). Ver lib/seo.ts. */
export default function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
