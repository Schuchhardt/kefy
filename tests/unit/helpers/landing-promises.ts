// ─── Promesas sin producto detrás ────────────────────────────────────────────
//
// La auditoría UX (docs/auditoria-ux.md, 2.1) encontró la landing anunciando
// facturación anual con 20% de descuento (Stripe solo tiene precios
// mensuales), anuncios «con un clic» (no hay UI de ads), reportes white-label,
// migración gratuita, «Multiplicador de contenido», analytics básico/completo,
// Email como canal, «Meta Ads» como red conectable y un «plan gratuito» en los
// datos estructurados. Esta lista impide que vuelvan. La usan
// tests/unit/locales/parity.test.ts (home y precios) y
// tests/unit/lib/niches.test.ts (landings por rubro).

export const ANUNCIOS: [RegExp, string] = [/\bads\b|anuncio|\bboost\b|promocionar/i, 'anuncios pagados'];

export const PROMESAS_PROHIBIDAS: Array<[RegExp, string]> = [
  [/\d+\s*%\s*(off|dto|descuento)/i, 'descuento por pago anual'],
  [/white[- ]?label/i, 'reportes white-label'],
  [/multiplicador|multiplier/i, 'multiplicador de contenido'],
  [/migraci[oó]n|migration/i, 'migración desde otras plataformas'],
  [/analytics (b[aá]sico|completo)|(basic|full) analytics/i, 'niveles de analytics'],
  ANUNCIOS,
  [/plan gratuito|free plan|gratis para siempre|free forever/i, 'plan gratuito'],
];

/** Todos los textos de un objeto de copy (las funciones se ignoran). */
export function textos(valor: unknown): string[] {
  if (typeof valor === 'string') return [valor];
  if (Array.isArray(valor)) return valor.flatMap(textos);
  if (valor !== null && typeof valor === 'object') return Object.values(valor).flatMap(textos);
  return [];
}

/** Hallazgos legibles: «qué: «texto»». */
export function promesasEn(lista: string[], patrones = PROMESAS_PROHIBIDAS): string[] {
  return patrones.flatMap(([patron, que]) => lista.filter((t) => patron.test(t)).map((t) => `${que}: «${t}»`));
}
