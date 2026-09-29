// ─── Metadatos de las pantallas de auth ──────────────────────────────────────
//
// Antes todas heredaban el título de la home («Kefy — …») y se indexaban,
// incluidas las de recuperar contraseña o aceptar una invitación, que solo
// sirven con un token en la URL. Ahora cada una tiene su título en su idioma y
// las que dependen de un token no se indexan.

import type { Metadata } from 'next';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

type AuthScreen = keyof typeof esAuth.meta;

/** Pantallas que no tienen sentido en un buscador. */
const NOINDEX: ReadonlySet<AuthScreen> = new Set(['forgot', 'reset', 'invitation', 'onboarding']);

export function authMetadata(lang: string, screen: AuthScreen): Metadata {
  const t = lang === 'en' ? enAuth : esAuth;
  return {
    title: `${t.meta[screen]} · Kefy`,
    robots: NOINDEX.has(screen) ? { index: false, follow: false } : { index: true, follow: true },
  };
}

/** Primer valor de un parámetro de búsqueda (`?a=1&a=2` → '1'). */
export function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
