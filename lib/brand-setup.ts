// ─── «Completa tu marca»: grupos del Brand Kit y cuánto falta ────────────────
//
// El wizard de marca tenía 20 pasos de una pregunta cada uno, sin «Terminar
// más tarde» y sin forma de retomarlo: desaparecía del home en cuanto la
// cuenta dejaba de ser nueva (docs/auditoria-ux.md §4.1 y §5.6). Ahora son 5
// pantallas con los campos agrupados, y esto dice qué tiene rellenado cada
// una. Lo usan el wizard (para retomar en la primera pantalla incompleta), el
// aviso de Mi marca y la lista de bienvenida del home.
//
// Sin dependencias de servidor: lo importan componentes de cliente.

import type { BrandKit } from '@/types/brand-kit';

export type BrandSetupGroupId = 'business' | 'voice' | 'look' | 'audience' | 'difference';

export interface BrandSetupGroup {
  id: BrandSetupGroupId;
  /** Campos que edita la pantalla, en orden. */
  fields: (keyof BrandKit)[];
  /** Los que cuentan para decir que la pantalla está completa. */
  core: (keyof BrandKit)[];
}

export const BRAND_SETUP_GROUPS: readonly BrandSetupGroup[] = [
  {
    id: 'business',
    fields: ['name', 'website_url', 'mission', 'industry', 'social_urls'],
    core: ['name', 'mission', 'industry'],
  },
  {
    id: 'voice',
    fields: ['tone', 'communication_style', 'uses_emojis', 'language', 'tagline'],
    core: ['tone', 'communication_style'],
  },
  {
    id: 'look',
    fields: ['primary_color', 'secondary_color', 'accent_color', 'font_heading', 'font_body', 'logo_url'],
    core: ['primary_color', 'font_heading', 'logo_url'],
  },
  {
    id: 'audience',
    fields: ['target_audience', 'niche', 'customer_locations', 'company_size'],
    core: ['target_audience', 'niche', 'customer_locations'],
  },
  {
    id: 'difference',
    fields: ['differentiators', 'competitors', 'challenges', 'notes'],
    core: ['differentiators', 'competitors'],
  },
];

/** Nombre que la base pone por defecto al kit: no cuenta como rellenado. */
const DEFAULT_KIT_NAME = 'Mi marca';

/** true si el valor dice algo (texto no vacío, lista o mapa con elementos). */
export function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value as object).some((v) => isFilled(v));
  return true;
}

function fieldFilled(kit: Partial<BrandKit>, field: keyof BrandKit): boolean {
  const value = kit[field];
  if (field === 'name') return isFilled(value) && String(value).trim() !== DEFAULT_KIT_NAME;
  return isFilled(value);
}

export interface BrandCompleteness {
  /** Campos «core» rellenados, sobre el total. */
  filled: number;
  total: number;
  percent: number;
  /** Grupos con algún campo «core» vacío, en orden. */
  incomplete: BrandSetupGroupId[];
  complete: boolean;
}

export function brandCompleteness(kit: Partial<BrandKit> | null | undefined): BrandCompleteness {
  const k = kit ?? {};
  let filled = 0;
  let total = 0;
  const incomplete: BrandSetupGroupId[] = [];
  for (const group of BRAND_SETUP_GROUPS) {
    let groupDone = true;
    for (const field of group.core) {
      total += 1;
      if (fieldFilled(k, field)) filled += 1;
      else groupDone = false;
    }
    if (!groupDone) incomplete.push(group.id);
  }
  return {
    filled,
    total,
    percent: total === 0 ? 100 : Math.round((filled / total) * 100),
    incomplete,
    complete: incomplete.length === 0,
  };
}

/** Índice de la primera pantalla incompleta (0 si todo está completo). */
export function firstIncompleteGroup(kit: Partial<BrandKit> | null | undefined): number {
  const { incomplete } = brandCompleteness(kit);
  if (incomplete.length === 0) return 0;
  return BRAND_SETUP_GROUPS.findIndex((g) => g.id === incomplete[0]);
}
