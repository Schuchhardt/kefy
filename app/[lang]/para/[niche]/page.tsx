import type { Metadata } from 'next';
import {
  NICHE_SEGMENT, nicheMetadata, nicheStaticParams, renderNichePage, type NicheRouteParams,
} from '@/components/landing/niche-route';

// Landing de un rubro en español: /es/para/clinicas-dentales…
// La versión en inglés es app/[lang]/for/[niche] (/en/for/dental-clinics).
// Ver docs/landings-por-rubro.md.

export function generateStaticParams(): NicheRouteParams[] {
  return nicheStaticParams('es');
}

export async function generateMetadata({ params }: { params: Promise<NicheRouteParams> }): Promise<Metadata> {
  return nicheMetadata(await params);
}

export default async function NichePage({ params }: { params: Promise<NicheRouteParams> }) {
  return renderNichePage(await params, NICHE_SEGMENT.es);
}
