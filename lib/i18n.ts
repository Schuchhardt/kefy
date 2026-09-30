import type { Locale } from '@/types/i18n';

export const locales = ['es', 'en'] as const satisfies readonly Locale[];
export const defaultLocale: Locale = 'es';

export function isValidLocale(l: string): l is Locale {
  return locales.includes(l as Locale);
}

/** Normaliza el `lang` de la ruta a un locale soportado (español por defecto). */
export function toLocale(lang: string | null | undefined): Locale {
  return lang === 'en' ? 'en' : 'es';
}
