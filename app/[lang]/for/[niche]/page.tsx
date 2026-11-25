import type { Metadata } from 'next';
import {
  NICHE_SEGMENT, nicheMetadata, nicheStaticParams, renderNichePage, type NicheRouteParams,
} from '@/components/landing/niche-route';

// Industry landing in English: /en/for/dental-clinics…
// Same page as app/[lang]/para/[niche] (/es/para/clinicas-dentales).
// See docs/landings-por-rubro.md.

export function generateStaticParams(): NicheRouteParams[] {
  return nicheStaticParams('en');
}

export async function generateMetadata({ params }: { params: Promise<NicheRouteParams> }): Promise<Metadata> {
  return nicheMetadata(await params);
}

export default async function NichePage({ params }: { params: Promise<NicheRouteParams> }) {
  return renderNichePage(await params, NICHE_SEGMENT.en);
}
