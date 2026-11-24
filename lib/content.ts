// Aggregates landing-page copy per locale. Types live in `@/types/locales`.

import esLanding from '@/locales/es/landing';
import enLanding from '@/locales/en/landing';
import esNiches, { type NichesCopy } from '@/locales/es/niches';
import enNiches from '@/locales/en/niches';
import type { KefyCopy } from '@/types/locales';

export const KEFY_COPY: Record<string, KefyCopy> = {
  es: esLanding,
  en: enLanding,
};

/** Landings por rubro y las dos ofertas (servicio / plataforma). */
export function nichesCopy(lang: string): NichesCopy {
  return lang === 'en' ? enNiches : esNiches;
}
