export const locales = ['es', 'en'] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = 'es';

export function isValidLocale(l: string): l is Locale {
  return locales.includes(l as Locale);
}
