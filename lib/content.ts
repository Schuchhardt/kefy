// Aggregates landing-page copy per locale. Types live in `@/types/locales`.

import esLanding from '@/locales/es/landing';
import enLanding from '@/locales/en/landing';
import type { KefyCopy } from '@/types/locales';

export const KEFY_COPY: Record<string, KefyCopy> = {
  es: esLanding,
  en: enLanding,
};
