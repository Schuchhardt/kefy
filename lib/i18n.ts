import type { Locale } from '@/types/i18n';

export const locales = ['es', 'en'] as const satisfies readonly Locale[];
export const defaultLocale: Locale = 'es';

export function isValidLocale(l: string): l is Locale {
  return locales.includes(l as Locale);
}
